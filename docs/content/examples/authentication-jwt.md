---
title: Authentication with JWT Cookies
description: Gate the whole site behind a JWT stored in a cookie, with redirect to a login page.
order: 3
---

# Authentication with JWT Cookies

Gate every page behind a JWT cookie. Unauthenticated requests redirect to `/login`; the login endpoint itself bypasses auth so users can always reach it.

## What you'll build

- `Authen` plugin reading a JWT from a cookie
- Custom `verify` function using `jose` (any signing library works)
- Redirect-to-login on failure
- Public paths list so the login/register endpoints are reachable anonymously

## Install

```sh
yarn add @ecosy/markdoc jose
```

## Code

```typescript
import markdoc, { Authen } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default markdoc({
  repo: "your-org/your-docs-repo",
  dir: "content",

  plugins: [
    Authen({
      cookieName: "docs_session",

      // Developer-supplied verifier. Truthy return → pass.
      verify: async (jwt, req) => {
        try {
          const { payload } = await jose.jwtVerify(jwt, SECRET);

          // Optional — bind the token to the client IP
          const ip = req.header("x-forwarded-for")?.split(",")[0]?.trim();
          if (payload.ip && ip && payload.ip !== ip) return false;

          return !!payload.sub;
        } catch {
          return false;
        }
      },

      // On failure, redirect here (relative paths resolved against req origin)
      onUnauthorized: "/login",

      // These paths are never gated — include /login, /register, and any
      // public endpoint (health check, robots.txt, sitemap)
      publicPaths: ["/login", "/register", "/healthz", "/robots.txt", "/sitemap.xml"],
    }),
  ],
});
```

## How it works

`Authen` runs in the **`beginRequest`** lifecycle hook — before the router tries to match any URL. When the cookie is missing or `verify` returns falsy (or throws), the plugin short-circuits with a redirect/render response; otherwise it returns `null` and the request continues to normal routing.

Everything runs server-side. The JWT never leaves the server except as a `Set-Cookie` sent back by your `/login` endpoint (not shown — write it as another plugin).

## Alternative: inline login page

If you don't want to redirect, render the login form inline:

```typescript
Authen({
  verify: yourVerifyFn,
  onUnauthorized: {
    mode: "render",
    template: `<!DOCTYPE html>
      <html>
        <body>
          <form action="/login" method="post">
            <input name="email" type="email" required />
            <input name="password" type="password" required />
            <button>Sign in</button>
          </form>
        </body>
      </html>`,
    status: 401,
  },
})
```

## Alternative: custom handler

For full control over the unauthorized response:

```typescript
Authen({
  verify: yourVerifyFn,
  onUnauthorized: async (req, res) => {
    return res.status(403).json({ error: "forbidden" }).toResponse();
  },
})
```

## Pitfalls

- **Forgetting `/login` in `publicPaths`** creates a redirect loop — `/login` gets gated, redirects to `/login`, loops until the browser gives up.
- **`verify` returning truthy on empty input** opens every anonymous request. Always handle the no-cookie / bad-signature case explicitly.
- **Long `verify` runtime** — `beginRequest` runs on every request. Keep JWT verification cheap; cache public keys if using JWKS.

## Next steps

- [Operator dashboard](/examples/operator-dashboard) — gate `Markdash` behind `Authen` so only operators can reload caches
- [CORS configuration](/examples/cors-configuration) — stack `Cors` + `Authen` on the same app
