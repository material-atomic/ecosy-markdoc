/**
 * ✅ Correct: RobotsTxt + Sitemap combo for full SEO coverage.
 *
 * `Sitemap` is a plugin *class* — drop it in directly, no factory call.
 * `RobotsTxt` defaults to `allow: /` for all agents and auto-detects the
 * sitemap URL from the request origin.
 */
import markdoc, { RobotsTxt, Sitemap } from "@ecosy/markdoc";

export default markdoc({
  repo: "owner/docs",

  plugins: [
    // Sitemap auto-enumerates every manifest-known page into /sitemap.xml.
    // Note: no `()` — Sitemap is a class, not a factory.
    Sitemap,

    // Robots policy. With no args, equivalent to:
    //   User-agent: *
    //   Allow: /
    //   Sitemap: <origin>/sitemap.xml
    RobotsTxt({
      rules: [
        { userAgent: "*", allow: ["/"], disallow: ["/admin", "/_ops"] },
        { userAgent: "Googlebot", allow: ["/"], crawlDelay: 1 },
      ],

      // `true` (or omit) → auto-detect; string/array → explicit URLs;
      // `false` → no sitemap line.
      sitemapUrl: true,
    }),
  ],
});
