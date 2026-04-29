---
title: RSSFeed
description: Serve RSS 2.0 or Atom 1.0 feeds at a configurable URL
order: 6
---

# RSSFeed

The RSSFeed plugin registers a feed endpoint that renders RSS 2.0 or Atom 1.0 XML. You supply the items (static array or per-request factory); the plugin handles XML generation, escaping, and date formatting.

## Setup

```typescript
import { markdoc, RSSFeed } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    RSSFeed({
      title: "My Blog",
      description: "Latest posts from My Blog",
      link: "https://myblog.com",
      items: [
        {
          title: "Hello world",
          link: "https://myblog.com/hello-world",
          description: "The first post.",
          pubDate: new Date("2026-04-24"),
        },
      ],
    }),
  ],
});

export default app;
```

By default the feed is served at `GET /feed.xml`.

## Route

The plugin registers one route. Path, format, and content type:

| Option | Default | Response |
|---|---|---|
| `format: "rss"` (default) | `/feed.xml` | `application/rss+xml; charset=utf-8` |
| `format: "atom"` | `/feed.xml` | `application/atom+xml; charset=utf-8` |

Both formats include a `<lastBuildDate>` / `<updated>` timestamp generated at response time, so the feed is always fresh.

## Items

The `items` option is either a static array or a factory:

### Static array

```typescript
RSSFeed({
  title: "...", description: "...", link: "...",
  items: [
    {
      title: "Post 1",
      link: "https://.../post-1",
      description: "Summary of post 1.",
      pubDate: new Date("2026-04-20"),
    },
    {
      title: "Post 2",
      link: "https://.../post-2",
      content: "<p>Full HTML content...</p>",
      pubDate: new Date("2026-04-22"),
      author: "Ken Nguyen",
      categories: ["framework", "release"],
    },
  ],
})
```

Items are frozen at plugin setup — good for static documentation sites where content doesn't change per request.

### Factory (dynamic)

```typescript
RSSFeed({
  title: "...", description: "...", link: "...",
  items: async (req) => {
    const posts = await db.posts.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return posts.map((p) => ({
      title: p.title,
      link: `${req.mdUrl.origin}/posts/${p.slug}`,
      description: p.excerpt,
      content: p.html,
      pubDate: p.createdAt,
      author: p.author.name,
      categories: p.tags.map((t) => t.name),
    }));
  },
})
```

The factory receives `MarkdocRequest` so you can inspect the request (query params, headers) or construct absolute URLs from the request origin.

## Item fields

```typescript
interface FeedItem {
  title: string;              // required
  link: string;               // required, absolute URL
  description?: string;       // plain-text or short HTML summary
  content?: string;           // full HTML body
  pubDate?: Date | string;    // Date object or parseable string
  author?: string;
  categories?: string[];
  guid?: string;              // defaults to `link`
}
```

### `description` vs `content`

- `description` is a short summary — in RSS it maps to `<description>`, in Atom to `<summary>`. Typically 1-3 sentences.
- `content` is the full article body — in RSS it maps to `<content:encoded>`, in Atom to `<content>`. Typically HTML.

Both are wrapped in CDATA on output so HTML passes through untouched without double-escaping.

### `pubDate`

Accepts a `Date` object or an ISO string (or any string `new Date()` can parse). The plugin formats to RFC 822 for RSS and ISO 8601 for Atom. Invalid strings fall back to the current time rather than breaking the feed.

### `guid`

Unique identifier. Defaults to the `link` with `isPermaLink="true"`. Override when the link can change but the item identity is stable:

```typescript
{
  title: "...",
  link: "https://myblog.com/posts/article-v2",
  guid: "post-id-7823",   // stable ID, URL may change with edits
}
```

## Channel metadata

```typescript
RSSFeed({
  title: "My Blog",
  description: "Thoughts on software and writing",
  link: "https://myblog.com",

  feedLink: "https://myblog.com/feed.xml",  // optional, defaults to `link + path`
  language: "en",                            // ISO 639-1, default "en"
  copyright: "© 2026 Ken Nguyen",

  image: {
    url: "https://myblog.com/logo.png",
    title: "My Blog",                        // optional, defaults to channel title
    link: "https://myblog.com",              // optional, defaults to channel link
  },
  // ... items
})
```

`feedLink` is inserted as `<atom:link rel="self">` in RSS and `<link rel="self">` in Atom — feed readers use this for subscription persistence.

## Item limit

```typescript
RSSFeed({
  // ...
  items: async () => await fetchAllPosts(),  // returns 500+ items
  maxItems: 20,                              // default
})
```

The plugin truncates to the first `maxItems` after the source resolves. Standard feed etiquette is 10-50 items — consumers don't want to re-download 500 entries on every poll.

## Custom path

Serve the feed at a non-default URL:

```typescript
RSSFeed({
  path: "/blog/rss",
  format: "rss",
  // ...
})

RSSFeed({
  path: "/atom.xml",
  format: "atom",
  // ...
})
```

You can register multiple feed plugins with different paths for different content groups (e.g., `/feed.xml` for all posts, `/tags/rust.xml` for Rust-tagged posts).

## Format choice

| Format | Use when |
|---|---|
| **RSS 2.0** (default) | Broadest reader compatibility; simpler structure; typical blog use |
| **Atom 1.0** | Richer semantics (explicit `<updated>` vs `<published>`); better for programmatic consumers; required by some podcast platforms |

Both are well-supported by modern readers. Pick one and stay with it — switching breaks subscriber feed caches.

## Configuration types

```typescript
interface RSSFeedOptions {
  path?: string;                           // default "/feed.xml"
  format?: "rss" | "atom";                 // default "rss"
  title: string;                           // required
  description: string;                     // required
  link: string;                            // required, absolute
  feedLink?: string;
  language?: string;                       // default "en"
  copyright?: string;
  image?: FeedImage;
  items: FeedItem[] | ((req: MarkdocRequest) => FeedItem[] | Promise<FeedItem[]>);
  maxItems?: number;                       // default 20
}

interface FeedItem {
  title: string;
  link: string;
  description?: string;
  content?: string;
  pubDate?: Date | string;
  author?: string;
  categories?: string[];
  guid?: string;
}

interface FeedImage {
  url: string;
  title?: string;
  link?: string;
}

type FeedItemsSource =
  | FeedItem[]
  | ((req: MarkdocRequest) => FeedItem[] | Promise<FeedItem[]>);
```

## XML safety

All string values inserted into XML tags are escaped for `&`, `<`, `>`, `"`, `'`. HTML content in `description` / `content` is wrapped in CDATA, and the plugin defuses any accidental `]]>` sequences so user-supplied HTML cannot break out of the CDATA section.

You do not need to pre-escape values you pass into `FeedItem` fields.

## Exports

```typescript
import {
  RSSFeed,
  type RSSFeedOptions,
  type FeedItem,
  type FeedImage,
  type FeedItemsSource,
} from "@ecosy/markdoc";
```
