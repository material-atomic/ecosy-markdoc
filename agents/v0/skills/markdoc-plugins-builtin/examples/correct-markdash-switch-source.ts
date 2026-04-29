/**
 * ✅ Correct: Markdash with the `enableSwitchSource` flag on.
 *
 * When the content team pushes to GitHub, jsDelivr typically caches the
 * result for ~24 hours. That's fine in production but painful during
 * active documentation work. Flipping this flag gates a new **Content
 * source** card on the dashboard: an operator can swap
 * `Documentation.provider` + `interpolate` to `raw.githubusercontent.com`
 * (zero-cache) to see fresh content immediately, then flip back to
 * jsDelivr once the CDN catches up.
 *
 * Each switch automatically clears the page cache (`pagable.clear()`)
 * so the next request hits the new source. Always gate Markdash behind
 * `Authen` when this flag is on — the dashboard can rewrite runtime
 * state that affects every incoming request.
 */
import markdoc, { Authen, Markdash } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default markdoc({
  repo: "owner/docs",

  plugins: [
    // Production gate — require the `ops` scope to reach any Markdash route.
    Authen({
      cookieName: "ops_session",
      verify: async (jwt) => {
        try {
          const { payload } = await jose.jwtVerify(jwt, SECRET);
          return (payload.scopes as string[] | undefined)?.includes("ops") ?? false;
        } catch {
          return false;
        }
      },
      onUnauthorized: "/login",
      publicPaths: ["/login", "/healthz"],
    }),

    Markdash({
      prefix: "_ops/dash",

      // Turn on the extra endpoints + the Content-source dashboard card.
      // Off by default on purpose — this mutates runtime state live.
      enableSwitchSource: true,
    }),
  ],
});

// New endpoints that appear because `enableSwitchSource` is true:
//
//   GET  https://<host>/_ops/dash/inspect/documentation
//         → { ok: true, provider, interpolate }
//
//   POST https://<host>/_ops/dash/configure/documentation
//         Body: { provider?: string | null, interpolate?: string | null }
//         → clears pagable + applies update + returns new state
//
//   POST https://<host>/_ops/dash/reset/documentation
//         → restores provider + interpolate captured at startup
//           (NOT the jsDelivr hard-coded default — whatever the config set)
