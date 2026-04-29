import { Inject, MarkdocTeleport } from "./executor";
import { classable } from "@ecosy/classable/classable";
import { pushScope, popScope } from "@ecosy/classable/inject";
import { Revalidate } from "./revalidate";
import type { GlobalStatic } from "@ecosy/classable/global";
import type { Classable } from "@ecosy/classable/types";
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
   * Awaited before `beginRequest` runs, so the first request pays the
   * setup cost. Use for one-time work that needs the live runtime to be
   * ready: timer initialization, state seeding, eager cache warm-up.
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

export abstract class Plugin implements PluginLike {
  readonly id: string;

  constructor(
    protected readonly ctx: RequestContext,
    protected readonly store: StoreLike,
  ) {
    // Use class name as base, append sequence for uniqueness
    this.id = `${this.constructor.name}:${++pluginSeq}`;
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
 * Statics such as `__global` / `__layout` are attached at runtime; when
 * a specific factory needs them in its public type, extend this interface:
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

// ─── Pluginable ────────────────────────────────────────────────────

export interface PluginableLikeLike {
  /**
   * Resolve all plugin instances for the current request.
   *
   * Async because newly-instantiated plugins fire their `start()` hook here —
   * `__global` plugins on first cache, transient plugins on every resolve.
   * The returned array is ready to enter the request pipeline.
   */
  resolve(ctx: RequestContext, store: StoreLike): Promise<PluginLike[]>;

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
  private lastResolved = 0;
  private readonly plugins: readonly PluginableLike[];

  constructor(private readonly configuration = Inject<ConfigurationLike>("configuration")) {
    super();
    this.plugins = (this.configuration.options.plugins ?? []) as PluginableLike[];
    this.revalidate = this.configuration.options.revalidate || 0;
  }

  private isGlobal(plugin: PluginableLike): boolean {
    const target = classable.getTarget(plugin);
    return (target as unknown as Partial<GlobalStatic>).__global === true;
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
    // here that delegates key lookups to the live Runtime instance so
    // every plugin's `Inject(...)` default parameter resolves correctly.
    const runtime = MarkdocTeleport.get<Record<string, unknown>>("runtime");
    const scope = {
      hasKey: (key: string) => runtime != null && key in runtime,
      resolve: (key: string) => runtime[key],
    };

    // Plugins whose `start()` we need to await before this resolve returns.
    // Includes both transient plugins (started fresh every resolve) and
    // global plugins on their first cache.
    const toStart: PluginLike[] = [];

    pushScope(scope);
    try {
      for (const plugin of this.plugins) {
        let instance: PluginLike;

        const Target = classable.getTarget<PluginLike>(plugin);

        if (this.isGlobal(plugin)) {
          let cached = this.globals.get(plugin);
          if (!cached) {
            cached = new Target(ctx, store);
            this.globals.set(plugin, cached);
            this.lastResolved = Date.now();
            toStart.push(cached);
          }
          instance = cached;
        } else {
          instance = new Target(ctx, store);
          toStart.push(instance);
        }

        // Register by ID for O(1) lookup
        this.registry.set(instance.id, instance);
      }
    } finally {
      popScope();
    }

    // Fire `start()` for each new instance, deduping concurrent resolves
    // via the `started` WeakMap. Awaited so the request pipeline only
    // proceeds once one-time setup (timers, state seed) is complete.
    if (toStart.length > 0) {
      await Promise.all(
        toStart.map((instance) => {
          if (typeof instance.start !== "function") return Promise.resolve();
          let pending = this.started.get(instance);
          if (!pending) {
            pending = Promise.resolve().then(() => instance.start!());
            this.started.set(instance, pending);
          }
          return pending;
        }),
      );
    }

    return [...this.registry.values()];
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
