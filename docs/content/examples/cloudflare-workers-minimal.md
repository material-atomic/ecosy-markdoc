---
title: Cloudflare Workers — Minimal Deployment
description: The smallest possible Markdoc app running on Cloudflare Workers.
order: 1
---

# Cloudflare Workers — Minimal Deployment

The smallest Markdoc app that actually serves content from GitHub.

## What you'll build

A Worker that answers every request with rendered markdown from a GitHub repository, using jsDelivr as the CDN. No plugins, no customization — just the default runtime.

## Layout

```
my-docs/
├── src/
│   └── worker.ts          ← the app entry
├── wrangler.toml
├── package.json
└── tsconfig.json
```

## Code

```typescript
// src/worker.ts
import markdoc from "@ecosy/markdoc";

const app = markdoc({
  repo: "your-org/your-docs-repo",
  branch: "main",
  dir: "content",
  revalidate: 5 * 60_000, // 5 min cache window
});

export default { fetch: app.fetch };
```

```toml
# wrangler.toml
name = "my-docs"
main = "src/worker.ts"
compatibility_date = "2026-01-01"
```

```json
// package.json
{
  "name": "my-docs",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@ecosy/markdoc": "^0.1.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "wrangler": "^3"
  }
}
```

## Run

```sh
yarn dev
# → http://localhost:8787
yarn deploy
# → your-docs.workers.dev
```

## How it works

`markdoc()` returns a WinterCG-compatible app with a single `fetch(request)` method. Re-exporting `{ fetch: app.fetch }` as the Worker default tells Cloudflare to route every request through Markdoc.

Internally, every page request:

1. Resolves through the runtime's `Manifest` (pulled from `<repo>@<branch>/<dir>/_manifest.md` on the CDN the first time)
2. Fetches the target markdown file
3. Parses frontmatter + body
4. Returns the response

`revalidate` is a TTL in milliseconds — manifest, components, and rendered pages are re-fetched lazily after this window elapses.

## Next steps

- [Node.js — production deployment](/examples/nodejs-server) for long-running servers
- [Local dev workflow](/examples/local-dev) to iterate without pushing to GitHub
- [Authentication](/examples/authentication-jwt) to gate docs behind login
