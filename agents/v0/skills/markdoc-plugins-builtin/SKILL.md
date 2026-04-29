---
name: markdoc-plugins-builtin
description: Skill for using the eight shipped Markdoc plugins. Call this skill when adding authentication, CORS, layouts, a cache dashboard, robots.txt, RSS/Atom feeds, a sitemap, or periodic cache invalidation to a Markdoc app.
---

# Built-in Plugins — Authen, AutoInvalidate, Cors, Layout, Markdash, RobotsTxt, RSSFeed, Sitemap

<instructions>
  <rule>
    <title>`Authen` — cookie-based JWT gate via `beginRequest`</title>
    <details>
      `Authen({ cookieName, verify, onUnauthorized, publicPaths })` reads a JWT from a cookie, delegates verification to the developer's `verify(jwt, req)` function, and either continues or short-circuits. `onUnauthorized` accepts a string URL (→ 302 redirect), an `AuthenRenderConfig` (→ inline login HTML), or an async handler (→ custom `Response`). Public paths bypass auth entirely — always include your login endpoint.
    </details>
  </rule>
  <rule>
    <title>`Cors` — preflight + header injection, split across both hooks</title>
    <details>
      `Cors({ origin, methods, headers, credentials, ... })` answers CORS preflight (`OPTIONS + Origin + Access-Control-Request-Method`) in `beginRequest` with a 204 + headers. For regular responses it appends `Access-Control-Allow-*` in `endRequest` only when an `Origin` header is present. Using `credentials: true` with `origin: "*"` throws at factory time — browsers reject the combination.
    </details>
  </rule>
  <rule>
    <title>`Layout` — mandatory root HTML wrapper</title>
    <details>
      Exactly one `Layout` plugin per app must register `template: { root: true }`. Templates can come from an inline string, a `(store) => string` factory, the `html` tagged literal (store-reactive), a CDN file via `path: { name, parser }`, or the built-in fallback. Inline `getTemplate` beats `path`; `path` defaults to `_template.md` with parser `"root"`.
    </details>
  </rule>
  <rule>
    <title>`Markdash` — operator cache dashboard</title>
    <details>
      `Markdash({ prefix })` mounts a small dashboard at `/<prefix>` (default `_markdash`) with three actions: reload manifest, reload engine components, clear page cache. Each action posts to a JSON endpoint and invalidates the corresponding cache. Always gate this behind `Authen` in production — the endpoints bypass no auth of their own.
    </details>
  </rule>
  <rule>
    <title>`Markdash({ enableSwitchSource: true })` — live content-source swap</title>
    <details>
      Opt-in flag that adds a **Content source** card to the dashboard plus three extra endpoints: `GET /<prefix>/inspect/documentation`, `POST /<prefix>/configure/documentation`, `POST /<prefix>/reset/documentation`. Lets operators flip `Documentation.provider` + `interpolate` between jsDelivr (default, cached ~24 h) and a zero-cache alternative like `raw.githubusercontent.com` while content is iterated on. Each switch auto-calls `pagable.clear()` so the next request hits the new source. Off by default because it mutates runtime state — gate behind `Authen` before enabling in production.
    </details>
  </rule>
  <rule>
    <title>`RobotsTxt` — crawler policy</title>
    <details>
      `RobotsTxt({ rules, sitemapUrl })` serves `/robots.txt`. Rules default to `[{ userAgent: "*", allow: ["/"] }]`. `sitemapUrl` accepts `true` (auto-detect `<origin>/sitemap.xml`), a string, a string array, or `false` to suppress. Combine with `Sitemap` for full SEO coverage.
    </details>
  </rule>
  <rule>
    <title>`RSSFeed` — RSS 2.0 / Atom 1.0 feeds</title>
    <details>
      `RSSFeed({ format, path, title, description, link, items, ... })` registers a feed endpoint. `format` is `"rss"` (default) or `"atom"`. `items` is either a static array or `(req) => FeedItem[] | Promise<FeedItem[]>` — use the factory form to pull from a manifest, DB, or CMS per request. `maxItems` caps the rendered count (default 20).
    </details>
  </rule>
  <rule>
    <title>`Sitemap` — auto-generated from the manifest</title>
    <details>
      `Sitemap` is a plugin *class* (not a factory) — drop it into `plugins: [...]` directly. It mounts `/sitemap.xml` and enumerates every page the `Manifest` knows about. No options — when you need customization, copy the plugin and fork.
    </details>
  </rule>
  <rule>
    <title>`AutoInvalidate` — periodic cache reload, cross-runtime</title>
    <details>
      `AutoInvalidate({ interval, targets, onTick })` registers a `__global` plugin that periodically calls `manifest.reload()`, `engine.reload()`, and/or `pagable.clear()`. Two drivers ship together: `setInterval` kicked from `start()` for Node-like runtimes, and a lazy `now - lastTickAt >= interval` check inside `beginRequest` for edge runtimes (Workers, Vercel Edge, Deno Deploy) where timers cannot persist between requests. The lazy path makes ticks robust to isolate eviction at the cost of needing some incoming traffic to fire — pair with a platform cron trigger when freshness must not depend on traffic, or fall back to `revalidate` (per-request TTL) for purely pull-based invalidation.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Authen with JWT verify + redirect</description>
    <reference_path>./examples/correct-authen.ts</reference_path>
  </example>
  <example>
    <description>Correct: Cors for allowlist + credentials</description>
    <reference_path>./examples/correct-cors.ts</reference_path>
  </example>
  <example>
    <description>Correct: Layout with `html` tagged literal</description>
    <reference_path>./examples/correct-layout.ts</reference_path>
  </example>
  <example>
    <description>Correct: Markdash gated behind Authen</description>
    <reference_path>./examples/correct-markdash.ts</reference_path>
  </example>
  <example>
    <description>Correct: Markdash with `enableSwitchSource` (live content-source swap)</description>
    <reference_path>./examples/correct-markdash-switch-source.ts</reference_path>
  </example>
  <example>
    <description>Correct: RSSFeed with dynamic items</description>
    <reference_path>./examples/correct-rss-feed.ts</reference_path>
  </example>
  <example>
    <description>Correct: RobotsTxt + Sitemap combo</description>
    <reference_path>./examples/correct-seo.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common built-in plugin mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
