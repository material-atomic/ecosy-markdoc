---
title: Cors
description: Handle CORS preflight and inject cross-origin response headers
order: 5
---

# Cors

The Cors plugin handles CORS preflight requests and injects `Access-Control-Allow-*` headers on regular responses. It works for both trivially-permissive APIs (`origin: "*"`) and strict allowlists with cookies.

## Setup

```typescript
import { markdoc, Cors } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Cors({
      origin: ["https://app.example.com"],
      credentials: true,
    }),
  ],
});

export default app;
```

## How it works

Cors uses two plugin lifecycle hooks:

1. **`beginRequest`** — intercepts `OPTIONS` preflight requests (requests with `Origin` and `Access-Control-Request-Method` headers). Responds with `204 No Content` and the appropriate `Access-Control-Allow-*` headers, short-circuiting before the router sees the request.

2. **`endRequest`** — for regular (non-preflight) requests carrying an `Origin` header, injects CORS headers into the response produced by the main handler. Runs after every successful response.

Same-origin requests (no `Origin` header) pass through untouched.

## Origin policies

The `origin` option accepts three forms:

### `"*"` — any origin

```typescript
Cors({ origin: "*" })
```

Allows any cross-origin request. `credentials` must be `false` (or omitted) — browsers refuse the combination of `*` and credentials.

Use for:

- Public APIs with no authentication
- Static asset servers
- Read-only content

### `string[]` — exact allowlist

```typescript
Cors({
  origin: ["https://app.example.com", "https://admin.example.com"],
  credentials: true,
})
```

Exact match on the `Origin` header. Common for known-set-of-clients scenarios (first-party front-ends).

### `(origin, req) => boolean` — dynamic predicate

```typescript
Cors({
  origin: (origin) => /^https:\/\/([a-z-]+\.)?trusted\.io$/.test(origin),
  credentials: true,
})
```

Runtime check. The predicate receives the `Origin` value and the request, so you can combine regex matching with per-request policy (e.g., allow list from database, feature flags).

## Credentials

```typescript
Cors({
  origin: ["https://app.example.com"],
  credentials: true,
})
```

When `true`, the plugin sets `Access-Control-Allow-Credentials: true` on both preflight and response. Browsers then include cookies, HTTP auth, and client certificates on cross-origin requests.

**Constraints when `credentials: true`**:

- `origin` cannot be `"*"` — the plugin throws at setup.
- The browser-side request must explicitly opt in with `credentials: "include"` in `fetch()` / `xhr.withCredentials = true`.
- The reflected `Access-Control-Allow-Origin` is the exact origin, never `*`.

## Methods and headers

```typescript
Cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  headers: ["Content-Type", "Authorization", "X-Request-Id"],
})
```

- **`methods`** — advertised in `Access-Control-Allow-Methods` on preflight. Defaults to a permissive set: `GET HEAD POST PUT DELETE PATCH OPTIONS`.
- **`headers`** — advertised in `Access-Control-Allow-Headers` on preflight. When omitted, the plugin reflects the value of the preflight's `Access-Control-Request-Headers` — matches whatever the client asks for.

## Expose headers

By default, browsers only expose a handful of safelisted response headers (`Cache-Control`, `Content-Language`, `Content-Type`, `Expires`, `Last-Modified`, `Pragma`) to client-side JavaScript. To expose additional headers (like pagination or rate-limit info):

```typescript
Cors({
  origin: "*",
  exposeHeaders: ["X-Total-Count", "X-Page", "X-RateLimit-Remaining"],
})
```

## Preflight cache

```typescript
Cors({
  origin: "*",
  maxAge: 3600,  // 1 hour
})
```

Sent as `Access-Control-Max-Age`. Browsers cache the preflight response for this many seconds and skip re-asking. Default `86400` (24 hours). Shorter values during development help you iterate on CORS config without fighting browser cache.

## Vary headers

The plugin automatically appends `Vary: Origin` (and `Vary: Access-Control-Request-Method`, `Vary: Access-Control-Request-Headers` on preflight). This tells shared caches that the response varies based on CORS context and prevents cross-origin leaks via cached responses.

## Configuration types

```typescript
interface CorsOptions {
  origin: CorsOrigin;              // required
  methods?: string[];              // default all common verbs
  headers?: string[];              // default reflect request
  exposeHeaders?: string[];        // default none
  credentials?: boolean;           // default false
  maxAge?: number;                 // default 86400 (24h)
}

type CorsOrigin =
  | "*"
  | string[]
  | ((origin: string, req: MarkdocRequest) => boolean);
```

## Composition with other plugins

Cors coexists cleanly with `Authen`. Order matters for `beginRequest` — plugins are invoked in registration order:

```typescript
plugins: [
  Cors({ origin: ["https://app.example.com"], credentials: true }),
  Authen({ verify, onUnauthorized: "/login" }),
]
```

Here Cors runs first. If the request is a preflight, Cors short-circuits with `204` before `Authen` sees it — correct behavior (preflight must never be gated). For regular requests, Cors' `beginRequest` returns `null`, and `Authen` checks the JWT.

If the order were reversed, `Authen` would block preflight `OPTIONS` requests as unauthenticated — browsers would fail CORS and the API becomes unusable.

**Rule of thumb**: register `Cors` before any authentication or rate-limiting plugin.

## Exports

```typescript
import {
  Cors,
  type CorsOptions,
  type CorsOrigin,
} from "@ecosy/markdoc";
```

`Cors` is a factory function. Pass the result (the class) into `plugins[]`:

```typescript
plugins: [Cors({ origin: "*" })]
```
