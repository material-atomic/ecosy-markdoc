import { Inject } from "../core/executor";
import {
  Plugin,
  type PluginConstructor,
  type PluginRegistry,
  type StoreLike,
} from "../core/plugin";
import type { ManifestLike } from "../core/manifestable";
import type { EngineLike } from "../core/engine";
import type { PagableLike } from "../core/pagable";
import type { RequestContext } from "../core/request-context";

// ─── Types ───────────────────────────────────────────────────────────

export type InvalidateTarget = "manifest" | "engine" | "pages";

export interface AutoInvalidateTickResult {
  ok: boolean;
  target: InvalidateTarget;
  /** Elapsed time in milliseconds. */
  elapsed: number;
  /** Present when `ok` is false. */
  error?: unknown;
}

export interface AutoInvalidateOptions {
  /**
   * Interval between cycles, in milliseconds. `0` or omitted disables
   * the timer (the service becomes a no-op).
   */
  interval?: number;

  /**
   * Which caches to invalidate on each tick.
   * @default ["manifest", "engine", "pages"]
   */
  targets?: InvalidateTarget[];

  /**
   * Callback invoked once per target, per tick. Receives the outcome
   * (success or error) and elapsed time. Useful for observability —
   * wire to a logger, metrics collector, or alert pipeline.
   */
  onTick?: (result: AutoInvalidateTickResult) => void;
}

// ─── Runtime detection ───────────────────────────────────────────────
//
// Same opaque-detection pattern as `docs/locally.ts`: a string fed
// through `new Function` keeps bundlers from folding the check at build
// time, so a single bundle works on both Node and edge runtimes.

function isNodeLike(): boolean {
  try {
    const fn = new Function("return typeof process !== 'undefined' && process.release?.name === 'node'");
    return Boolean(fn());
  } catch {
    return false;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * `AutoInvalidate` — built-in plugin that periodically reloads Markdoc
 * caches (manifest, engine, pages). Combines two mechanisms so it works
 * across runtimes:
 *
 *   1. `setInterval` on long-running runtimes (Node, Deno, Bun) — kicked
 *      from `start()` on the first request, lives for the process lifetime.
 *   2. Lazy tick-check in `beginRequest` — covers ephemeral runtimes
 *      (Cloudflare Workers, Vercel Edge) where isolates may be evicted
 *      and timers killed. Each request checks `now - lastTickAt >=
 *      interval` and kicks a tick if overdue. The check is fire-and-forget
 *      so request latency is not affected.
 *
 * Registered as a `__global` plugin so a single instance is reused across
 * requests within the same process/isolate; `lastTickAt` is preserved so
 * the lazy check works across requests without redundant ticks.
 *
 * Register under `plugins` in the Markdoc config:
 *
 * @example
 * ```ts
 * import markdoc, { AutoInvalidate } from "@ecosy/markdoc";
 *
 * const app = markdoc({
 *   repo: "owner/repo",
 *   plugins: [
 *     AutoInvalidate({
 *       interval: 5 * 60_000,              // every 5 minutes
 *       targets: ["manifest", "pages"],    // skip engine components
 *       onTick: ({ ok, target, elapsed, error }) => {
 *         if (!ok) console.error(`${target} reload failed in ${elapsed}ms`, error);
 *       },
 *     }),
 *   ],
 * });
 * ```
 *
 * On edge runtimes the timer cannot be relied on (isolates die between
 * requests), but the lazy `beginRequest` check guarantees ticks fire
 * eventually — at the cost of a small overhead on the first request
 * after `interval` elapses. For interval ranges much longer than the
 * expected isolate lifetime (hours, days), expect ticks to be skipped on
 * idle traffic; pair with an explicit cron trigger or pull-based
 * `revalidate` TTL for stronger guarantees.
 */
export function AutoInvalidate(options: AutoInvalidateOptions): PluginConstructor {
  const interval = options.interval ?? 0;
  const targets: readonly InvalidateTarget[] =
    options.targets ?? ["manifest", "engine", "pages"];

  return class AutoInvalidatePlugin extends Plugin {
    static readonly __global = true;

    constructor(
      ctx: RequestContext,
      store: StoreLike,
      private readonly manifest = Inject<ManifestLike>("manifest"),
      private readonly engine = Inject<EngineLike>("engine"),
      private readonly pagable = Inject<PagableLike>("pagable"),
    ) {
      super(ctx, store);
    }

    /** Set on `start()`; null until then. */
    private timer: ReturnType<typeof setInterval> | null = null;
    /** Epoch ms of the last tick start. Initialized in `start()`. */
    private lastTickAt = 0;
    /** True while a tick is running, to dedupe overlapping kicks. */
    private ticking = false;

    getRegistry(): PluginRegistry {
      return {};
    }

    /**
     * One-time bootstrap. Awaited on first request before pipeline
     * proceeds. Kicks the long-running timer when supported; the lazy
     * check in `beginRequest` covers the rest.
     */
    start(): void {
      this.lastTickAt = Date.now();
      if (interval <= 0) return;
      // Only schedule a real timer where it can survive between requests.
      // On Workers/Edge the isolate gets evicted; the timer dies with it,
      // and beginRequest's lazy check takes over.
      if (isNodeLike()) {
        this.timer = setInterval(() => {
          void this.tickAll();
        }, interval);
      }
    }

    /**
     * Lazy tick check — fires on every request after `start()`. If the
     * interval has elapsed since the last tick, kicks an asynchronous
     * tick without blocking the response. Returns `null` so the request
     * pipeline continues.
     *
     * On Node this is usually redundant (timer keeps `lastTickAt` fresh);
     * on edge it's the actual driver because the timer cannot persist.
     */
    beginRequest(): null {
      if (interval <= 0) return null;
      if (this.ticking) return null;
      if (Date.now() - this.lastTickAt < interval) return null;
      this.lastTickAt = Date.now();
      void this.tickAll();
      return null;
    }

    /**
     * Optional classable lifecycle hook — fired by `disposeInjects()` on
     * graceful shutdown. Stops the timer so the Node event loop can exit.
     */
    onDispose(): void {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    private async tickAll(): Promise<void> {
      if (this.ticking) return;
      this.ticking = true;
      try {
        for (const target of targets) {
          const t0 = performance.now();
          try {
            if (target === "manifest") await this.manifest.reload();
            else if (target === "engine") await this.engine.reload();
            else if (target === "pages") this.pagable.clear();

            options.onTick?.({
              ok: true,
              target,
              elapsed: performance.now() - t0,
            });
          } catch (error) {
            options.onTick?.({
              ok: false,
              target,
              elapsed: performance.now() - t0,
              error,
            });
          }
        }
      } finally {
        this.ticking = false;
      }
    }
  };
}
