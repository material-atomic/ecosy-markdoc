---
title: Built-in Plugins
description: Plugins that ship with Ecosy Markdoc out of the box
order: 4
---

# Built-in Plugins

Ecosy Markdoc ships with seven built-in plugins: **Layout**, **Sitemap**, **RobotsTxt**, **Authen**, **Cors**, **RSSFeed**, and **Markdash**. Layout is created automatically by the server — you never register it yourself. The other six are opt-in and must be added to the `plugins` array.

## Layout

The server always wraps every page in a Layout plugin. You don't need to configure anything — it works out of the box.

On each request the server resolves the layout in this order:

1. If a user plugin in `plugins[]` declares `template.root` in its registry and implements `getTemplate()`, that plugin becomes the layout. This is a full override.
2. Otherwise, the server creates a built-in Layout plugin internally. It tries to load `_template.md` from your content directory on the CDN. If that file exists, it becomes the page template.
3. If `_template.md` does not exist, the server falls back to a default HTML template with Google Fonts (Inter), responsive CSS, and clean typography.

Every page is always wrapped — there is no "layout-less" mode.

### Default template

When no `_template.md` file is found and no user plugin overrides the layout, the built-in template provides:

- Google Fonts Inter (400/500/600/700) loaded via `fonts.googleapis.com`
- Responsive `.container` with `max-width: 48rem` and mobile breakpoint at 640px
- Typography styles for headings, paragraphs, links, lists, tables, blockquotes
- Fenced code blocks with dark background (`#1e293b`) and monospace font
- XSS-safe output — page body is sanitized before interpolation

### Template file (`_template.md`)

Place a `_template.md` file in your content root directory. The Layout plugin loads it automatically. Use `{{ key }}` placeholders for dynamic values:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{ title }}</title>
  <meta name="description" content="{{ description }}">
  <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  <header>
    <h1>{{ siteName }}</h1>
  </header>
  <main>{{ body }}</main>
</body>
</html>
```

Reserved placeholders (highest priority): `{{ body }}` is the rendered page HTML, `{{ title }}` is the page title from frontmatter, `{{ description }}` is the page description from frontmatter. Any other `{{ key }}` placeholders are interpolated from payload values, then from frontmatter metadata.

### Custom Layout plugin

Developers who need full control can write a Layout plugin using the `Layout()` factory and register it in `plugins[]`. This overrides the built-in layout entirely.

```typescript
import { Layout, Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Layout({
      urls: {
        "assets/css/style.css": { summary: "Main stylesheet" },
        "assets/js/script.js": { summary: "Client script" },
      },
      payload: { siteName: "My Documentation", year: 2025 },
    }),
    Sitemap,
  ],
});
```

The `Layout()` factory accepts a config object with four keys:

**`urls`** — static assets served by the plugin. Keys are URL paths (automatically normalized with leading `/`), values are route schema metadata.

**`path`** — file-based template source. Has `name` (CDN file path) and `parser` (string or function). Defaults to `{ name: "_template.md", parser: "root" }` when omitted.

**`getTemplate`** — inline template. Accepts three forms:

A plain string with `{{ key }}` placeholders:

```typescript
Layout({
  getTemplate: `<html><head><title>{{ title }}</title></head><body>{{ body }}</body></html>`,
})
```

A function receiving the store:

```typescript
Layout({
  getTemplate: (store) => {
    const pages = store.getState().pages ?? [];
    const nav = pages.map(([path, url]) => `<a href="${url}">${path}</a>`).join("");
    return `<html><body><nav>${nav}</nav><main>{{ body }}</main></body></html>`;
  },
})
```

A tagged template literal via `html` — mixing `${store => ...}` for store-reactive values with `{{ key }}` for placeholders:

```typescript
import { Layout, html } from "@ecosy/markdoc";

Layout({
  getTemplate: html`
    <html>
    <body>
      <nav>${store => {
        const pages = store.getState().pages ?? [];
        return pages.map(([p, u]) => `<a href="${u}">${p}</a>`).join("");
      }}</nav>
      <main>{{ body }}</main>
    </body>
    </html>
  `,
})
```

**`payload`** — static object or function receiving the store. Values are interpolated into `{{ key }}` placeholders.

You can also subclass the factory output for full method override:

```typescript
class MyLayout extends Layout({
  payload: { siteName: "My Docs" },
}) {
  getTemplate(name: string): string {
    return `<html><head><title>{{ title }} — {{ siteName }}</title></head><body>{{ body }}</body></html>`;
  }
}
```

### Interpolation priority

Template `{{ key }}` placeholders are resolved in this order (highest to lowest): reserved keys (`body`, `title`, `description`) → payload values → frontmatter metadata. The page body is sanitized for XSS before interpolation so that template `<style>`, `<link>`, and `<meta>` tags are preserved.

## Sitemap

The Sitemap plugin generates XML and JSON sitemaps from the manifest's discovered URLs. It must be explicitly added to `plugins[]`:

```typescript
import { Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [Sitemap],
});
```

This registers two routes:

**`GET /sitemap.xml`** — standard XML sitemap for search engines. Returns `application/xml` with `<urlset>` containing all discovered page URLs.

**`GET /sitemap.json`** — JSON array of `{ path, url }` objects for programmatic access. Useful for building navigation, search indexes, or debugging which pages the manifest discovered.

The Sitemap plugin reads the shared store to access the page list. It is a transient plugin (recreated per request) and always reflects the current manifest state.

## RobotsTxt

The RobotsTxt plugin serves a `/robots.txt` file for search engine crawlers. It is a factory function — call `RobotsTxt()` to get a Plugin class:

```typescript
import { RobotsTxt, Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [RobotsTxt(), Sitemap],
});
```

With no arguments, `RobotsTxt()` produces a permissive default:

```
User-agent: *
Allow: /

Sitemap: https://your-domain.com/sitemap.xml
```

The Sitemap URL is auto-detected from the request origin. If the Sitemap plugin is also registered, crawlers will discover it automatically.

### Custom rules

Pass a `rules` array to control which paths each user-agent can access:

```typescript
RobotsTxt({
  rules: [
    { userAgent: "*", allow: ["/"], disallow: ["/admin", "/api"] },
    { userAgent: "Googlebot", allow: ["/"], crawlDelay: 1 },
  ],
})
```

Each rule object supports four fields: `userAgent` (required), `allow` (array of paths), `disallow` (array of paths), and `crawlDelay` (seconds between requests).

### Sitemap URL

By default, RobotsTxt auto-detects the sitemap URL from the incoming request's origin (`https://your-domain.com/sitemap.xml`). You can override this:

```typescript
// Explicit URL
RobotsTxt({ sitemapUrl: "https://docs.example.com/sitemap.xml" })

// Multiple sitemaps
RobotsTxt({ sitemapUrl: [
  "https://docs.example.com/sitemap.xml",
  "https://docs.example.com/blog-sitemap.xml",
] })

// Disable sitemap line entirely
RobotsTxt({ sitemapUrl: false })
```

## Authen

The Authen plugin gates every request behind JWT cookie authentication. Unauthenticated requests either redirect to a login URL or render an inline login UI, depending on how you configure it.

```typescript
import { Authen } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Authen({
      cookieName: "ecosy_session",
      verify: async (jwt) => {
        try {
          const { payload } = await jose.jwtVerify(jwt, SECRET);
          return !!payload.sub;
        } catch {
          return false;
        }
      },
      onUnauthorized: "/login",
      publicPaths: ["/login", "/register", "/healthz"],
    }),
  ],
});
```

Authen is a **global plugin** — one instance shared across requests. It hooks into the `beginRequest` lifecycle so it runs before any route matches. The plugin does not register URLs itself; it simply intercepts every request and either allows it or short-circuits with an unauthorized response.

### How it works

1. If `req.pathname` is in `publicPaths`, skip auth entirely.
2. Read `req.cookie(cookieName)`. If missing → unauthorized.
3. Call `verify(jwt, req)`. If it returns truthy → allow. Falsy or throws → unauthorized.
4. On unauthorized, generate a response based on `onUnauthorized`:
   - **string** path → 302 redirect to that URL
   - **render config** → inline HTML (default 401)
   - **function** → custom handler that returns any `Response`

### Unauthorized strategies

```typescript
// Redirect
Authen({ onUnauthorized: "/login", ... })

// Inline render
Authen({
  onUnauthorized: {
    mode: "render",
    template: "<html>...login form...</html>",
  },
  ...
})

// Custom handler
Authen({
  onUnauthorized: async (req, res) => new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }),
  ...
})
```

### Developer responsibilities

Authen blocks; it does not implement the login flow. You still need:

- A `/login` page or endpoint (added to `publicPaths`) that collects credentials
- Your own endpoint that verifies credentials, signs a JWT, and sets the cookie via `Set-Cookie`
- The `verify` function that unpacks and validates the JWT per request

See the [Authen plugin reference](/plugins/authen) for configuration types, a full login endpoint example, and notes on integrating with `jose`/`jsonwebtoken`.

## Cors

The Cors plugin handles CORS preflight requests and injects `Access-Control-Allow-*` headers on regular responses. It spans both lifecycle hooks — `beginRequest` for preflight short-circuit, `endRequest` for header injection on normal responses.

```typescript
import { Cors } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Cors({
      origin: ["https://app.example.com"],
      credentials: true,
      exposeHeaders: ["X-Total-Count"],
    }),
  ],
});
```

### Origin policies

Three forms accepted:

- `"*"` — any origin (incompatible with `credentials: true`)
- `string[]` — exact allowlist
- `(origin, req) => boolean` — dynamic predicate

```typescript
Cors({ origin: "*" })                              // public API
Cors({ origin: ["https://a.example.com"] })       // exact
Cors({ origin: (o) => /\.trusted\.io$/.test(o) }) // predicate
```

### Composition order

Always register `Cors` before authentication or rate-limiting plugins:

```typescript
plugins: [
  Cors({ ... }),       // preflight must bypass auth
  Authen({ ... }),
]
```

Otherwise `Authen` blocks `OPTIONS` preflight requests as unauthenticated and CORS fails.

See the [Cors plugin reference](/plugins/cors) for full configuration including methods, headers, maxAge, and expose headers.

## RSSFeed

The RSSFeed plugin registers a feed endpoint at a configurable path and renders RSS 2.0 or Atom 1.0 XML. You supply the items; the plugin handles channel metadata, date formatting, XML escaping, and CDATA wrapping.

```typescript
import { RSSFeed } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    RSSFeed({
      title: "Ecosy Journey",
      description: "Build journey of the Ecosy framework",
      link: "https://ecosy.dev",
      items: async (req) => {
        const posts = await loadPosts();
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

### Formats

- `format: "rss"` (default) — RSS 2.0, served as `application/rss+xml`. Widest reader compatibility.
- `format: "atom"` — Atom 1.0, served as `application/atom+xml`. Richer semantics (explicit `<updated>` vs `<published>`).

### Items source

Either a static array (frozen at plugin creation) or a factory that resolves per request. The factory receives `MarkdocRequest` for dynamic URLs, query params, etc.

### Customization

```typescript
RSSFeed({
  path: "/atom.xml",            // default "/feed.xml"
  format: "atom",
  language: "vi",
  copyright: "© 2026 S3TECH",
  image: { url: "https://.../logo.png" },
  maxItems: 50,                 // default 20
  // ...
})
```

See the [RSSFeed plugin reference](/plugins/rss-feed) for the full item schema, format comparison, and composition patterns.

## Markdash

The Markdash plugin exposes a developer dashboard at a configurable URL where you can invalidate Markdoc caches (manifest, engine components, page cache) from the browser. Useful during local development or on staging environments.

```typescript
import { Markdash, Authen } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Authen({ verify, onUnauthorized: "/login", publicPaths: ["/login"] }),
    Markdash({ prefix: "_ops/dash" }),  // mounted at /_ops/dash
  ],
});
```

### Prefix

The `prefix` option scopes every Markdash route. Default: `"_markdash"` → dashboard at `/_markdash`. Leading/trailing slashes are stripped.

### Routes

Markdash registers:

- `GET /<prefix>` — HTML dashboard (per-service buttons, inline CSS, no external JS)
- `POST /<prefix>/reload/manifest` — calls `manifest.reload()`
- `POST /<prefix>/reload/engine` — calls `engine.reload()`
- `POST /<prefix>/clear/pages` — calls `pagable.clear()`

### Security

**Always gate Markdash behind Authen in production**. The endpoints can invalidate server-wide caches without any per-action confirmation, so public exposure is a vector for accidental or malicious cache thrashing.

```typescript
plugins: [
  Authen({ ... }),          // gate first
  Markdash({ ... }),        // then mount
]
```

Alternatively, disable the plugin outside development:

```typescript
plugins: [
  ...(process.env.NODE_ENV === "production" ? [] : [Markdash()]),
]
```

See the [Markdash plugin reference](/plugins/markdash) for detailed endpoint behavior, configuration types, and notes on extending the dashboard.
