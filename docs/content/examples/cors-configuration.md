---
title: CORS Configuration for Multi-Origin APIs
description: Allowlist multiple origins, credentialed requests, preflight handling, and exposed response headers.
order: 9
---

# CORS Configuration for Multi-Origin APIs

The `Cors` plugin handles preflight (`OPTIONS`) responses and injects `Access-Control-Allow-*` headers on regular responses. Split across two lifecycle hooks — `beginRequest` for preflight short-circuit, `endRequest` for header injection on everything else.

## What you'll build

A config that:

- Allows two production origins + a staging preview domain
- Allows cookies (`credentials: true`)
- Exposes custom response headers so client-side JS can read them
- Caches preflight for 1 hour

## Code

```typescript
import markdoc, { Cors } from "@ecosy/markdoc";

export default markdoc({
  repo: "your-org/your-docs-repo",

  plugins: [
    Cors({
      // Exact allowlist — only these origins are accepted
      origin: [
        "https://app.example.com",
        "https://admin.example.com",
        "https://preview.example.com",
      ],

      // HTTP methods the resource accepts
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],

      // Response headers client-side JS is allowed to read
      exposeHeaders: ["X-Total-Count", "X-Request-Id"],

      // Send cookies / Authorization / TLS certs
      credentials: true,

      // Cache preflight for 1 hour — browsers stop hitting OPTIONS repeatedly
      maxAge: 3600,
    }),
  ],
});
```

## Dynamic origin allowlist

For pattern-based allowlists (every subdomain of `trusted.io`):

```typescript
Cors({
  origin: (origin, req) => /\.trusted\.io$/.test(origin),
  credentials: true,
})
```

The function receives the incoming `Origin` header + the `MarkdocRequest` so you can combine checks (e.g. IP-based + origin-based).

## Open to anyone (no credentials)

```typescript
Cors({ origin: "*" })
```

Works for public APIs. Note: browsers **reject** `credentials: true` with `origin: "*"` — the factory throws at startup if you try.

## What happens on the wire

**Preflight request** (browser sends this first for non-simple requests):

```
OPTIONS /api/data
Origin: https://app.example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type, authorization
```

`Cors.beginRequest` matches, short-circuits with:

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: content-type, authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 3600
Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers
```

The router never sees the OPTIONS request — it's fully handled by the plugin.

**Actual request** (after preflight passes):

```
POST /api/data
Origin: https://app.example.com
Content-Type: application/json
...
```

The router handles it normally. `Cors.endRequest` appends:

```
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Credentials: true
Access-Control-Expose-Headers: X-Total-Count, X-Request-Id
Vary: Origin
```

## Stacking with Authen

Register `Cors` **before** `Authen`. Preflight requests don't carry cookies, so `Authen` would reject them — `Cors` needs to short-circuit first.

```typescript
plugins: [
  Cors({ origin: [...] }),    // responds to preflight
  Authen({ ... }),             // gates the actual request
  // ... other plugins
]
```

## Pitfalls

- **`credentials: true` + `origin: "*"` throws** at factory time. Use an explicit allowlist or a predicate.
- **Missing `exposeHeaders`** — client-side JS can't read custom headers (e.g. pagination counts) without this. The browser silently hides them otherwise.
- **Allowing too much via predicate** — `(origin) => true` is functionally identical to `"*"` but bypasses the `credentials` check. Don't.
- **Vary header stacking** — `Cors` appends `Vary: Origin`. If you have a CDN in front caching responses, this is critical or else one user's cached response with `Access-Control-Allow-Origin: A` gets served to a different origin B.

## Next steps

- [Authentication with JWT](/examples/authentication-jwt) — stack Cors + Authen together
- [Cloudflare Workers deployment](/examples/cloudflare-workers-minimal) — Cors works on Workers without extra config
