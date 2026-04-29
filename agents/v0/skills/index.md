# @ecosy/markdoc — Architecture Guide

## Overview

`@ecosy/markdoc` is a headless markdown documentation runtime built for edge environments. It treats a GitHub repository as the content source, fetches raw files through the jsDelivr CDN at request time, and renders responses using a pluggable template + component pipeline. The framework is deliberately minimal: one `markdoc()` factory call returns an edge-server app (`{ fetch }`), and every extension point goes through a small, typed plugin API.

## The Mental Model

A Markdoc app has three layers:

```
                  ┌──────────────────────────┐
                  │        Request           │
                  └────────────┬─────────────┘
                               │
       beginRequest  ─────────▼─────────    (plugin guard chain)
                               │
                        ┌──────┴───────┐
                        │   Router     │
                        └──────┬───────┘
                               │
             ┌─────────────────┼──────────────────┐
             ▼                 ▼                  ▼
        plugin.fetch     page handler        static asset
             │                 │                  │
             └─────────────────┼──────────────────┘
                               │
        endRequest  ─────────▼─────────    (plugin transform chain)
                               │
                  ┌────────────▼─────────────┐
                  │        Response          │
                  └──────────────────────────┘
```

1. **Runtime** — `Runtimable` composes all core classables (`Configuration`, `Repo`, `Documentation`, `Fetchable`, `Manifest`, `Engine`, `Pagable`, `Pluginable`, `Server`) via `Injectable`. The runtime is built once and reused across requests.
2. **Request handling** — the `Server` receives a `Request`, resolves the `Pluginable` for the current request, dispatches the `beginRequest` chain, routes through `Router` + `Manifest`, invokes the page handler or a plugin's `fetch`, and walks the `endRequest` chain before returning the `Response`.
3. **Content rendering** — pages are fetched from GitHub via jsDelivr, parsed into tag trees, rendered by `Engine` using component templates and a root `Layout`, and cached by `Pagable`.

## Core Concepts

### 1. `markdoc()` — Entry point

```typescript
import markdoc from "@ecosy/markdoc";

const app = markdoc({
  repo: "owner/repo",
  branch: "main",
  dir: "docs",
  revalidate: 60_000,
  plugins: [/* ... */],
  imports: {/* ... */},
});

export default { fetch: app.fetch };
```

Returns an object with a single WinterCG `fetch(request)` method. Deploy to Cloudflare Workers by re-exporting it as the module default; use the Node adapter on long-running servers.

### 2. Plugins — URL, template, component contributions

A plugin is a class that extends `Plugin` and returns a `PluginRegistry` from `getRegistry()`. Three extension slots:

```typescript
class RobotsPlugin extends Plugin {
  getRegistry(): PluginRegistry {
    return {
      urls:       { "/robots.txt": { method: "GET" } },
      template:   { root: "_template.html" },
      components: { card: "<div class='card'>{{ body }}</div>" },
    };
  }

  async fetch(req, res) { return res.text("User-agent: *\nAllow: /"); }
  async getTemplate(name) { return "<!DOCTYPE html>..."; }
  async beginRequest(req, res) { return null; }
  endRequest(req, res, response) { return response; }
}
```

Plugins are always produced by a factory function annotated with `: PluginConstructor` (or a subtype). Consumers pass options to the factory and push the result into `plugins: [...]`.

### 3. Imports — Runtime-wide services

Imports run once per runtime, not per request. They extend the runtime itself — analytics buffers, connection pools, custom parsers, replacement engines. They have no access to the request lifecycle; anything that needs to react to traffic belongs in `plugins` instead. Imports are passed as key/value pairs through the `imports` option:

```typescript
markdoc({
  imports: {
    analytics: AnalyticsBuffer,
  },
});
```

Reserved keys (`configuration`, `repo`, `documentation`, `manifest`, `pagable`, `pluginable`, `server`, `fetchable`) cannot be overridden. `engine` can.

### 4. Manifest — The content tree

`Manifest` resolves request pathnames to markdown sources. A manifest is a JSON file (`_manifest.json`) that lists page paths and optional sub-manifests; the runtime fetches it once per `revalidate` window and resolves each URL against it. No filesystem. No git clone.

```typescript
// Markdoc calls this internally; plugins/imports can also call it.
const result = await this.manifest.resolve("/guides/intro");
if (!result.found) return res.status(404).text("Not found");
const markdown = await fetchMarkdown(result.contentUrl);
```

### 5. Engine — Component templates + tag rendering

`Engine` holds a map of component templates (`components/card.html`, etc.) fetched from the CDN. It walks the Markdoc tag tree, substitutes `{{ key }}` placeholders with tag attributes/body, and emits HTML. Plugins can contribute inline component definitions through the `components` entry of `PluginRegistry`.

### 6. Layout — The page wrapper

`Layout` is a first-class plugin that provides the root HTML document. It registers `template: { root: true }` so the server knows it is the layout. The template can come from:

- Inline string or function (highest priority)
- CDN file (`_template.md` by default, or a custom `path`)
- Built-in fallback (minimal docs-style HTML)

Templates support `{{ key }}` interpolation for static payload and `${store => ...}` expressions via the `html` tagged literal for store-reactive content.

### 7. Plugin Lifecycle — `start` / `beginRequest` / `endRequest`

Three cross-cutting hooks complement `fetch`:

- **`start()`** runs once per plugin instance, on the first request that resolves the plugin. Awaited before the request pipeline proceeds — the first request pays the bootstrap cost. Used by `AutoInvalidate` to kick its `setInterval` only after the runtime is live.
- **`beginRequest(req, res)`** runs before routing. Returning a `Response` short-circuits; returning `null` continues. Used by `Authen`, `Cors` (preflight), rate limiting, maintenance banners, `AutoInvalidate` (lazy tick check).
- **`endRequest(req, res, response)`** runs after a response is produced. Each plugin receives the previous plugin's output; used by `Cors` (header injection), compression, security headers, metrics.

Plugins that use only lifecycle hooks return an empty registry.

### 8. Node.js Adapter — `@ecosy/markdoc/nodejs`

The runtime is WinterCG-native. To run on Node.js, wrap the app with the adapter:

```typescript
import { server } from "@ecosy/markdoc/nodejs";
server(app, { port: 3000 }).start();
```

The adapter bridges Node's `IncomingMessage`/`ServerResponse` to Web `Request`/`Response`, survives HMR by storing the running server on `globalThis` via `Symbol.for`, and exposes `start` / `stop`.

## Skill Reading Order

When learning Markdoc or building on top of it, read skills in this order:

1. `markdoc-runtime` — the `markdoc()` factory, configuration, request flow.
2. `markdoc-plugin-system` — the `Plugin` base class, the registry, the lifecycle hooks.
3. `markdoc-plugins-builtin` — the eight shipped plugins (`Authen`, `AutoInvalidate`, `Cors`, `Layout`, `Markdash`, `RobotsTxt`, `RSSFeed`, `Sitemap`).
4. `markdoc-imports` — runtime-wide services, custom imports.
5. `markdoc-manifest` — manifest tree resolution, sub-manifests, revalidation.
6. `markdoc-engine` — component templates, tag rendering, `{{ key }}` interpolation.
7. `markdoc-layout` — the root layout plugin, path vs inline templates, `html` tagged literal.
8. `markdoc-nodejs-adapter` — Node HTTP bridging, HMR, start/stop lifecycle.
9. `markdoc-project-example` — end-to-end wiring across Cloudflare Workers and Node.js deployments.

## Real-World Pattern

A typical Markdoc deployment looks like this:

```typescript
// app.ts
import markdoc, { html } from "@ecosy/markdoc";
import {
  Authen, AutoInvalidate, Cors, Layout,
  RobotsTxt, Sitemap, RSSFeed, Markdash,
} from "@ecosy/markdoc/plugins";
import * as jose from "jose";

export default markdoc({
  repo: "material-atomic/ecosy-docs",
  branch: "main",
  dir: "content",
  revalidate: 5 * 60_000,

  plugins: [
    Cors({ origin: "*" }),
    Authen({
      cookieName: "ecosy_session",
      verify: async (jwt) => {
        try { await jose.jwtVerify(jwt, SECRET); return true; }
        catch { return false; }
      },
      onUnauthorized: "/login",
      publicPaths: ["/login", "/register", "/healthz"],
    }),

    Layout({
      template: { root: true },
      getTemplate: html`
        <!DOCTYPE html>
        <html>
          <head><title>{{ scope.title }}</title></head>
          <body>
            <nav>${(store) => store.getState().pages
              .map(([title, url]) => `<a href="${url}">${title}</a>`)
              .join("")}
            </nav>
            <main>{{ body.main }}</main>
          </body>
        </html>
      `,
    }),

    RobotsTxt(),
    Sitemap,
    RSSFeed({
      title: "Ecosy Docs",
      description: "Latest documentation updates",
      link: "https://docs.ecosy.io",
      items: async (req) => fetchRecentPages(req.mdUrl.origin),
    }),

    Markdash({ prefix: "_ops/dash" }), // dev-only cache dashboard

    AutoInvalidate({
      interval: 5 * 60_000,
      targets: ["manifest", "pages"],
    }),
  ],
});
```
