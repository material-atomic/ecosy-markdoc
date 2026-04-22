---
title: Sitemap
description: Auto-generate XML and JSON sitemaps from your manifest
order: 2
---

# Sitemap

The Sitemap plugin generates XML and JSON sitemaps from the pages discovered by your manifest. It is opt-in — you must add it to the `plugins` array.

## Setup

```typescript
import { markdoc, Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [Sitemap],
});

export default app;
```

That's it. The plugin registers two routes automatically.

## Routes

### `GET /sitemap.xml`

Standard XML sitemap for search engines. Returns `application/xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://docs.example.com/</loc>
  </url>
  <url>
    <loc>https://docs.example.com/getting-started</loc>
  </url>
  <url>
    <loc>https://docs.example.com/plugins</loc>
  </url>
</urlset>
```

Submit this URL to Google Search Console, Bing Webmaster Tools, or any search engine that supports sitemaps.

### `GET /sitemap.json`

JSON array of `{ path, url }` objects. Returns `application/json`:

```json
[
  { "path": "index", "url": "https://docs.example.com/" },
  { "path": "getting-started", "url": "https://docs.example.com/getting-started" },
  { "path": "plugins", "url": "https://docs.example.com/plugins" }
]
```

Useful for building client-side navigation, search indexes, or debugging which pages the manifest discovered.

## How it works

The Sitemap plugin is a transient plugin — it is recreated on every request and always reflects the current manifest state.

On each request, the server populates the shared store with a `scope.pages` array containing `[canonicalPath, publicUrl]` tuples for every page in the manifest. The Sitemap plugin reads this array from the store and formats it as XML or JSON depending on the requested route.

```typescript
// Internal — how the plugin reads pages
const state = this.store.getState();
const pages = state.pages as [string, string][];
```

Because the plugin reads from the store rather than crawling your content, it adds zero additional latency. The manifest is already preloaded as part of normal request handling.

## With RobotsTxt

Pair Sitemap with the [RobotsTxt](/plugins/robots-txt) plugin so crawlers automatically discover your sitemap:

```typescript
import { markdoc, Sitemap, RobotsTxt } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [Sitemap, RobotsTxt()],
});
```

RobotsTxt auto-detects the sitemap URL from the request origin and includes a `Sitemap:` directive in the generated `robots.txt`.

## Exports

```typescript
import { Sitemap } from "@ecosy/markdoc";
```

The `Sitemap` class is exported directly — no factory function needed. Pass the class itself (not an instance) to the `plugins` array.
