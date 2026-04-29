# @ecosy/markdoc — Rules

These rules are absolute constraints when generating code with `@ecosy/markdoc`. Violations produce incorrect, unmaintainable, or runtime-broken output.

## Runtime Rules

### DO: Start a Markdoc app via the `markdoc()` factory
```typescript
// ✅ Correct — one factory call returns the edge-server app
import markdoc from "@ecosy/markdoc";

const app = markdoc({
  repo: "owner/repo",
  branch: "main",
  dir: "docs",
  plugins: [/* ... */],
  imports: {/* ... */},
});

export default { fetch: app.fetch };
```

### DON'T: Instantiate `Runtimable`, `Server`, or `Pluginable` directly
```typescript
// ❌ Wrong — bypasses configuration, manifest, engine wiring
import { Runtimable } from "@ecosy/markdoc";

const Runtime = Runtimable({ repo: "owner/repo" });
const runtime = new Runtime();
runtime.server.fetch(req); // Missing plugin resolution, teleport context, etc.
```

### DON'T: Reach for Node.js APIs from request handlers
```typescript
// ❌ Wrong — `fs`, `path`, `http` are not available on Cloudflare Workers
import fs from "node:fs";

Plugin({ fetch: () => fs.readFileSync("./docs/index.md") });
```

### DO: Use the explicit Node adapter when deploying on Node.js
```typescript
// ✅ Correct — bridges Node's http module to the WinterCG runtime
import markdoc from "@ecosy/markdoc";
import { server } from "@ecosy/markdoc/nodejs";

const app = markdoc({ repo: "owner/repo" });
server(app, { port: 3000 }).start();
```

## Plugin Rules

### DO: Subclass the `Plugin` base class inside a factory function
```typescript
// ✅ Correct — factory returns a PluginConstructor
import { Plugin, type PluginConstructor, type PluginRegistry } from "@ecosy/markdoc";

export function MyPlugin(options: MyOptions): PluginConstructor {
  return class extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return { urls: { "/my-endpoint": { method: "GET" } } };
    }

    async fetch(req, res) {
      return res.json({ ok: true });
    }
  };
}
```

### DON'T: Return a plain object with `fetch` from a plugin factory
```typescript
// ❌ Wrong — Pluginable expects a classable, not a handler object
export function MyPlugin() {
  return {
    fetch(req, res) { return res.json({ ok: true }); },
  };
}
```

### DON'T: Mutate the router, the engine, or the manifest from inside `fetch`
```typescript
// ❌ Wrong — plugins are request-scoped; mutation breaks other requests
class BadPlugin extends Plugin {
  async fetch(req, res) {
    this.ctx.engine.components.set("my-tag", "<div>hacked</div>"); // Don't.
    return res.text("ok");
  }
}
```

### DO: Use `beginRequest` for cross-cutting guards
```typescript
// ✅ Correct — short-circuit with a Response, or return null to continue
class AuthGuard extends Plugin {
  getRegistry() { return {}; }

  async beginRequest(req, res) {
    if (!req.cookie("token")) return new Response(null, { status: 401 });
    return null;
  }
}
```

### DO: Use `endRequest` for response header injection
```typescript
// ✅ Correct — chain transforms across plugins
class SecurityHeaders extends Plugin {
  getRegistry() { return {}; }

  endRequest(req, res, response) {
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  }
}
```

### DON'T: Mix guard logic and response handling in the same method
```typescript
// ❌ Wrong — auth rejection lives in beginRequest, not fetch
class BadAuth extends Plugin {
  async fetch(req, res) {
    if (!req.cookie("token")) return res.status(401).text("Unauthorized");
    // ...actual handler
  }
}
```

## Registry Rules

### DO: Return a `PluginRegistry` with paths starting from `/`
```typescript
// ✅ Correct
getRegistry(): PluginRegistry {
  return {
    urls: {
      "/robots.txt": { method: "GET" },
      "/feed.xml": { method: "GET" },
    },
  };
}
```

### DON'T: Register overlapping paths from multiple plugins
```typescript
// ❌ Wrong — Pluginable picks the first; the second is dead code
plugins: [
  Sitemap(),              // registers /sitemap.xml
  CustomSitemap(),        // also /sitemap.xml — never called
]
```

### DO: Declare plugin static flags at the top of the class
```typescript
// ✅ Correct — `__global` keeps a single instance across requests
return class extends Plugin {
  static readonly __global = true;
  // ...
};
```

## Imports Rules

### DO: Register runtime services via the `imports` map
```typescript
// ✅ Correct — long-lived runtime service that no plugin needs to consume per-request
import markdoc from "@ecosy/markdoc";
import { Analytics } from "./services/analytics";

markdoc({
  repo: "owner/repo",
  imports: {
    analytics: Analytics,
  },
});
```

### DO: Use the `AutoInvalidate` plugin for periodic cache invalidation
```typescript
// ✅ Correct — AutoInvalidate is a plugin, not an import; needs `beginRequest`
//   to drive ticks on edge runtimes where setInterval cannot persist.
import markdoc from "@ecosy/markdoc";
import { AutoInvalidate } from "@ecosy/markdoc/plugins";

markdoc({
  repo: "owner/repo",
  plugins: [
    AutoInvalidate({ interval: 5 * 60_000 }),
  ],
});
```

### DON'T: Put request handlers into `imports`
```typescript
// ❌ Wrong — imports are runtime-wide services, not per-request plugins
imports: {
  handler: class { fetch(req) { return new Response("nope"); } },
}
```

### DON'T: Override reserved runtime keys in `imports`
```typescript
// ❌ Wrong — `configuration`, `repo`, `manifest`, `pagable`, `pluginable`, `server`
// are reserved and cannot be replaced through imports.
imports: {
  configuration: MyCustomConfig,
}
```

## Manifest & Engine Rules

### DO: Trust the manifest as the source of truth for page paths
```typescript
// ✅ Correct — always resolve through manifest.resolve(path)
const result = await this.manifest.resolve(pathname);
if (!result.found) return res.status(404).text("Not found");
```

### DON'T: Hardcode content URLs bypassing `Documentation.getContentUrl()`
```typescript
// ❌ Wrong — breaks when provider/branch/dir changes
const url = `https://cdn.jsdelivr.net/gh/owner/repo@main/docs/index.md`;
```

### DO: Invalidate caches through the exposed methods
```typescript
// ✅ Correct — reload manifest/engine, clear pages
await this.manifest.reload();
await this.engine.reload();
this.pagable.clear();
```

### DON'T: Clear internal maps directly
```typescript
// ❌ Wrong — internal shape is not a public contract
(this.manifest as any).manifests.clear();
```

### DO: Clear the page cache after swapping provider / interpolate at runtime
```typescript
// ✅ Correct — pages were rendered against the previous content URL
this.documentation.configure({ provider: "https://raw.githubusercontent.com" });
this.pagable.clear();
```
The Markdash `enableSwitchSource` card does this for you. Custom tooling that calls `documentation.configure()` or `documentation.reset()` directly must pair it with `pagable.clear()` — otherwise cached pages continue to resolve against the old source.

### DON'T: Expose Markdash content-source endpoints without auth
```typescript
// ❌ Wrong — anyone on the internet can flip your CDN at runtime
Markdash({ prefix: "_ops/dash", enableSwitchSource: true })
```
Always gate Markdash (especially with `enableSwitchSource: true`) behind `Authen` or network-level ACLs in production. The dashboard can rewrite state that affects every request.

## Layout Rules

### DO: Register exactly one Layout plugin per app
```typescript
// ✅ Correct — `template: { root: true }` marks the layout provider
Layout({
  template: { root: true },
  getTemplate: (store) => `<!DOCTYPE html>...{{ body.main }}...`,
})
```

### DON'T: Register multiple plugins as `root` layout
```typescript
// ❌ Wrong — the server picks one arbitrarily; the rest are dead code
plugins: [
  Layout({ template: { root: true } }),
  Layout({ template: { root: true } }), // conflict
]
```

### DO: Use the `html` tagged literal for store-reactive templates
```typescript
// ✅ Correct — static `{{ key }}` interpolation + dynamic `${store => ...}`
import { Layout, html } from "@ecosy/markdoc";

Layout({
  template: { root: true },
  getTemplate: html`
    <h1>{{ scope.title }}</h1>
    <nav>${(store) => store.getState().nav.map(renderItem).join("")}</nav>
    {{ body.main }}
  `,
})
```

## Type Rules

### DO: Annotate plugin factory return types with `PluginConstructor`
```typescript
// ✅ Correct — keeps `.d.ts` emit clean despite private members
import { type PluginConstructor } from "@ecosy/markdoc";

export function MyPlugin(opts): PluginConstructor {
  return class extends Plugin { /* ... */ };
}
```

### DON'T: Rely on inference for factory-returned class expressions with `private`/`protected` members
```typescript
// ❌ Wrong — TS4094 at build time; consumers lose types
export function MyPlugin() {
  return class extends Plugin {
    private timer; // leaks into the inferred type → TS4094
  };
}
```

## General Rules

1. **Never import from `dist/`** — always import from `@ecosy/markdoc`, `@ecosy/markdoc/plugins`, `@ecosy/markdoc/imports`, or `@ecosy/markdoc/nodejs`.
2. **Never assume a filesystem** — the runtime has none. Use `this.fetchable.http.get(url)` for external fetches; `Documentation.getContentUrl()` for content paths.
3. **Never store request-scoped data on global plugin instances** — `__global` plugins are reused across requests. Use `this.ctx` / `this.store` instead.
4. **Always use WinterCG types** — `Request`, `Response`, `ReadableStream`, `Headers`, not Express/Koa shapes.
5. **Always publish plugins as factory functions** — consumers call `MyPlugin({ ... })`. Never export the class directly.
