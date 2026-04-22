import { Serialize } from "@ecosy/core";
import type { RuntimeAccessor } from "./common";
import type { ManifestLike } from "./manifestable";
import type { PluginLike, PluginRouteSchema } from "./plugin";
import type { MarkdocURL } from "./url";

// ─── Route types ────────────────────────────────────────────────────

export type RouteSource = "manifest" | "plugin";

export interface RouteEntry {
  path: string;
  source: RouteSource;
  schema: PluginRouteSchema;
  /** Plugin instance that owns this route. null for manifest routes. */
  plugin: PluginLike | null;
}

/**
 * Match result returned by `Router.match()`.
 * Contains the matched route entry and parsed params.
 */
export interface RouteMatch {
  /** The matched route entry. */
  entry: RouteEntry;
  /** Parsed path params from `:param` segments. Empty object for static routes. */
  params: Record<string, string>;
}

export interface RouterLike {
  readonly routes: ReadonlyMap<string, RouteEntry>;
  resolve(pathname: string): RouteEntry | undefined;
  match(mdUrl: MarkdocURL): RouteMatch | null;
  build(manifest: ManifestLike, plugins: PluginLike[]): void;
}

// ─── Router ─────────────────────────────────────────────────────────

/**
 * Router — merges Manifest URLs and Plugin URLs into a single route table.
 *
 * Priority:
 * 1. Manifest URLs are registered first.
 * 2. Plugin URLs override manifest URLs (same path).
 * 3. Later plugins override earlier plugins (same path).
 */
class RouterNode implements RouterLike {
  readonly routes = new Map<string, RouteEntry>();

  build(manifest: ManifestLike, plugins: PluginLike[]): void {
    this.routes.clear();

    // 1. Register manifest URLs
    for (const [canonicalPath, url] of manifest.getUrls()) {
      this.routes.set(url, {
        path: canonicalPath,
        source: "manifest",
        schema: {},
        plugin: null,
      });
    }

    // 2. Register plugin URLs — overrides manifest, later overrides earlier
    for (const plugin of plugins) {
      const registry = plugin.getRegistry();
      if (!registry.urls) continue;

      if (typeof plugin.fetch !== "function") {
        const name = plugin.constructor?.name ?? "Unknown";
        throw new Error(
          `[Markdoc] Plugin "${name}" registers urls but does not implement fetch(). ` +
          `Plugins with urls must declare a fetch(req, res) method.`,
        );
      }

      for (const [path, schema] of Object.entries(registry.urls)) {
        this.routes.set(path, {
          path,
          source: "plugin",
          schema,
          plugin,
        });
      }
    }
  }

  resolve(pathname: string): RouteEntry | undefined {
    return this.routes.get(pathname);
  }

  /**
   * Match a MarkdocURL against registered routes.
   *
   * Router does not create MarkdocURL — it receives one per-request.
   * 1. Try exact pathname match first (O(1) Map lookup).
   * 2. Fall back to pattern matching for routes with `:param` segments.
   *
   * Returns `null` if no route matches, or `{ entry, params }`.
   */
  match(mdUrl: MarkdocURL): RouteMatch | null {
    // 1. Exact match
    const exact = this.routes.get(mdUrl.pathname);
    if (exact) {
      return { entry: exact, params: {} };
    }

    // 1b. Root "/" → try "/index"
    if (mdUrl.pathname === "/") {
      const index = this.routes.get("/index");
      if (index) {
        return { entry: index, params: {} };
      }
    }

    // 2. Pattern match — routes containing `:param` segments
    const requestSegments = mdUrl.pathname.split("/");

    for (const [pattern, entry] of this.routes) {
      if (!pattern.includes(":")) continue;

      const patternSegments = pattern.split("/");
      if (patternSegments.length !== requestSegments.length) continue;

      const params: Record<string, string> = {};
      let matched = true;

      for (let i = 0; i < patternSegments.length; i++) {
        const seg = patternSegments[i];
        const val = requestSegments[i];

        if (seg.startsWith(":")) {
          params[seg.slice(1)] = Serialize.URL.decode(val);
        } else if (seg !== val) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { entry, params };
      }
    }

    return null;
  }
}

export const Router = {
  target: RouterNode,
  get: (_accessor: RuntimeAccessor) => [] as const,
};
