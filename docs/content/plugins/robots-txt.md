---
title: RobotsTxt
description: Serve a robots.txt file for search engine crawlers
order: 3
---

# RobotsTxt

The RobotsTxt plugin serves a `/robots.txt` file that tells search engine crawlers which pages they can access. It is a factory function — call `RobotsTxt()` to get a Plugin class.

## Setup

```typescript
import { markdoc, RobotsTxt, Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [RobotsTxt(), Sitemap],
});

export default app;
```

With no arguments, `RobotsTxt()` produces a permissive default that allows all crawlers:

```
User-agent: *
Allow: /

Sitemap: https://your-domain.com/sitemap.xml
```

## Route

### `GET /robots.txt`

Returns `text/plain` with the generated robots directives. The response is built fresh on each request using the frozen configuration and the current request origin.

## Custom rules

Pass a `rules` array to control access per user-agent:

```typescript
RobotsTxt({
  rules: [
    { userAgent: "*", allow: ["/"], disallow: ["/admin", "/api"] },
    { userAgent: "Googlebot", allow: ["/"], crawlDelay: 1 },
  ],
})
```

This generates:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api

User-agent: Googlebot
Allow: /
Crawl-delay: 1
```

### Rule fields

Each rule in the `rules` array is a `RobotsRule` object:

```typescript
interface RobotsRule {
  userAgent: string;       // Required — crawler identifier ("*" for all)
  allow?: string[];        // Paths the crawler can access
  disallow?: string[];     // Paths the crawler cannot access
  crawlDelay?: number;     // Seconds between requests
}
```

When `rules` is omitted, the default is `[{ userAgent: "*", allow: ["/"] }]`.

## Sitemap URL

By default, RobotsTxt auto-detects the sitemap URL from the incoming request's origin and appends `/sitemap.xml`. This works best when paired with the [Sitemap](/plugins/sitemap) plugin.

You can override this behavior:

```typescript
// Explicit URL
RobotsTxt({ sitemapUrl: "https://docs.example.com/sitemap.xml" })

// Multiple sitemaps
RobotsTxt({
  sitemapUrl: [
    "https://docs.example.com/sitemap.xml",
    "https://docs.example.com/blog-sitemap.xml",
  ],
})

// Disable sitemap line entirely
RobotsTxt({ sitemapUrl: false })
```

When `sitemapUrl` is `false`, no `Sitemap:` directive is included. When it is `true` or omitted, the plugin auto-detects from the request origin.

## Configuration type

```typescript
interface RobotsTxtOptions {
  rules?: RobotsRule[];
  sitemapUrl?: string | string[] | boolean;
}
```

The options object is frozen after plugin creation — configuration is immutable at runtime.

## Exports

```typescript
import {
  RobotsTxt,
  type RobotsRule,
  type RobotsTxtOptions,
} from "@ecosy/markdoc";
```

`RobotsTxt` is a factory function. Call it with options (or no arguments) and pass the result to the `plugins` array:

```typescript
plugins: [RobotsTxt()]           // default
plugins: [RobotsTxt({ ... })]   // custom
```
