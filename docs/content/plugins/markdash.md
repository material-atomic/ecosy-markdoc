---
title: Markdash
description: Developer dashboard for invalidating Markdoc caches from the browser
order: 7
---

# Markdash

The Markdash plugin exposes a small dashboard UI that lets developers invalidate Markdoc caches (manifest, engine components, page cache) from the browser. Useful during local development or on staging environments where content changes frequently and you want to force a refresh without restarting the server.

## Setup

```typescript
import { markdoc, Markdash } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Markdash(),
  ],
});
```

By default the dashboard is mounted at `GET /_markdash`.

## Custom prefix

Mount the dashboard under a different URL by passing a prefix. No leading or trailing slashes — the plugin normalizes the value internally.

```typescript
Markdash({ prefix: "_ops/dash" })   // → /_ops/dash
Markdash({ prefix: "admin/cache" }) // → /admin/cache
```

The prefix scopes **all** Markdash routes, so the action endpoints become `POST /<prefix>/reload/manifest`, etc.

## Security — always gate in production

Markdash lets any caller invalidate server-wide caches. **Do not ship it unprotected** to a public domain. Combine with [Authen](/plugins/authen) or a `beginRequest` middleware that restricts access to developer accounts.

```typescript
plugins: [
  Authen({
    verify,
    onUnauthorized: "/login",
    publicPaths: ["/login", "/auth/login"],
  }),
  Markdash({ prefix: "_ops/dash" }),
]
```

Because Markdash paths are not in `publicPaths`, Authen gates them. Only authenticated users reach the dashboard and its endpoints.

For local-only use during development, you can also mount behind a hard-to-guess prefix or disable the plugin entirely in production:

```typescript
plugins: [
  ...(process.env.NODE_ENV === "production" ? [] : [Markdash()]),
]
```

## Endpoints

Markdash registers four routes:

### `GET /<prefix>` — dashboard UI

Returns an HTML page with per-cache cards and buttons. Uses inline CSS + `fetch` calls to the action endpoints — no external JS dependencies.

The page is marked `noindex, nofollow` via meta tag; search engines ignore it if they somehow discover the URL.

### `POST /<prefix>/reload/manifest`

Calls `manifest.reload()` which:

1. Clears the cached manifest tree and URL maps.
2. Re-fetches `_manifest.md` from the CDN and resolves all nested `_manifest.md` files recursively.
3. Returns the fresh `ManifestResult`.

Use after adding new pages / sub-manifests to the content directory. Response:

```json
{ "ok": true, "action": "reload-manifest" }
```

### `POST /<prefix>/reload/engine`

Calls `engine.reload()` which:

1. Clears all cached component HTML.
2. Resets the preload flag.
3. Re-fetches `_components/_manifest.md` and every listed component file from the CDN.

Use after editing shared component templates (`_components/*.html`). Response:

```json
{ "ok": true, "action": "reload-engine" }
```

### `POST /<prefix>/clear/pages`

Calls `pagable.clear()` which drops every cached page. The next request for any page re-fetches the markdown from the CDN and reparses frontmatter + body.

Use after editing page content (`foo.md`) when `revalidate` hasn't expired yet.

```json
{ "ok": true, "action": "clear-pages" }
```

## How it works

Markdash is a **global plugin** (`__global = true`) — the same instance is reused across requests, avoiding constructor overhead for each POST.

The plugin injects three runtime services via the DI container:

```typescript
constructor(
  ctx: RequestContext,
  store: StoreLike,
  private readonly manifest = Inject<ManifestLike>("manifest"),
  private readonly engine = Inject<EngineLike>("engine"),
  private readonly pagable = Inject<PagableLike>("pagable"),
) { super(ctx, store); }
```

`ManifestLike.reload()` and `EngineLike.reload()` are public interface methods — any classable can call them via DI, but they are not typically invoked outside cache-management plugins. `PagableLike.clear()` / `evict(path)` / `has(path)` were already part of the public Pagable contract.

Actions are dispatched in `fetch(req, res)` based on the request path + method. All errors are caught and returned as `500 { ok: false, error: "..." }` so the dashboard UI can display them.

## Configuration

```typescript
interface MarkdashOptions {
  prefix?: string;   // default "_markdash"
}
```

That is the entire public API. Future versions may add:

- Per-route access controls (e.g., per-user tokens)
- Selective invalidation (reload specific manifest sub-tree, evict single page)
- Live subscription to cache events via Server-Sent Events

## Client JS

The dashboard uses native `fetch` for action buttons — no external libraries. If you want to use `@ecosy/core/http` for consistency with your server-side code, you can fork the HTML template and swap the implementation. The core Markdash logic (server-side routes + cache methods) stays untouched.

## Exports

```typescript
import { Markdash, type MarkdashOptions } from "@ecosy/markdoc";
```

## See also

- [Authen](/plugins/authen) — gate Markdash behind authentication
- [Plugins](/plugins) — general plugin system
