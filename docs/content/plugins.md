---
title: Plugins
description: Extend Ecosy Markdoc with custom routes, handlers, and functionality
order: 3
---

# Plugins

Plugins let you add custom routes and handlers to your Markdoc server. A plugin registers URL patterns and handles requests to those URLs — independently from your markdown content pages.

## How plugins work

Every plugin implements the `PluginLike` interface. The capabilities split across declarations and lifecycle hooks:

1. **`getRegistry()`** — declares URLs the plugin handles, named templates it provides, and inline components it contributes.
2. **`fetch(req, res)`** — handles incoming requests matched to registered URLs.
3. **`getTemplate(name)`** — returns the HTML template string for a declared template name.
4. **`start()`** — one-time bootstrap hook (optional). Runs once when the plugin first resolves; awaited before the request pipeline proceeds.
5. **`beginRequest(req, res)`** — pre-routing guard hook (optional). Returns a `Response` to short-circuit, or `null` to continue.
6. **`endRequest(req, res, response)`** — post-response transform hook (optional). Receives the Response produced by the main handler (or earlier plugins) and returns a possibly modified Response.

The server resolves plugins on each request, merges their registered URLs into the route table alongside manifest pages, awaits `start()` for any newly-instantiated plugins, runs the `beginRequest` chain, dispatches to the matching `fetch()` (or page renderer), then runs the `endRequest` chain in registration order.

## Writing a plugin

Extend the `Plugin` base class. It provides a unique `id` (auto-generated from the class name), access to the request context, and the shared store.

```typescript
import { Plugin, type PluginRegistry } from "@ecosy/markdoc";
import type { MarkdocRequest } from "@ecosy/markdoc";
import type { MarkdocResponse } from "@ecosy/markdoc";

export class HealthCheck extends Plugin {
  getRegistry(): PluginRegistry {
    return {
      urls: {
        "/health": {
          summary: "Health check endpoint",
          method: "GET",
          tags: ["ops"],
        },
      },
    };
  }

  fetch(req: MarkdocRequest, res: MarkdocResponse): MarkdocResponse {
    return res.json({ status: "ok", timestamp: Date.now() });
  }
}
```

## Registering plugins

Pass your plugin classes in the `plugins` array when creating the Markdoc instance:

```typescript
import markdoc from "@ecosy/markdoc";
import { HealthCheck } from "./plugins/health-check";
import { Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  branch: "main",
  dir: "docs/content",
  plugins: [Sitemap, HealthCheck],
});

export default app;
```

Plugins are instantiated per-request by default. Each `fetch()` call receives a fresh plugin instance with the current request context and store.

## Plugin lifecycle

Markdoc manages two kinds of plugin lifecycles:

**Transient plugins** (default) are created fresh on every request. Use these for stateless handlers like API endpoints or redirects.

**Global plugins** are created once and cached across requests. Mark a plugin as global by setting `__global = true` on the class:

```typescript
export class Analytics extends Plugin {
  static __global = true;

  private buffer: string[] = [];

  getRegistry(): PluginRegistry {
    return {
      urls: {
        "/analytics/flush": {
          summary: "Flush analytics buffer",
          method: "POST",
        },
      },
    };
  }

  fetch(req: MarkdocRequest, res: MarkdocResponse): MarkdocResponse {
    const flushed = this.buffer.splice(0);
    return res.json({ flushed: flushed.length });
  }
}
```

Global plugins respect the `revalidate` setting — when the cache expires, the plugin instance is recreated.

## Plugin registry schema

The `getRegistry()` method returns a `PluginRegistry` object with three optional keys:

**`urls`** — a record mapping URL patterns to route metadata:

```typescript
interface PluginRouteSchema {
  summary?: string;      // Short description of the route
  description?: string;  // Detailed description
  method?: string | string[];  // HTTP method(s): "GET", "POST", ["GET", "POST"]
  tags?: string[];       // Categorization tags
}
```

Each key in `urls` is a URL path string. The server registers these paths in the route table. When a request matches, it calls the plugin's `fetch()` method.

**`template`** — a record mapping template names to identifiers. When a plugin declares a `root` template, the server uses it as the page layout wrapper instead of the built-in default.

When `template` is present, the plugin must also implement `getTemplate(name)`:

```typescript
getTemplate(name: string): string | Promise<string>;
```

The server calls `getTemplate("root")` on the first plugin that declares `template.root` in its registry. The returned HTML string is used as the page layout, with `{{ key }}` placeholders interpolated with page metadata and payload values.

Reserved placeholders: `{{ body }}` (rendered page HTML), `{{ title }}` (page title from frontmatter), `{{ description }}` (page description).

**`components`** — a record mapping component names to HTML content strings. Plugins can declare inline components that are merged into the Engine alongside file-based components from `_components/`. Plugin components override file-based components of the same name.

```typescript
interface PluginRegistry {
  urls?: Record<string, PluginRouteSchema>;
  template?: Record<string, string>;
  components?: Record<string, string>;
}
```

Component content uses `{{ key }}` placeholders, interpolated with store state and tag attributes — the same rules as file-based components. See the [Components](/components) page for full details on placeholder interpolation and nested resolution.

Example — a plugin that provides an `alert` and a `badge` component:

```typescript
export class UIKit extends Plugin {
  getRegistry(): PluginRegistry {
    return {
      components: {
        alert: `<div class="alert alert-{{ type }}">{{ body }}</div>`,
        badge: `<span class="badge">{{ label }}</span>`,
      },
    };
  }
}
```

Once registered, these components are available in templates and markdown layouts:

```html
<markdoc component="alert" type="warning">
  <p>This action cannot be undone.</p>
</markdoc>

<markdoc component="badge" label="New" />
```

If a file-based component `_components/alert.html` also exists, the plugin version takes precedence. This lets plugins ship default UI components that users can still override by removing the plugin or replacing it with their own.

## Accessing the store

Plugins receive a shared `store` via the base class constructor. The store holds page context set by the server during request handling:

```typescript
fetch(req: MarkdocRequest, res: MarkdocResponse): MarkdocResponse {
  const state = this.store.getState() as Record<string, unknown>;
  const pages = (state.pages ?? []) as [string, string][];

  // pages is an array of [canonicalPath, publicUrl] tuples
  return res.json(pages.map(([path, url]) => ({ path, url })));
}
```

The store is a reactive state container — you can subscribe to changes if your plugin needs to react to state updates.

## Built-in plugins

Ecosy Markdoc ships with two built-in plugins: **Layout** (auto-created by the server) and **Sitemap** (opt-in). See the [Built-in Plugins](/built-in-plugins) page for full documentation on both, including how to override the Layout with a custom template.

## Plugin ID

Every plugin instance gets a unique `id` (e.g. `"HealthCheck:1"`, `"Sitemap:2"`). The `Pluginable` manager stores plugins in a `Map<id, instance>` for O(1) lookup:

```typescript
// Inside server or another plugin
const sitemap = pluginable.get("Sitemap:1");
const exists = pluginable.has("HealthCheck:2");
const allIds = pluginable.ids;
```

IDs are auto-generated as `ClassName:sequence` and increment globally. If you need a stable ID, override the `id` property in your plugin class.

## Request and response

Plugin `fetch()` receives `MarkdocRequest` and `MarkdocResponse` — controlled wrappers over the raw platform request/response:

**MarkdocRequest** provides:
- `req.mdUrl` — parsed URL with security utilities (CORS check, same-origin, referrer validation, embed detection)
- `req.pathname` — normalized pathname
- `req.method` — HTTP method
- `req.header(name)` — case-insensitive header lookup
- `req.cookie(name)` — parsed cookie value
- `req.query(name)` — query parameter value
- `req.headers`, `req.cookies`, `req.queries` — full record accessors

**MarkdocResponse** provides builder methods:
- `res.html(content)` — set HTML response body
- `res.json(data)` — set JSON response body
- `res.xml(content)` — set XML response body
- `res.status(code)` — set HTTP status code (chainable)
- `res.toResponse()` — convert to standard `Response` object
