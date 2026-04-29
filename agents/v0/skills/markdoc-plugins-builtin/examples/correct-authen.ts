/**
 * ✅ Correct: Authen with JWT verification + redirect on failure.
 *
 * The `verify` callback is the only required knob — it decides whether the
 * JWT is valid for this request. Public paths bypass auth so the login page
 * itself never 302s to itself.
 */
import markdoc, { Authen } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default markdoc({
  repo: "owner/docs",

  plugins: [
    Authen({
      cookieName: "ecosy_session",

      verify: async (jwt, req) => {
        try {
          const { payload } = await jose.jwtVerify(jwt, SECRET);

          // Optional: bind the token to the client IP.
          const ip = req.header("x-forwarded-for")?.split(",")[0]?.trim();
          if (payload.ip && ip && payload.ip !== ip) return false;

          return !!payload.sub;
        } catch {
          return false;
        }
      },

      // On failure, 302 to /login (your login plugin lives below).
      onUnauthorized: "/login",

      // These paths bypass auth — anyone can reach them.
      publicPaths: ["/login", "/register", "/healthz", "/robots.txt", "/sitemap.xml"],
    }),

    // ...more plugins (Layout, Login handler, etc.)
  ],
});
