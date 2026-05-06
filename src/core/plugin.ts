import { Inject, MarkdocTeleport } from "./executor";
import { classable } from "@ecosy/classable/classable";
import { pushScope, popScope } from "@ecosy/classable/inject";
import { Revalidate } from "./revalidate";
import type { GlobalStatic } from "@ecosy/classable/global";
import type { Classable } from "@ecosy/classable/types";
import type { RuntimeContext } from "./common";
import type { ConfigurationLike } from "./configuration";
import type { MarkdocRequest } from "./request";
import type { MarkdocResponse } from "./response";
import type { RequestContext } from "./request-context";
import type { StoreState } from "./storable";
import type { LiteralObject } from "@ecosy/core/types";

// ─── Registry Schema ────────────────────────────────────────────────

/**
 * Swagger-like route definition.
 * Currently minimal — future extensions may include
 * parameters, request body schema, response schema, etc.
 */
export interface PluginRouteSchema {
  summary?: string;
  description?: string;
  method?: string | string[];
  tags?: string[];
}

/**
 * Plugin registry — the schema markdoc defines for plugin capabilities.
 *
 * - `urls`       — route definitions the plugin handles (static assets, API, etc.)
 * - `template`   — named HTML templates (e.g. `{ root: "_template.html" }`)
 *                  Server uses `root` template as the page layout wrapper.
 * - `components` — inline component definitions. Keys are component names,
 *                  values are HTML content strings with `{{ key }}` placeholders.
 *                  Merged into the Engine alongside file-based components.
 *                  Plugin components override file-based components of the same name.
 */
export interface PluginRegistry {
  urls?: Record<string, PluginRouteSchema>;
  template?: Record<string, string>;
  components?: Record<string, string>;
}

// ─── Plugin contracts ───────────────────────────────────────────────

export type StoreLike<S extends LiteralObject = LiteralObject> = {
  getState(): StoreState<S>;
  setState(state: StoreState<S>): void;
};

export interface PluginLike {
  /** Unique plugin identifier. Auto-generated if not provided. */
  readonly id: string;
  getRegistry(): PluginRegistry;
  /**
   * Required if `getRegistry().urls` is non-empty.
   * Handles requests matched to plugin-registered URLs.
   */
  fetch?(req: MarkdocRequest, res: MarkdocResponse): Promise<MarkdocResponse> | MarkdocResponse;
  /**
   * Required if `getRegistry().template` is non-empty.
   * Returns the HTML template string for the given template name.
   */
  getTemplate?(name: string): string | Promise<string>;

  /**
   * One-time bootstrap hook — runs exactly once per plugin instance, on the
   * first request that resolves the plugin. For `__global` plugins this is
   * once per process/isolate; for transient plugins this is once per request
   * (since they are recreated each time).
   *
   * **Default phase (post-preload, parallel):** `start()` is fired during
   * `pluginable.resolve()` but its promise is awaited *in parallel* with
   * `manifest.preload()` / `engine.preload()` — the request pipeline waits
   * for the union of all of them, so plugin start happens roughly alongside
   * preload but does NOT gate it. Use this for self-contained setup that
   * doesn't need to be visible to the manifest fetch (timers, state seed,
   * eager cache warm-up that operates on data the plugin itself holds).
   *
   * **Pre-preload phase (`static __preloadSync = true`):** for plugins that
   * MUST be ready before the manifest/engine fetch begins (e.g. a local
   * filesystem mirror that the runtime's `Fetchable` will hit). When the
   * static marker is set, `pluginable.resolve()` awaits this `start()`
   * sequentially before returning, so it completes before any preload
   * fetch goes out. Costs one extra round-trip latency on the first
   * request — only opt in when the plugin truly intercepts content fetches.
   *
   * Errors thrown here propagate to the request and surface as a 500. If
   * the bootstrap is best-effort (metrics flush, optional warm-up), catch
   * inside the implementation so the request still proceeds.
   */
  start?(): void | Promise<void>;

  /**
   * Pre-routing lifecycle hook — runs after plugins are resolved and
   * BEFORE the router matches any URL.
   *
   * - Return `Response` (or `Promise<Response>`) — short-circuits, ServerNode
   *   returns that response immediately and skips routing.
   * - Return `null`/`undefined` — continue normal flow.
   *
   * Use for cross-cutting concerns: authentication, rate-limiting, CORS
   * preflight, maintenance mode, geo-blocking, request logging with skip logic.
   *
   * Multiple plugins with `beginRequest` are invoked in registration order;
   * short-circuits at the first plugin returning a non-null value.
   */
  beginRequest?(
    req: MarkdocRequest,
    res: MarkdocResponse,
  ): Promise<Response | null | undefined> | Response | null | undefined;

  /**
   * Post-response lifecycle hook — runs AFTER the main handler produces
   * a response and before it is returned to the client.
   *
   * Plugins return a (potentially modified) `Response`. Multiple plugins
   * with `endRequest` form a chain — each receives the previous plugin's
   * output, applying transformations in registration order.
   *
   * Use for response-level concerns: CORS header injection, security
   * headers (CSP, HSTS), compression, response logging, metrics.
   */
  endRequest?(
    req: MarkdocRequest,
    res: MarkdocResponse,
    response: Response,
  ): Response | Promise<Response>;
}

// `any[]` intentional here — `unknown[]` breaks class assignment because
// `unknown` is not assignable to each constructor's concrete param type
// (`(ctx: RequestContext, store: StoreLike) => Plugin` cannot satisfy
// `new (...args: unknown[]) => Plugin`). Classable itself uses `any[]`
// for the same reason ("variance erased via any[]").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginableLike = Classable<PluginLike, any[], never>;

// ─── Base class ─────────────────────────────────────────────────────

/** Auto-incrementing counter for default plugin IDs. */
let pluginSeq = 0;

/**
 * Plugin base class. Subclasses get one inherited affordance beyond the
 * declared `getRegistry()` contract:
 *
 *   - `this.runtime` (read-only `RuntimeContext`) — direct access to
 *     reserved runtime injectables (`configuration`, `engine`, `manifest`,
 *     `fetchable`, `pagable`, `documentation`, `pluginable`, `repo`).
 *     Resolved lazily via `MarkdocTeleport`, safe to call from any method
 *     (the runtime singleton is built before `Pluginable.resolve` ever
 *     instantiates a plugin).
 *
 * Recommended idiom for external plugins:
 *
 * ```ts
 * import { Plugin, type ConfigurationLike } from "@ecosy/markdoc";
 *
 * class MyPlugin extends Plugin {
 *   async fetch(req, res) {
 *     const parser = (this.runtime.configuration as ConfigurationLike).options.parser;
 *     // …
 *   }
 * }
 * ```
 *
 * Built-in plugins may continue to use `Inject<X>("x")` constructor
 * default parameters — both paths resolve to the same instances.
 */
export abstract class Plugin implements PluginLike {
  readonly id: string;

  constructor(
    protected readonly ctx: RequestContext,
    protected readonly store: StoreLike,
  ) {
    // Use class name as base, append sequence for uniqueness
    this.id = `${this.constructor.name}:${++pluginSeq}`;
  }

  /**
   * Live runtime singleton — see {@link RuntimeContext}. Lazy: each
   * access resolves through `MarkdocTeleport` (cheap Map lookup),
   * which means plugins can read this from any method without worrying
   * about construction-order race with the runtime itself.
   */
  get runtime(): RuntimeContext {
    return MarkdocTeleport.get<RuntimeContext>("runtime");
  }

  abstract getRegistry(): PluginRegistry;
}

/**
 * Constructor shape of classes returned by plugin factories
 * (`Authen()`, `Cors()`, `Layout()`, `Markdash()`, ...).
 *
 * All plugin instances are created by `Pluginable.resolve()` via
 * `new Target(ctx, store)` — any extra `Inject(...)` constructor params
 * auto-resolve from their default values, so the public constructor
 * signature is fixed at `(ctx, store) => Plugin`.
 *
 * Annotating factory return types with `PluginConstructor` makes
 * `.d.ts` emit clean: consumers reference a named interface instead
 * of an anonymous class expression (which TS can't serialize when the
 * class body has `private`/`protected` members — TS4094).
 *
 * Statics such as `__global` / `__layout` / `__preloadSync` are attached
 * at runtime; when a specific factory needs them in its public type,
 * extend this interface:
 *
 * ```ts
 * interface LayoutPluginConstructor extends PluginConstructor {
 *   readonly __layout: true;
 *   readonly layout: Readonly<LayoutConfig>;
 * }
 * ```
 */
export interface PluginConstructor {
  new (ctx: RequestContext, store: StoreLike): Plugin;
}

/**
 * Static marker — plugins whose `start()` hook must complete before
 * `manifest.preload()` and `engine.preload()` run. See `PluginLike.start`
 * for when to opt in.
 */
export interface PreloadSyncStatic {
  readonly __preloadSync: true;
}

// ─── Pluginable ────────────────────────────────────────────────────

export interface PluginableLikeLike {
  /**
   * Resolve all plugin instances for the current request.
   *
   * Two-phase lifecycle so plugins can opt into running before content
   * preload:
   *
   *   1. **`__preloadSync: true`** plugins' `start()` is awaited *here*,
   *      before this method returns. Use for plugins that intercept the
   *      runtime's content fetches (filesystem mirrors, request rewriters)
   *      and must be ready before `manifest.preload()` goes out.
   *   2. Other plugins' `start()` is fired in the background; the returned
   *      promises are tracked and await-able via `waitStart()`.
   *
   * Caller pattern in `Server.handleRequest`:
   * ```ts
   * const plugins = await pluginable.resolve(ctx, store); // sync starts done
   * await Promise.allSettled([
   *   manifest.preload(),
   *   engine.preload(),
   *   pluginable.waitStart(),                              // async starts join here
   * ]);
   * ```
   */
  resolve(ctx: RequestContext, store: StoreLike): Promise<PluginLike[]>;

  /**
   * Await the in-flight `start()` promises of plugins that did NOT declare
   * `__preloadSync` — kicked off by `resolve()` but not awaited there.
   * Idempotent and safe to call when there are no pending starts.
   */
  waitStart(): Promise<void>;

  /** Get a plugin by ID. O(1) Map lookup. */
  get(id: string): PluginLike | undefined;

  /** Check if a plugin with the given ID exists. */
  has(id: string): boolean;

  /** All resolved plugin IDs. */
  readonly ids: string[];

  /** Number of resolved plugins. */
  readonly size: number;
}

/**
 * Pluginable — plugin lifecycle manager as a classable.
 *
 * Registered at Runtime level. Manages plugin instantiation,
 * global/transient lifecycle, and provides O(1) lookup by ID.
 *
 * - **Global plugins** (`__global: true`): created once, cached.
 *   Revalidate controls freshness — if expired, globals are recreated.
 * - **Transient plugins** (no `__global`): created fresh per resolve().
 *
 * Each plugin instance gets a unique `id`. The registry Map enables
 * fast lookup without iterating the array.
 */
class PluginableNode extends Revalidate({}) implements PluginableLikeLike {
  /** Global plugin cache — survives across requests. */
  private readonly globals = new Map<PluginableLike, PluginLike>();
  /** ID → instance lookup — rebuilt on each resolve(). */
  private readonly registry = new Map<string, PluginLike>();
  /**
   * Track plugins whose `start()` hook has already fired (or is in flight).
   * Stored as the resolved Promise so concurrent resolves dedupe — first
   * caller awaits the actual `start()`, the rest await the cached Promise.
   * Cleared in `dispose()`; entries for evicted globals fall out
   * naturally because the WeakMap loses its key.
   */
  private readonly started = new WeakMap<PluginLike, Promise<void>>();
  /**
   * Pending non-`__preloadSync` `start()` promises from the current
   * resolve cycle. `resolve()` populates this; `waitStart()` awaits and
   * clears. Held as a strong-reference array (not WeakMap) because we
   * need to iterate; entries fall out of memory each time `waitStart()`
   * resets.
   */
  private pendingAsyncStarts: Promise<void>[] = [];
  private lastResolved = 0;
  private readonly plugins: readonly PluginableLike[];

  constructor(private readonly configuration = Inject<ConfigurationLike>("configuration")) {
    super();
    this.plugins = (this.configuration.options.plugins ?? []) as PluginableLike[];
    this.revalidate = this.configuration.options.revalidate || 0;
  }

  /**
   * Live runtime singleton — same accessor pattern as `Plugin.runtime`.
   * Lazy via `MarkdocTeleport`; safe to read from any method (Pluginable
   * is itself part of Runtime, but methods only run after construction).
   */
  get runtime(): RuntimeContext {
    return MarkdocTeleport.get<RuntimeContext>("runtime");
  }

  private isGlobal(plugin: PluginableLike): boolean {
    const target = classable.getTarget(plugin);
    return (target as unknown as Partial<GlobalStatic>).__global === true;
  }

  private isPreloadSync(plugin: PluginableLike): boolean {
    const target = classable.getTarget(plugin);
    return (target as unknown as Partial<PreloadSyncStatic>).__preloadSync === true;
  }

  /**
   * Schedule a plugin's `start()` (deduped via the `started` WeakMap) and
   * return the promise. Plugins with no `start` method short-circuit to a
   * resolved promise.
   */
  private scheduleStart(instance: PluginLike): Promise<void> {
    if (typeof instance.start !== "function") return Promise.resolve();
    let pending = this.started.get(instance);
    if (!pending) {
      pending = Promise.resolve().then(() => instance.start!());
      this.started.set(instance, pending);
    }
    return pending;
  }

  async resolve(ctx: RequestContext, store: StoreLike): Promise<PluginLike[]> {
    // Check if globals need revalidation
    if (this.shouldRevalidate(this.lastResolved)) {
      this.globals.clear();
    }

    // Clear per-resolve registry
    this.registry.clear();

    // Plugin constructors declare runtime dependencies via
    // `= Inject<T>("manifest")` default parameters. `Inject` walks the
    // classable scope stack — empty by default because Runtime has
    // already committed by the time plugins resolve. Push a thin scope
    // here that delegates key lookups to the live runtime so every
    // plugin's `Inject(...)` default parameter resolves correctly.
    // (`Plugin.runtime` getter is the recommended path for new plugins,
    // but the scope is still required for the legacy `Inject<T>` idiom
    // that built-in plugins use.)
    const runtimeRecord = this.runtime as unknown as Record<string, unknown>;
    const scope = {
      hasKey: (key: string) => key in runtimeRecord,
      resolve: (key: string) => runtimeRecord[key],
    };

    // Plugins whose `start()` needs to be scheduled. Split during
    // instantiation by their `__preloadSync` marker so the request
    // pipeline can await sync starts before content preload, and
    // background-await non-sync starts in parallel with preload.
    const toStartSync: PluginLike[] = [];
    const toStartAsync: PluginLike[] = [];

    pushScope(scope);
    try {
      for (const plugin of this.plugins) {
        let instance: PluginLike;
        let isNew = false;

        const Target = classable.getTarget<PluginLike>(plugin);

        if (this.isGlobal(plugin)) {
          let cached = this.globals.get(plugin);
          if (!cached) {
            cached = new Target(ctx, store);
            this.globals.set(plugin, cached);
            this.lastResolved = Date.now();
            isNew = true;
          }
          instance = cached;
        } else {
          instance = new Target(ctx, store);
          isNew = true;
        }

        if (isNew) {
          if (this.isPreloadSync(plugin)) toStartSync.push(instance);
          else toStartAsync.push(instance);
        }

        // Register by ID for O(1) lookup
        this.registry.set(instance.id, instance);
      }
    } finally {
      popScope();
    }

    // Phase 1: `__preloadSync` plugins — must be ready before content
    // preload runs. Awaited sequentially as a group (parallel within
    // group, awaited as a whole). Errors propagate so the request 500s
    // immediately rather than silently leaving the plugin un-started.
    if (toStartSync.length > 0) {
      await Promise.all(toStartSync.map((instance) => this.scheduleStart(instance)));
    }

    // Phase 2: regular plugins — start() runs in background; caller
    // awaits via `waitStart()` in parallel with manifest/engine preload.
    // Reset the pending-starts list to this cycle's batch.
    this.pendingAsyncStarts = toStartAsync.map((instance) => this.scheduleStart(instance));

    return [...this.registry.values()];
  }

  async waitStart(): Promise<void> {
    if (this.pendingAsyncStarts.length === 0) return;
    const pending = this.pendingAsyncStarts;
    this.pendingAsyncStarts = [];
    await Promise.all(pending);
  }

  get(id: string): PluginLike | undefined {
    return this.registry.get(id);
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }

  get ids(): string[] {
    return [...this.registry.keys()];
  }

  get size(): number {
    return this.registry.size;
  }

  static dispose(instance: PluginableNode) {
    instance.globals.clear();
    instance.registry.clear();
    instance.lastResolved = 0;
  }
}

export type { PluginableNode };

export const Pluginable = PluginableNode;
