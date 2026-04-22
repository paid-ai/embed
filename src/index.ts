// @paid-ai/embed — browser SDK for embedding publicly-shareable Paid resources.
//
// Today it renders value receipts; the internal primitive is generic so adding
// invoices or customer portal later is a 5-line wrapper + URL template.
//
// Design notes:
//  - Default token transport is postMessage: the iframe src carries NO jwt,
//    the SDK waits for the iframe's "ready" message, and then posts the token
//    back. This keeps tokens out of URL bars, browser history, and Referer.
//  - URL-param mode is available behind `tokenTransport: "url"` for cases
//    where the host page can't run script (rare — e.g. plain-HTML emails).
//  - The iframe reports its content height via postMessage so the embed
//    resizes without scrollbars.

export type ResourceKind = "value-receipt" | "customer-portal";

export type TokenTransport = "postMessage" | "url";

export interface RenderOptions {
  /** Element or selector into which the iframe will be mounted. */
  el: HTMLElement | string;
  /** The Paid app base URL, e.g. "https://app.paid.com". */
  baseUrl: string;
  /** Kind of resource to render. */
  kind: ResourceKind;
  /** Resource identifier: for value-receipt, the publicUrlToken. */
  token: string;
  /** Signed JWT minted server-side. Pass even if the resource is published — harmless. */
  jwt?: string;
  /** Transport for delivering the JWT to the iframe. Defaults to postMessage. */
  tokenTransport?: TokenTransport;
  /** Called when the iframe signals it is ready (postMessage handshake mode). */
  onReady?: () => void;
  /** Called when the iframe reports a new content height. */
  onResize?: (heightPx: number) => void;
  /** Called with any SDK-level error surfaced to the host. */
  onError?: (err: Error) => void;
  /**
   * Called when the embedded resource reports that the JWT has expired.
   * Use this to mint a fresh token and call `handle.updateToken(newJwt)`.
   */
  onTokenExpired?: () => void;
}

export interface EmbedHandle {
  /** Remove the iframe and tear down listeners. */
  destroy(): void;
  /** Expose the underlying iframe in case the host needs to touch it directly. */
  iframe: HTMLIFrameElement;
  /** Push a fresh JWT to the iframe (e.g. after onTokenExpired fires). */
  updateToken(jwt: string): void;
}

interface PublicPathConfig {
  // Builds the iframe src from a base URL and a token.
  buildUrl: (baseUrl: string, token: string, embed: boolean) => string;
}

const PUBLIC_PATHS: Record<ResourceKind, PublicPathConfig> = {
  "value-receipt": {
    buildUrl: (base, token, embed) =>
      `${base.replace(/\/$/, "")}/public/value-receipts/${encodeURIComponent(token)}${embed ? "?mode=embed" : ""}`,
  },
  "customer-portal": {
    buildUrl: (base, token, embed) =>
      `${base.replace(/\/$/, "")}/public/customers/${encodeURIComponent(token)}${embed ? "?mode=embed" : ""}`,
  },
};

function resolveEl(el: HTMLElement | string): HTMLElement {
  if (typeof el === "string") {
    const found = document.querySelector(el);
    if (!found) {
      throw new Error(`[paid-embed] element not found: ${el}`);
    }
    return found as HTMLElement;
  }
  return el;
}

function resolvePaidOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}

// Shared primitive — creates the iframe, wires postMessage handshake and
// resize reporting. Every public render* function is a thin wrapper around it.
function renderIframe(opts: RenderOptions): EmbedHandle {
  const container = resolveEl(opts.el);
  const path = PUBLIC_PATHS[opts.kind];
  if (!path) {
    throw new Error(`[paid-embed] unsupported kind: ${opts.kind}`);
  }
  const transport: TokenTransport = opts.tokenTransport ?? "postMessage";
  const paidOrigin = resolvePaidOrigin(opts.baseUrl);
  // We declare our origin in the iframe URL so the iframe can validate
  // postMessage exchanges against it. The iframe refuses to participate in
  // the token handshake without this param.
  const selfOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  // URL-param mode appends ?token= directly. postMessage mode keeps the src
  // token-free and only sets ?mode=embed (+ parent_origin) so the page knows
  // to run the handshake. See the public VR viewer.
  let src = path.buildUrl(
    opts.baseUrl,
    opts.token,
    true, // always embed mode — transport only affects how the JWT is delivered
  );
  if (selfOrigin) {
    const separator = src.includes("?") ? "&" : "?";
    src = `${src}${separator}parent_origin=${encodeURIComponent(selfOrigin)}`;
  }
  if (transport === "url" && opts.jwt) {
    const separator = src.includes("?") ? "&" : "?";
    src = `${src}${separator}token=${encodeURIComponent(opts.jwt)}`;
  }

  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.style.border = "0";
  iframe.style.width = "100%";
  iframe.style.display = "block";
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("allow", "clipboard-write; fullscreen");

  container.appendChild(iframe);

  const onMessage = (ev: MessageEvent) => {
    // Only listen to messages from the iframe we just mounted, from the Paid
    // origin. Anything else is not our concern (the page might host multiple
    // widgets, including non-Paid ones).
    if (ev.source !== iframe.contentWindow) return;
    if (ev.origin !== paidOrigin) return;
    const data = ev.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "paid-embed:ready") {
      opts.onReady?.();
      if (transport === "postMessage" && opts.jwt) {
        iframe.contentWindow?.postMessage(
          { type: "paid-embed:token", token: opts.jwt },
          paidOrigin,
        );
      }
      return;
    }
    if (data.type === "paid-embed:height" && typeof data.px === "number") {
      iframe.style.height = `${data.px}px`;
      opts.onResize?.(data.px);
      return;
    }
    if (data.type === "paid-embed:token-expired") {
      // If the host provided an onTokenExpired callback, let them handle it.
      // Otherwise, if the iframe reports a refreshUrl (configured in the org's
      // share auth settings), automatically fetch a fresh token from it.
      if (opts.onTokenExpired) {
        opts.onTokenExpired();
      } else if (typeof data.refreshUrl === "string" && data.refreshUrl) {
        fetch(data.refreshUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceId: opts.token }),
        })
          .then((r) =>
            r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)),
          )
          .then((body) => {
            if (typeof body?.token === "string") {
              iframe.contentWindow?.postMessage(
                { type: "paid-embed:token", token: body.token },
                paidOrigin,
              );
            }
          })
          .catch((err) =>
            opts.onError?.(err instanceof Error ? err : new Error(String(err))),
          );
      }
      return;
    }
  };
  window.addEventListener("message", onMessage);

  return {
    iframe,
    destroy() {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    },
    updateToken(jwt: string) {
      iframe.contentWindow?.postMessage(
        { type: "paid-embed:token", token: jwt },
        paidOrigin,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ValueReceiptRenderOptions
  extends Omit<RenderOptions, "kind"> {}

export function renderValueReceipt(
  opts: ValueReceiptRenderOptions,
): EmbedHandle {
  return renderIframe({ ...opts, kind: "value-receipt" });
}

export interface CustomerPortalRenderOptions
  extends Omit<RenderOptions, "kind"> {}

export function renderCustomerPortal(
  opts: CustomerPortalRenderOptions,
): EmbedHandle {
  return renderIframe({ ...opts, kind: "customer-portal" });
}

// ---------------------------------------------------------------------------
// Declarative mode — <div data-paid-embed data-kind="..." data-token="...">
//
// Iterates data-attribute marked elements at load and mounts them. Hosts that
// can't run framework code still get a drop-in embed just by adding a <script>
// tag and some HTML.
// ---------------------------------------------------------------------------

export function mountDeclarative(baseUrl: string): EmbedHandle[] {
  const handles: EmbedHandle[] = [];
  const nodes = document.querySelectorAll<HTMLElement>("[data-paid-embed]");
  nodes.forEach((node) => {
    const kind = node.dataset.kind as ResourceKind | undefined;
    const token = node.dataset.token;
    const jwt = node.dataset.jwt;
    const transport = node.dataset.transport as TokenTransport | undefined;
    if (!kind || !token) {
      console.warn(
        "[paid-embed] skipped element — missing data-kind or data-token",
        node,
      );
      return;
    }
    if (!PUBLIC_PATHS[kind]) {
      console.warn(`[paid-embed] kind "${kind}" is not yet supported`);
      return;
    }
    try {
      handles.push(
        renderIframe({
          el: node,
          baseUrl,
          kind,
          token,
          jwt,
          tokenTransport: transport ?? "postMessage",
        }),
      );
    } catch (err) {
      console.error("[paid-embed] failed to mount", err);
    }
  });
  return handles;
}
