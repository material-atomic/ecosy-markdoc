---
title: Plugins
description: Extend Ecosy Markdoc with custom routes, handlers, and functionality
order: 3
---

# Plugins

Plugins let you add custom routes and handlers to your Markdoc server. A plugin registers URL patterns and handles requests to those URLs — independently from your markdown content pages.

## How plugins work

Every plugin implements the `PluginLike` interface with two responsibilities:

1. **`getRegistry()`** — declares which URLs the plugin handles, with optional metadata (method, tags, description).
2. **`fetch(req, res)`** — handles incoming requests matched to those URLs.

The server resolves plugins on each request, merges their registered URLs into the route table alongside manifest pages, and delegates matching requests to the appropriate plugin.

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
  repo: "github:your-org/your-docs",
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

The `getRegistry()` method returns a `PluginRegistry` object. Currently it supports one key:

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

### Sitemap

Ecosy Markdoc ships with a `Sitemap` plugin that generates XML and JSON sitemaps from the manifest's discovered URLs:

```typescript
import { Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  // ...
  plugins: [Sitemap],
});
```

This registers two routes:

- **`GET /sitemap.xml`** — standard XML sitemap for search engines
- **`GET /sitemap.json`** — JSON array of `{ path, url }` objects for programmatic access

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
