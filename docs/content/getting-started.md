---
title: Getting Started
description: What is Ecosy Markdoc, how it works, and how to use it
order: 1
---

# Getting Started with Ecosy Markdoc

Ecosy Markdoc is a headless markdown documentation framework designed to run on the edge. It fetches markdown content from a GitHub repository, parses frontmatter metadata, and serves structured JSON responses through a standard `fetch` API — no build step, no static generation, no server to maintain.

## What it does

You point Markdoc at a GitHub repository containing markdown files. It reads your `_manifest.md` files to discover the site structure, then serves each page as a JSON response with parsed metadata and body content. Everything runs lazily: manifests are resolved once at startup, page content is fetched on first request and cached for subsequent visits.

## How it works

The framework is composed of a few core pieces that wire together automatically through dependency injection:

**Configuration** holds your repository info (repo, branch, directory) and options like cache revalidation time.

**Documentation** builds CDN URLs from your repo config. By default it uses jsDelivr (`cdn.jsdelivr.net/gh`) to fetch raw files from GitHub, so your content is served through a global CDN without any deployment.

**Manifest** reads `_manifest.md` files recursively, starting from the root. Each manifest declares its children — either page slugs or paths to nested manifests. This builds a sitemap of all valid URLs. Manifest does not read page content; it only discovers what exists.

**Server** exposes a `fetch(request)` method that matches the standard edge server signature. When a request comes in, it checks the sitemap, lazily fetches the page content from the CDN, parses frontmatter + body, and returns structured JSON.

## Quick start

Install the package:

```
npm install @ecosy/markdoc
```

Create your entry point. This example uses Cloudflare Workers, but any edge runtime that expects a `fetch` handler works:

```typescript
import markdoc from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-github-username/your-repo",
  branch: "main",
  dir: "docs/content",
});

export default app;
```

That gives you an edge server. Deploy it, then request any page:

```
GET /getting-started
→ { path: "getting-started.md", url: "/getting-started", metadata: {...}, body: "..." }

GET /guides/writing-markdown
→ { path: "guides/writing-markdown.md", url: "/guides/writing-markdown", metadata: {...}, body: "..." }
```

## Configuration options

The `markdoc()` function accepts a single options object:

- **repo** (required) — GitHub repository in `owner/repo` format.
- **branch** — Branch to read from. Defaults to the repository's default branch.
- **dir** — Subdirectory within the repo where content lives. If your markdown files are at `docs/content/`, set this to `"docs/content"`.
- **provider** — CDN base URL. Defaults to `"https://cdn.jsdelivr.net/gh"`. You can swap this for any CDN that serves raw GitHub files.
- **interpolate** — Template string that assembles the final content URL from the placeholders `{provider}`, `{repo}`, `{branch}`, `{dir}`, `{path}`. Defaults to `"{provider}/{repo}{branch}{dir}{path}"` (the jsDelivr shape — branch prefixed with `@`, dir and path leading `/`). Override when the CDN you point `provider` at uses a different URL layout, e.g. `raw.githubusercontent.com` which uses `/<branch>/` instead of `@<branch>`: set `interpolate: "{provider}/{repo}/{branch}{dir}{path}"`.
- **revalidate** — Cache duration in milliseconds. When set to `0` (default), content is fetched fresh on every request. Set a value like `60000` (one minute) to cache responses.
- **strict** — Reserved for future use. When enabled, the framework will enforce stricter validation on manifest structure and page metadata.

## Response format

Every successful response returns JSON with this shape:

```json
{
  "path": "guides/writing-markdown.md",
  "url": "/guides/writing-markdown",
  "metadata": {
    "title": "Writing Markdown",
    "description": "How to write content for your documentation"
  },
  "body": "# Writing Markdown\n\nYour markdown content here..."
}
```

If the requested path is not in the sitemap, you get a 404:

```json
{ "error": "Not found" }
```

If fetching the content fails, you get a 500 with the error message.
