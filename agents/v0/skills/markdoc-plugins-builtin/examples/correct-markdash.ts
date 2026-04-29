/**
 * ✅ Correct: Markdash gated behind Authen.
 *
 * Markdash exposes three destructive actions (reload manifest, reload engine,
 * clear pages) via POST endpoints. In production, always register `Authen`
 * before it — otherwise anyone reaching `/<prefix>/reload/manifest` can force
 * a cache bust.
 */
import markdoc, { Authen, Markdash } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default markdoc({
  repo: "owner/docs",

  plugins: [
    // Auth first — Markdash endpoints are protected by default here.
    Authen({
      cookieName: "ops_session",
      verify: async (jwt) => {
        try {
          const { payload } = await jose.jwtVerify(jwt, SECRET);
          // Require an explicit `ops` scope so regular users can't hit the dashboard.
          return (payload.scopes as string[] | undefined)?.includes("ops") ?? false;
        } catch {
          return false;
        }
      },
      onUnauthorized: "/login",
      publicPaths: ["/login", "/healthz"],
    }),

    // Dashboard mounts under /_ops/dash — anything below it inherits the auth guard.
    Markdash({ prefix: "_ops/dash" }),
  ],
});

// Dashboard URL: GET  https://<host>/_ops/dash
// Actions:
//   POST https://<host>/_ops/dash/reload/manifest
//   POST https://<host>/_ops/dash/reload/engine
//   POST https://<host>/_ops/dash/clear/pages
