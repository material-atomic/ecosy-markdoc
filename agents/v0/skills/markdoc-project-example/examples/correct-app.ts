/**
 * ✅ Correct: Shared `src/app.ts`.
 *
 * Built once, re-used by both the Workers and Node.js entries.
 * Environment variables are resolved at import time from a `getEnv`
 * helper so the same file works under `process.env` (Node) and `env`
 * bindings (Workers — see the worker entry for how it's passed).
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

export interface AppEnv {
  JWT_SECRET: string;
  RUNTIME: "workers" | "node";
}

export function buildApp(env: AppEnv) {
  const SECRET = new TextEncoder().encode(env.JWT_SECRET);

  return markdoc({
    repo: "material-atomic/ecosy-docs",
    branch: "main",
    dir: "content",
    revalidate: 5 * 60_000,

    plugins: [
      // 1. Response-level concerns (registered early → last in endRequest)
      Cors({ origin: "*" }),

      // 2. Security / rate-limiting guards would go here (not shown)

      // 3. Authn / Authz
      Authen({
        cookieName: "ecosy_session",
        verify: async (jwt) => {
          try {
            const { payload } = await jose.jwtVerify(jwt, SECRET);
            return !!payload.sub;
          } catch {
            return false;
          }
        },
        onUnauthorized: "/login",
        publicPaths: ["/login", "/register", "/healthz", "/robots.txt", "/sitemap.xml"],
      }),

      // 4. Mandatory root layout
      Layout({
        template: { root: true },
        payload: { siteName: "Ecosy Docs", year: new Date().getFullYear() },
        getTemplate: html`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>{{ scope.title }} — {{ siteName }}</title>
              {{ head.metadata }}
              {{ head.links }}
              {{ head.style }}
            </head>
            <body>
              <header><a href="/">{{ siteName }}</a></header>
              <main class="container">{{ body.main }}</main>
              <footer>&copy; {{ year }} — {{ siteName }}</footer>
              {{ body.scripts }}
            </body>
          </html>
        `,
      }),

      // 5. Content-contributing plugins
      RobotsTxt(),
      Sitemap,
      RSSFeed({
        title: "Ecosy Docs",
        description: "Latest docs updates",
        link: "https://docs.ecosy.io",
        items: async (req) => {
          const res = await fetch(`${req.mdUrl.origin}/api/feed-items`);
          return res.json();
        },
      }),

      // 6. Ops dashboards — Markdash is gated by Authen above.
      Markdash({ prefix: "_ops/dash" }),

      // 7. Cross-runtime cache invalidation — works on both Workers and Node.
      AutoInvalidate({
        interval: 5 * 60_000,
        targets: ["manifest", "pages"],
      }),
    ],
  });
}
