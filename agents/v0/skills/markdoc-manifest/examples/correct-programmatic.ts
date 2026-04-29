/**
 * ✅ Correct: Programmatic manifest resolution in a plugin.
 *
 * `PagePreview` exposes `/api/page-preview?path=/guides/intro` — it resolves
 * the path through the manifest, fetches the raw markdown from the CDN, and
 * returns the first 500 characters. All access goes through `ManifestLike`
 * and `FetchableLike` — no direct URL construction, no filesystem, no git.
 */
import {
  Plugin,
  Inject,
  type PluginConstructor,
  type PluginRegistry,
  type MarkdocRequest,
  type MarkdocResponse,
  type StoreLike,
} from "@ecosy/markdoc";
import type { RequestContext, ManifestLike, FetchableLike } from "@ecosy/markdoc";

export function PagePreview(): PluginConstructor {
  return class PagePreviewPlugin extends Plugin {
    static readonly __global = true;

    constructor(
      ctx: RequestContext,
      store: StoreLike,
      private readonly manifest = Inject<ManifestLike>("manifest"),
      private readonly fetchable = Inject<FetchableLike>("fetchable"),
    ) {
      super(ctx, store);
    }

    getRegistry(): PluginRegistry {
      return {
        urls: {
          "/api/page-preview": { method: "GET", tags: ["api"] },
        },
      };
    }

    async fetch(req: MarkdocRequest, res: MarkdocResponse): Promise<MarkdocResponse> {
      const path = req.query("path");
      if (!path) return res.status(400).json({ error: "missing `path` query" });

      const result = await this.manifest.resolve(path);
      if (!result.found) return res.status(404).json({ error: "not in manifest" });

      const fetchRes = await this.fetchable.http.get<string | null>(result.contentUrl);
      if (!fetchRes.success || !fetchRes.data) {
        return res.status(502).json({ error: "CDN fetch failed" });
      }

      return res.json({
        path,
        contentUrl: result.contentUrl,
        meta: result.meta ?? null,
        preview: fetchRes.data.slice(0, 500),
      });
    }
  };
}
