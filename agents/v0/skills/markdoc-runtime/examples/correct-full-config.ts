/**
 * ✅ Correct: A production-shape configuration.
 *
 * Combines a GitHub content source, request-scoped plugins (authentication,
 * CORS, layout, feeds, sitemap, dashboard) and the cross-runtime
 * `AutoInvalidate` plugin for periodic cache reloads.
 */
import markdoc, { html } from "@ecosy/markdoc";
import {
  Authen,
  AutoInvalidate,
  Cors,
  Layout,
  RobotsTxt,
  Sitemap,
  RSSFeed,
  Markdash,
} from "@ecosy/markdoc/plugins";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default markdoc({
  // Content source
  repo: "material-atomic/ecosy-docs",
  branch: "main",
  dir: "content",
  revalidate: 5 * 60_000,

  // Request-scoped plugins
  plugins: [
    // Response-level plugins go early so their `endRequest` runs last
    // (the chain is applied in registration order).
    Cors({ origin: "*" }),

    // Auth guard runs via `beginRequest` — returning a Response short-circuits.
    Authen({
      cookieName: "ecosy_session",
      verify: async (jwt) => {
        try {
          await jose.jwtVerify(jwt, SECRET);
          return true;
        } catch {
          return false;
        }
      },
      onUnauthorized: "/login",
      publicPaths: ["/login", "/register", "/healthz"],
    }),

    // Root layout — exactly one required per app.
    Layout({
      template: { root: true },
      getTemplate: html`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>{{ scope.title }}</title>
            {{ head.metadata }}
          </head>
          <body>
            <nav>
              ${(store) =>
                (store.getState().pages as Array<[string, string]>)
                  .map(([title, url]) => `<a href="${url}">${title}</a>`)
                  .join("")}
            </nav>
            <main>{{ body.main }}</main>
          </body>
        </html>
      `,
    }),

    // SEO
    RobotsTxt(),
    Sitemap,

    // Feeds
    RSSFeed({
      title: "Ecosy Docs",
      description: "Latest documentation updates",
      link: "https://docs.ecosy.io",
      items: async (req) => {
        // Resolve feed items dynamically per request (DB, CMS, manifest…).
        const res = await fetch(`${req.mdUrl.origin}/api/feed-items`);
        return res.json();
      },
    }),

    // Ops dashboard — gate behind Authen in production (done above).
    Markdash({ prefix: "_ops/dash" }),

    // Cross-runtime cache invalidation — `setInterval` on Node, lazy
    // `beginRequest` check on Workers/Edge.
    AutoInvalidate({
      interval: 5 * 60_000,
      targets: ["manifest", "pages"],
      onTick: ({ ok, target, elapsed, error }) => {
        if (!ok) console.error(`reload ${target} failed in ${elapsed}ms`, error);
      },
    }),
  ],
});
