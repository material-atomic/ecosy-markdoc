---
title: SEO — Sitemap, RobotsTxt, RSS/Atom Feed
description: Ship `/sitemap.xml`, `/robots.txt`, and a dynamic RSS feed alongside your docs with three plugins.
order: 10
---

# SEO — Sitemap, RobotsTxt, RSS/Atom Feed

Three plugins cover the standard SEO + syndication endpoints most docs sites need. They all live in `@ecosy/markdoc/plugins`.

## What you'll build

- `/sitemap.xml` — auto-generated from the manifest tree
- `/robots.txt` — crawler policy with sitemap reference
- `/feed.xml` — RSS 2.0 feed with dynamically-resolved items

## Code

```typescript
import markdoc, { Sitemap, RobotsTxt, RSSFeed } from "@ecosy/markdoc";

export default markdoc({
  repo: "your-org/your-docs-repo",
  dir: "content",

  plugins: [
    // Sitemap is a class, not a factory — drop it in directly
    Sitemap,

    RobotsTxt({
      rules: [
        { userAgent: "*", allow: ["/"], disallow: ["/admin", "/_ops"] },
        { userAgent: "Googlebot", allow: ["/"], crawlDelay: 1 },
      ],
      // `true` or omit → auto-detect "<origin>/sitemap.xml"
      // string / string[] → explicit URL(s)
      // false → no sitemap line
      sitemapUrl: true,
    }),

    RSSFeed({
      format: "rss",              // or "atom"
      path: "/feed.xml",
      title: "My Docs Updates",
      description: "Latest changes and announcements",
      link: "https://docs.example.com",
      language: "en",
      maxItems: 25,

      // Dynamic items — resolved per request. Return anything you can
      // derive from your content: manifest list, DB query, external API.
      items: async (req) => {
        const res = await fetch(`${req.mdUrl.origin}/api/recent-posts`);
        const posts = (await res.json()) as Array<{
          slug: string;
          title: string;
          excerpt: string;
          html: string;
          createdAt: string;
          author: string;
          tags: string[];
        }>;

        return posts.map((p) => ({
          title: p.title,
          link: `${req.mdUrl.origin}/posts/${p.slug}`,
          description: p.excerpt,
          content: p.html,
          pubDate: p.createdAt,
          author: p.author,
          categories: p.tags,
        }));
      },
    }),
  ],
});
```

## Static items

If your feed items are known at config time (release notes, fixed announcements), use a plain array:

```typescript
RSSFeed({
  title: "Release Notes",
  description: "New versions and changes",
  link: "https://docs.example.com/releases",
  items: [
    {
      title: "v0.1.0",
      link: "https://docs.example.com/releases/0.1.0",
      description: "Initial public release",
      pubDate: new Date("2026-04-24"),
    },
  ],
})
```

## Atom instead of RSS

Same plugin, different format:

```typescript
RSSFeed({
  format: "atom",
  path: "/atom.xml",
  // rest identical
})
```

## How each endpoint works

- **`Sitemap`** walks the `Manifest` tree and emits `<urlset>` with every discoverable page. No options — when you need something different (custom priorities, lastmod, image sitemaps), copy the source as a practice.
- **`RobotsTxt`** emits a plain-text response based on `rules`. Auto-detects the sitemap URL from `req.mdUrl.origin` unless you pass one explicitly.
- **`RSSFeed`** handles XML escaping, CDATA wrapping, RFC 822 / ISO 8601 date formatting, and the `<atom:link rel="self">` self-reference required by RSS 2.0.

## Combined with sitemap + cache

Pair with `AutoInvalidate` on Node so your feed stays fresh when new content ships:

```typescript
import markdoc, { AutoInvalidate } from "@ecosy/markdoc";

markdoc({
  // ...
  plugins: [Sitemap, RobotsTxt(), RSSFeed({ ... })],
  imports: {
    autoInvalidate: AutoInvalidate({
      interval: 5 * 60_000,
      targets: ["manifest", "pages"],
    }),
  },
});
```

## Pitfalls

- **`Sitemap` called as factory** — it's a class, `Sitemap` not `Sitemap()`.
- **Missing `RSSFeed.title` / `description` / `link`** — all three are required, TypeScript will catch it at compile time but the error message is about an interface match.
- **Forwarding absolute URLs in dynamic `items`** — use `req.mdUrl.origin` to build URLs. Hardcoding `https://docs.example.com` breaks preview environments.

## Next steps

- [Node.js production server](/examples/nodejs-server) — pair feeds with `AutoInvalidate`
- [Operator dashboard](/examples/operator-dashboard) — reload the manifest when you publish new content
