import { Inject } from "./executor";
import { classable } from "../classable/classable";
import { Revalidate } from "./revalidate";
import type { GlobalStatic } from "../classable/global";
import type { Classable } from "../classable/types";
import type { ConfigurationLike } from "./configuration";
import type { MarkdocRequest } from "./request";
import type { MarkdocResponse } from "./response";
import type { RequestContext } from "./request-context";
import type { StoreState } from "./storable";
import type { LiteralObject } from "@ecosy/core";

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
}

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

// ─── Pluginable ────────────────────────────────────────────────────

export interface PluginableLikeLike {
  /** Resolve all plugin instances for the current request. */
  resolve(ctx: RequestContext, store: StoreLike): PluginLike[];

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
  private lastResolved = 0;
  private readonly plugins: readonly PluginableLike[];

  constructor(
    private readonly configuration = Inject<ConfigurationLike>("configuration"),
  ) {
    super();
    this.plugins = (this.configuration.options.plugins ?? []) as PluginableLike[];
    this.revalidate = this.configuration.options.revalidate || 0;
  }

  private isGlobal(plugin: PluginableLike): boolean {
    const target = classable.getTarget(plugin);
    return (target as unknown as Partial<GlobalStatic>).__global === true;
  }

  resolve(ctx: RequestContext, store: StoreLike): PluginLike[] {
    // Check if globals need revalidation
    if (this.shouldRevalidate(this.lastResolved)) {
      this.globals.clear();
    }

    // Clear per-resolve registry
    this.registry.clear();

    const instances = this.plugins.map(plugin => {
      let instance: PluginLike;

      const Target = classable.getTarget<PluginLike>(plugin);

      if (this.isGlobal(plugin)) {
        let cached = this.globals.get(plugin);
        if (!cached) {
          cached = new Target(ctx, store);
          this.globals.set(plugin, cached);
          this.lastResolved = Date.now();
        }
        instance = cached;
      } else {
        instance = new Target(ctx, store);
      }

      // Register by ID for O(1) lookup
      this.registry.set(instance.id, instance);
      return instance;
    });

    return instances;
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
