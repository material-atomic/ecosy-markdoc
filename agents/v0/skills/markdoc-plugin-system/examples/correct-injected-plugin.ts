/**
 * ✅ Correct: Plugin that injects runtime dependencies.
 *
 * Exposes `/api/pages` — a JSON listing of every page the `Manifest` knows
 * about. The constructor declares `manifest` as a default-param `Inject<…>`,
 * which the classable substrate resolves from the runtime automatically.
 *
 * Importing `StoreLike`, `RequestContext` (from `@ecosy/markdoc`'s internal
 * re-exports) is only needed when you type the constructor explicitly.
 */
import {
  Plugin,
  Inject,
  type PluginConstructor,
  type PluginRegistry,
  type StoreLike,
  type MarkdocRequest,
  type MarkdocResponse,
} from "@ecosy/markdoc";
import type { RequestContext } from "@ecosy/markdoc";
import type { ManifestLike } from "@ecosy/markdoc";

export function PagesAPI(): PluginConstructor {
  return class PagesAPIPlugin extends Plugin {
    static readonly __global = true;

    constructor(
      ctx: RequestContext,
      store: StoreLike,
      private readonly manifest = Inject<ManifestLike>("manifest"),
    ) {
      super(ctx, store);
    }

    getRegistry(): PluginRegistry {
      return {
        urls: {
          "/api/pages": {
            summary: "List all manifest pages as JSON",
            method: "GET",
            tags: ["api"],
          },
        },
      };
    }

    async fetch(_req: MarkdocRequest, res: MarkdocResponse): Promise<MarkdocResponse> {
      const pages = await this.manifest.list();
      return res.json({ count: pages.length, pages });
    }
  };
}
