import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";
import { Plugin, type PluginRegistry } from "../core/plugin";

// ─── Types ──────────────────────────────────────────────────────────

export interface RobotsRule {
  userAgent: string;
  allow?: string[];
  disallow?: string[];
  crawlDelay?: number;
}

export interface RobotsTxtOptions {
  rules?: RobotsRule[];
  sitemapUrl?: string | string[] | boolean;
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_RULES: RobotsRule[] = [
  { userAgent: "*", allow: ["/"] },
];

// ─── Plugin ─────────────────────────────────────────────────────────

/**
 * RobotsTxt — serves `/robots.txt` for search engine crawlers.
 *
 * Factory function that accepts optional config. Returns a Plugin class.
 *
 * @example
 * ```ts
 * // Default — allow all, auto-detect sitemap
 * plugins: [RobotsTxt(), Sitemap]
 *
 * // Custom rules
 * plugins: [
 *   RobotsTxt({
 *     rules: [
 *       { userAgent: "*", allow: ["/"], disallow: ["/admin", "/api"] },
 *       { userAgent: "Googlebot", allow: ["/"], crawlDelay: 1 },
 *     ],
 *     sitemapUrl: "https://docs.example.com/sitemap.xml",
 *   }),
 * ]
 *
 * // Disable sitemap reference
 * plugins: [RobotsTxt({ sitemapUrl: false })]
 * ```
 */
export function RobotsTxt(options: RobotsTxtOptions = {}) {
  const frozen = Object.freeze({
    rules: Object.freeze(options.rules ?? DEFAULT_RULES) as RobotsRule[],
    sitemapUrl: options.sitemapUrl,
  });

  return class RobotsTxtPlugin extends Plugin {
    static readonly robotsTxt: Readonly<RobotsTxtOptions> = frozen;

    getRegistry(): PluginRegistry {
      return {
        urls: {
          "/robots.txt": {
            summary: "Robots.txt for search engine crawlers",
            method: "GET",
            tags: ["seo"],
          },
        },
      };
    }

    fetch(req: MarkdocRequest, res: MarkdocResponse): MarkdocResponse {
      const lines: string[] = [];

      for (const rule of frozen.rules) {
        lines.push(`User-agent: ${rule.userAgent}`);

        if (rule.allow) {
          for (const path of rule.allow) {
            lines.push(`Allow: ${path}`);
          }
        }

        if (rule.disallow) {
          for (const path of rule.disallow) {
            lines.push(`Disallow: ${path}`);
          }
        }

        if (rule.crawlDelay != null) {
          lines.push(`Crawl-delay: ${rule.crawlDelay}`);
        }

        lines.push("");
      }

      // Sitemap reference
      const sitemapUrls = this.resolveSitemapUrls(req);
      for (const url of sitemapUrls) {
        lines.push(`Sitemap: ${url}`);
      }

      return res
        .text(lines.join("\n").trimEnd())
        .setHeader("content-type", "text/plain; charset=utf-8");
    }

    /**
     * Resolve sitemap URL(s) for the robots.txt output.
     *
     * - `false` → no sitemap line
     * - `true` or `undefined` → auto-detect from request origin + "/sitemap.xml"
     * - `string` → single explicit URL
     * - `string[]` → multiple explicit URLs
     */
    private resolveSitemapUrls(req: MarkdocRequest): string[] {
      const { sitemapUrl } = frozen;

      if (sitemapUrl === false) return [];

      if (typeof sitemapUrl === "string") return [sitemapUrl];

      if (Array.isArray(sitemapUrl)) return sitemapUrl;

      // Auto-detect: use request origin
      const origin = req.mdUrl.origin;
      return origin ? [`${origin}/sitemap.xml`] : [];
    }
  };
}
