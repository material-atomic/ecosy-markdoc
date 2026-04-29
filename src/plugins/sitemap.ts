import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";
import { Plugin, type PluginRegistry } from "../core/plugin";

export class Sitemap extends Plugin {
  getRegistry(): PluginRegistry {
    return {
      urls: {
        "/sitemap.xml": {
          summary: "XML Sitemap",
          method: "GET",
          tags: ["seo"],
        },
        "/sitemap.json": {
          summary: "JSON Sitemap",
          method: "GET",
          tags: ["seo"],
        },
      },
    };
  }

  fetch(req: MarkdocRequest, res: MarkdocResponse): MarkdocResponse {
    const state = this.store.getState() as Record<string, unknown>;
    const pages = (state.pages ?? []) as [string, string][];

    if (req.pathname === "/sitemap.xml") {
      return res.xml(this.buildXml(pages));
    }

    return res.json(pages.map(([path, url]) => ({ path, url })));
  }

  private buildXml(pages: [string, string][]): string {
    const entries = pages.map(([, url]) => `  <url>\n    <loc>${url}</loc>\n  </url>`).join("\n");

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      entries,
      `</urlset>`,
    ].join("\n");
  }
}
