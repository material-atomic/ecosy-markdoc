---
title: Ecosy Markdoc
description: Headless markdown documentation CMS for edge runtimes
order: 0
---

# Ecosy Markdoc

A headless markdown documentation framework that runs on the edge. Point it at a GitHub repository, and it serves your markdown as structured content through a standard `fetch` API — no build step, no static generation.

## Why Markdoc

Documentation should be simple: write markdown, push to GitHub, see it live. Ecosy Markdoc makes this work at the edge with zero infrastructure.

Your content lives in a GitHub repository as plain markdown files. Markdoc discovers the site structure from `_manifest.md` files, fetches page content on demand through a global CDN, and returns parsed frontmatter + body as structured responses. Everything is lazy — manifests resolve once, pages cache automatically.

## Architecture

Markdoc is built on the **ecosy classable** system — a dependency injection foundation that works without decorators. Every core piece (Configuration, Documentation, Manifest, Pagable, Router, Server) is a plain class wired together through `Injectable` scopes and lazy `Inject` resolution.

This means:

- **Edge-native**: no Node.js APIs, no filesystem access. Runs on Cloudflare Workers, Deno Deploy, Vercel Edge, or any WinterCG-compatible runtime.
- **Composable**: extend with plugins that register their own routes and handlers.
- **Cacheable**: built-in revalidation controls content freshness without manual cache management.
- **Type-safe**: full TypeScript with inferred types throughout — no `any` casts in your code.

## Quick start

```typescript
import markdoc from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  branch: "main",
  dir: "docs/content",
});

export default app;
```

Deploy to any edge runtime. Request any page:

```
GET /                    → Home page
GET /getting-started     → Getting Started guide
GET /guides/writing-markdown → Nested guide
GET /sitemap.xml         → Auto-generated sitemap (via plugin)
```

## Content structure

```
docs/content/
├── _manifest.md          ← Root manifest (declares children)
├── index.md              ← Home page (you are here)
├── getting-started.md    ← Top-level page
└── guides/
    ├── _manifest.md      ← Nested manifest
    ├── writing-markdown.md
    └── organizing-content.md
```

Each `_manifest.md` declares which pages and sub-manifests exist in its directory. Markdoc traverses them recursively to build the full sitemap.

## Next steps

- [Getting Started](/getting-started) — installation, configuration, and first deployment
- [Writing Markdown](/guides/writing-markdown) — content authoring guide
- [Organizing Content](/guides/organizing-content) — manifest structure and nested sections
- [Plugins](/plugins) — extend Markdoc with custom routes and handlers
