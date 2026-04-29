---
title: AutoInvalidate
description: Periodically reload Markdoc caches across edge and Node runtimes
order: 8
---

# AutoInvalidate

`AutoInvalidate` is a built-in **plugin** that periodically invokes the cache reload/clear methods on the manifest, engine, and pagable services. Register it under `plugins` in the Markdoc config; one shared instance lives for the lifetime of the process or isolate.

## Setup

```typescript
import markdoc from "@ecosy/markdoc";
import { AutoInvalidate } from "@ecosy/markdoc/plugins";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    AutoInvalidate({
      interval: 5 * 60_000,            // every 5 minutes
      targets: ["manifest", "pages"],  // skip engine components
      onTick: ({ ok, target, elapsed, error }) => {
        if (!ok) console.error(`${target} reload failed in ${elapsed}ms`, error);
      },
    }),
  ],
});
```

## How it works

`AutoInvalidate` is a `__global` plugin — `Pluginable` instantiates it on the first request and reuses the same instance across subsequent requests. Its constructor injects three runtime services — `manifest`, `engine`, `pagable` — via default parameter values:

```typescript
constructor(
  ctx: RequestContext,
  store: StoreLike,
  private readonly manifest = Inject<ManifestLike>("manifest"),
  private readonly engine = Inject<EngineLike>("engine"),
  private readonly pagable = Inject<PagableLike>("pagable"),
) { super(ctx, store); }
```

Two mechanisms drive the ticks, picked at runtime:

1. **`start()`** runs once when the plugin first resolves — Markdoc awaits this hook before letting the request proceed. On Node-like runtimes (`process.release.name === "node"`) it kicks a real `setInterval` that fires asynchronously for the rest of the process lifetime.
2. **`beginRequest()`** runs on every request and checks `now - lastTickAt >= interval`. If overdue, it kicks an asynchronous tick (fire-and-forget — no impact on response latency) and updates `lastTickAt`. This path is the actual driver on edge runtimes where timers cannot persist between requests.

A `ticking` flag prevents overlapping ticks from running concurrently. If a tick is already in flight, the lazy check no-ops.

On each tick the service loops over the configured targets and:

- `"manifest"` → `manifest.reload()` (re-fetches the manifest tree from CDN)
- `"engine"` → `engine.reload()` (re-fetches component HTML)
- `"pages"` → `pagable.clear()` (drops cached page markdown; next request re-fetches per-page)

Errors from any target are caught and reported via `onTick` with `ok: false`, elapsed time, and the thrown error. The timer keeps running regardless — a failed tick does not stop future ticks.

## Options

```typescript
interface AutoInvalidateOptions {
  interval?: number;
  targets?: InvalidateTarget[];
  onTick?: (result: AutoInvalidateTickResult) => void;
}

type InvalidateTarget = "manifest" | "engine" | "pages";

interface AutoInvalidateTickResult {
  ok: boolean;
  target: InvalidateTarget;
  elapsed: number;     // milliseconds
  error?: unknown;     // present when ok === false
}
```

| Option | Default | Notes |
|---|---|---|
| `interval` | — | Required if you want ticks to fire. `0` or omitted → plugin is a no-op |
| `targets` | `["manifest","engine","pages"]` | Order determines tick order; any subset is valid |
| `onTick` | — | Called once per target per tick; synchronous callback |

## Picking an interval

- **Fast content iteration (development)** — 30–60 seconds. Content edits on GitHub are visible after one revalidate cycle.
- **Moderate production refresh** — 5–15 minutes. Balances CDN load with content freshness; matches the typical lifetime of a Cloudflare Workers isolate.
- **Slow change rate (stable docs)** — 30–60 minutes. Minimal CDN load; on-demand refresh via [Markdash](/plugins/markdash) handles urgent changes.

Shorter intervals mean more CDN fetches. jsDelivr's free tier is generous but not unlimited; very short intervals on a busy site can burn through rate limits.

## Targets — what to include

Each target has different refresh semantics and cost:

- **`manifest`** — cheap. One `_manifest.md` fetch plus nested manifest fetches. Refresh frequently if pages are added or removed often.
- **`engine`** — moderate. One `_components/_manifest.md` fetch plus one fetch per component file. Only refresh when component templates change.
- **`pages`** — free (just clears local Map). Per-page markdown re-fetches happen lazily on the next request for each URL. Keep enabled unless you have a reason to persist stale pages.

For content-only sites (no components, no structural changes), `["pages"]` alone is enough.

## Cross-runtime behavior

| Runtime | Driver | Notes |
|---|---|---|
| Node.js | `setInterval` | Fires deterministically for the process lifetime |
| Deno | lazy `beginRequest` | Detected as non-Node; relies on the per-request check |
| Bun | lazy `beginRequest` | Detected as non-Node; relies on the per-request check |
| Cloudflare Workers | lazy `beginRequest` | Timer cannot survive isolate eviction; ticks fire on the next request after `interval` elapses |
| Vercel Edge | lazy `beginRequest` | Same as Workers |
| Deno Deploy | lazy `beginRequest` | Same as Workers |

The lazy path makes the plugin robust on ephemeral runtimes, but it cannot fire ticks faster than incoming traffic. On a quiet edge deployment with no requests for hours, ticks are skipped until the next visitor arrives. For tight freshness guarantees that don't depend on traffic, pair `AutoInvalidate` with a platform cron trigger (Cloudflare Workers' `[triggers]`, Deno Deploy Cron, Vercel Cron) that pings a warmup URL on the desired cadence.

If your interval is much longer than the expected isolate lifetime (hours, days) **and** traffic is intermittent, prefer Markdoc's `revalidate` config (per-request TTL) — pull-based, runs on every runtime, fires lazily per page rather than globally.

## Composition with Markdash

`AutoInvalidate` (timer + lazy check) and [Markdash](/plugins/markdash) (UI) are complementary:

- **AutoInvalidate** — unattended, silent, periodic. No UI surface.
- **Markdash** — on-demand, visible dashboard with per-service buttons.

Stack both when you want a safety net plus manual control:

```typescript
import markdoc from "@ecosy/markdoc";
import { AutoInvalidate, Markdash, Authen } from "@ecosy/markdoc/plugins";

const app = markdoc({
  repo: "...",
  plugins: [
    Authen({ verify, onUnauthorized: "/login", publicPaths: ["/login"] }),
    Markdash({ prefix: "_ops/dash" }),
    AutoInvalidate({ interval: 10 * 60_000 }),
  ],
});
```

Both end up calling the same `manifest.reload()` / `engine.reload()` / `pagable.clear()` methods — the distinction is *who* triggers them and *when*.

## Graceful shutdown

`AutoInvalidate` implements the classable `onDispose()` lifecycle hook, which clears the `setInterval` timer. When your host app wires `Runtime.disposeInjects(runtime)` into a `SIGINT` / `SIGTERM` handler, the timer stops cleanly and the Node process can exit without waiting for the next tick.

```typescript
import markdoc from "@ecosy/markdoc";
import { server } from "@ecosy/markdoc/nodejs";

const app = markdoc({ /* ...with AutoInvalidate... */ });
const NodeJS = server(app, { port: 3000 });
NodeJS.start(() => console.log("ready"));

async function shutdown() {
  NodeJS.stop(() => {});
  // If you expose the runtime handle:
  //   await Runtime.disposeInjects(runtime)
  // to fire onDispose hooks on all global plugins (including AutoInvalidate).
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

Without `disposeInjects`, the timer ref keeps the Node event loop alive — `process.exit(0)` forces termination anyway, but a clean dispose is nicer for tests and embeddings where processes persist.

## Observability

The `onTick` callback receives per-target results, making it a natural integration point for logs / metrics / traces:

```typescript
import { AutoInvalidate, type AutoInvalidateTickResult } from "@ecosy/markdoc/plugins";

function reportToMetrics(result: AutoInvalidateTickResult) {
  metrics.histogram("markdoc.cache.reload.duration_ms", result.elapsed, {
    target: result.target,
    ok: String(result.ok),
  });
  if (!result.ok) {
    logger.error({
      msg: "cache reload failed",
      target: result.target,
      elapsed: result.elapsed,
      error: result.error,
    });
  }
}

plugins: [
  AutoInvalidate({
    interval: 5 * 60_000,
    onTick: reportToMetrics,
  }),
];
```

`onTick` is synchronous — don't put slow I/O inside it. Use it to hand off to an async logger or metrics batch.

## Exports

```typescript
import {
  AutoInvalidate,
  type AutoInvalidateOptions,
  type AutoInvalidateTickResult,
  type InvalidateTarget,
} from "@ecosy/markdoc/plugins";
```

## See also

- [Plugins](/plugins) — general guide for building plugins
- [Markdash](/plugins/markdash) — companion plugin for on-demand cache invalidation
- [Imports](/imports) — runtime-scoped services with no per-request hooks
