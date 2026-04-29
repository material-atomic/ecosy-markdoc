---
title: Node.js — Production Server
description: Long-running Node.js deployment with graceful shutdown and auto cache invalidation.
order: 2
---

# Node.js — Production Server

Run Markdoc on Node.js behind a process supervisor (PM2, Docker, systemd) with graceful shutdown and proactive cache invalidation.

## What you'll build

- A single shared app (`app.ts`) that also works on Workers
- A Node.js entry (`server.ts`) that binds the Node HTTP adapter
- `AutoInvalidate` running a background timer to keep caches warm
- SIGTERM / SIGINT handlers that drain in-flight requests before exit

## Layout

```
my-docs/
├── src/
│   ├── app.ts       ← shared runtime (works on both targets)
│   ├── server.ts    ← Node entry
│   └── worker.ts    ← Workers entry (optional)
├── package.json
└── tsconfig.json
```

## Shared app

```typescript
// src/app.ts
import markdoc, { AutoInvalidate } from "@ecosy/markdoc";

export interface AppEnv {
  RUNTIME: "node" | "workers";
}

export function buildApp(env: AppEnv) {
  return markdoc({
    repo: "your-org/your-docs-repo",
    branch: "main",
    dir: "content",
    revalidate: 5 * 60_000,

    imports:
      env.RUNTIME === "node"
        ? {
            // Node only — setInterval would die between requests on Workers
            autoInvalidate: AutoInvalidate({
              interval: 5 * 60_000,
              targets: ["manifest", "pages"],
            }),
          }
        : undefined,
  });
}
```

## Node.js entry

```typescript
// src/server.ts
import { server } from "@ecosy/markdoc/nodejs";
import { buildApp } from "./app";

const app = buildApp({ RUNTIME: "node" });

const PORT = Number(process.env.PORT) || 3000;
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";
const Server = server(app, { port: PORT, hostname: HOSTNAME });

Server.start(() => {
  console.log(`[markdoc] listening on http://${HOSTNAME}:${PORT}`);
});

// ── Graceful shutdown ──────────────────────────────
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[markdoc] received ${signal}, draining...`);

  const timeout = setTimeout(() => {
    console.error("[markdoc] drain timeout exceeded, forcing exit");
    process.exit(1);
  }, 15_000);
  timeout.unref();

  Server.stop((err) => {
    clearTimeout(timeout);
    if (err) {
      console.error("[markdoc] stop error:", err);
      process.exit(1);
    }
    console.log("[markdoc] shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

## Package scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node --import tsx src/server.ts"
  },
  "dependencies": {
    "@ecosy/markdoc": "^0.1.0"
  },
  "devDependencies": {
    "tsx": "^4",
    "typescript": "^5"
  }
}
```

## Why the split

`@ecosy/markdoc` is WinterCG-native — no Node APIs. The Node adapter lives at the separate import `@ecosy/markdoc/nodejs`. Keeping it out of the main entry means bundles for Workers / Deno / Bun stay free of Node-specific code.

The HMR-safe `server()` adapter uses `globalThis` + `Symbol.for` to track the running HTTP server across module reloads, so `tsx watch` picks up your edits without port conflicts.

## Next steps

- [Cloudflare Workers deployment](/examples/cloudflare-workers-minimal) for the Workers entry of the same app
- [Local dev workflow](/examples/local-dev) to iterate without pushing to GitHub
- [Operator dashboard](/examples/operator-dashboard) to reload caches from the browser
