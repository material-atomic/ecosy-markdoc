---
title: Local Dev Workflow — `withLocally`
description: Edit markdown on disk and see changes immediately without committing to GitHub.
order: 5
---

# Local Dev Workflow — `withLocally`

In production, Markdoc fetches content from jsDelivr, which caches aggressively (~24 h). During active authoring you don't want to push every edit to GitHub to see it live. `withLocally` is a reference practice that boots a loopback HTTP server mirroring jsDelivr's path shape from your working copy — every edit shows up on the next request.

The reference implementation ships in the repo at [`docs/locally.ts`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/locally.ts). This page shows how to use it.

## What you'll build

- A dev-only Node HTTP server on `127.0.0.1:4999` that serves content files from your local checkout
- `provider` redirect: Markdoc fetches from the local server instead of jsDelivr
- No-op on edge runtimes and in production (same code file ships unchanged)

## Install

Copy `locally.ts` from the repo into your `docs/` folder (or wherever your entry file lives). Zero runtime dependencies — it uses Node built-ins loaded lazily so edge bundlers skip them.

## Usage

```typescript
// docs/index.ts
import markdoc from "@ecosy/markdoc";
import withLocally from "./locally";

export default markdoc(
  withLocally({
    repo: "your-org/your-docs-repo",
    branch: "main",
    dir: "docs/content",
    parser: MyParser(),
    plugins: [/* ... */],

    // Locally-only options
    port: 4999,
    // root: "." — defaults to the package root (parent of docs/)
  }),
);
```

## Run

```sh
# Node dev — Locally activates automatically
NODE_ENV=development tsx watch docs/node.ts
```

Output:

```
[Locally] mirroring /abs/path/to/repo at http://127.0.0.1:4999/gh (dev jsDelivr mirror)
Ecosy Markdoc docs → http://127.0.0.1:3000
```

Edit any `.md` file under `docs/content/` — the next fetch reflects the change. No commit, no push, no CDN wait.

## What `withLocally` does

1. **Detects runtime** via `new Function("return typeof process...")` — hides the check from bundlers so the same file ships to Workers (no-op) and Node (active).
2. **On Node dev only**:
   - Adds `imports.locally = Locally({...})` which spins up the HTTP server
   - Overrides `provider` to `http://127.0.0.1:<port>/gh`
3. **Node APIs are lazy-loaded** via `new Function("id", "return import(id)")`. The specifier strings are invisible to bundlers, so Workers builds never try to resolve `node:http`.

## Path layout

Locally mirrors jsDelivr's `/gh/<owner>/<repo>(@<branch>)?/<path>` shape. A request to:

```
http://127.0.0.1:4999/gh/your-org/your-docs-repo@main/docs/content/index.md
```

is served from:

```
<root>/docs/content/index.md
```

The `<owner>`, `<repo>`, and `@<branch>` segments are matched but ignored — your local copy is whatever's on disk.

## Pitfalls

- **Running from wrong CWD** — default `root` is the parent of `locally.ts`. If your layout is different, pass `root: "./abs/path"` or a `__dirname`-relative resolution.
- **Port conflict** — default 4999. Change if collision: `port: 5999`.
- **Production accidentally on** — set `NODE_ENV=production` in your deploy config. `withLocally` is a no-op there but the safety net matters.

## Next steps

- [Operator dashboard](/examples/operator-dashboard) — flip between local and remote CDN from the browser
- [Switch CDN provider](/examples/switch-cdn-provider) — when you need zero-cache against the real GitHub
