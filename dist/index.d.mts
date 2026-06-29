type ResourceKind = "value-receipt" | "custom-view";
type TokenTransport = "postMessage" | "url";
interface RenderOptions {
    /** Element or selector into which the iframe will be mounted. */
    el: HTMLElement | string;
    /** The Paid app base URL, e.g. "https://app.paid.com". */
    baseUrl: string;
    /** Kind of resource to render. */
    kind: ResourceKind;
    /** Resource identifier: for value-receipt, the publicUrlToken; for custom-view, the displayId. */
    token: string;
    /** Signed JWT minted server-side. Pass even if the resource is published — harmless. */
    jwt?: string;
    /**
     * Async source for the JWT. If provided, the SDK calls it for the initial
     * token and again whenever the token expires (instead of you wiring
     * onTokenExpired + updateToken). Takes precedence over `jwt`.
     */
    getToken?: () => string | Promise<string>;
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
interface EmbedHandle {
    /** Remove the iframe and tear down listeners. */
    destroy(): void;
    /** Expose the underlying iframe in case the host needs to touch it directly. */
    iframe: HTMLIFrameElement;
    /** Push a fresh JWT to the iframe (e.g. after onTokenExpired fires). */
    updateToken(jwt: string): void;
}
interface ValueReceiptRenderOptions extends Omit<RenderOptions, "kind"> {
}
declare function renderValueReceipt(opts: ValueReceiptRenderOptions): EmbedHandle;
interface CustomViewRenderOptions extends Omit<RenderOptions, "kind"> {
}
declare function renderCustomView(opts: CustomViewRenderOptions): EmbedHandle;
declare function mountDeclarative(baseUrl: string): EmbedHandle[];

export { type CustomViewRenderOptions, type EmbedHandle, type RenderOptions, type ResourceKind, type TokenTransport, type ValueReceiptRenderOptions, mountDeclarative, renderCustomView, renderValueReceipt };
