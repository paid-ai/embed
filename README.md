# @paid-ai/embed

Browser SDK for embedding publicly-shareable Paid resources in a host app.

## Install

```bash
npm install @paid-ai/embed
```

Or drop the IIFE bundle into a `<script>` tag and use the global `PaidEmbed`.

## Quick start — value receipt

Host your JWT minting on your backend (the signing secret comes from rotating it in the Paid settings UI).

```js
import { renderValueReceipt } from "@paid-ai/embed";

// JWT is signed server-side; the SDK passes it to the iframe via postMessage.
const jwt = await fetch("/api/paid/mint-token", { method: "POST" }).then((r) =>
  r.text(),
);

renderValueReceipt({
  el: "#paid-vr",
  baseUrl: "https://app.paid.com",
  token: valueReceiptPublicUrlToken, // from your database / Paid webhook
  jwt,
});
```

## Rendering the latest VR for a customer

Mint a customer-scoped JWT (JWT with `sub` set to the customer id, and no
`resourceId` claim), then resolve the freshest VR server-side via the REST
API and pass its `publicUrlToken` to `renderValueReceipt`:

```js
// server (your backend, with your Paid API key)
const { data } = await fetch(
  `${API_BASE}/api/v2/value-receipts?customerId=c_123&limit=1`,
  { headers: { Authorization: `Bearer ${PAID_API_KEY}` } },
).then((r) => r.json());
const token = data[0]?.publicUrlToken;

// browser
renderValueReceipt({
  el: "#paid-vr",
  baseUrl: "https://app.paid.com",
  token,
  jwt, // customer-scoped, sub=c_123
});
```

## Declarative mode

```html
<script src="https://cdn.paid.com/paid-embed.iife.js"></script>
<div
  data-paid-embed
  data-kind="value-receipt"
  data-token="<publicUrlToken>"
  data-jwt="<jwt>"
></div>
<script>
  PaidEmbed.mountDeclarative("https://app.paid.com");
</script>
```

## Token transports

Default: `postMessage`. The iframe src is JWT-free; the SDK responds to a
`ready` message with the token. This keeps the JWT out of the URL, history,
and Referer.

Fallback: `tokenTransport: "url"`. The JWT is appended as `?token=` on the
iframe src. Use only when you control neither the iframe nor its parent
scripting environment (e.g. plain HTML emails — though even there, direct
share URLs work equally well).

## License

MIT
