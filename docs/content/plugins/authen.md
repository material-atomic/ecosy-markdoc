---
title: Authen
description: Block requests with JWT cookie authentication, redirect or render inline login UI
order: 4
---

# Authen

The Authen plugin gates every request behind JWT cookie authentication. Requests without a valid token either redirect to a login page or render an inline login UI — you choose per use case.

## Setup

```typescript
import { markdoc, Authen } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
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
      publicPaths: ["/login", "/register", "/healthz"],
    }),
  ],
});

export default app;
```

## How it works

Authen is a **global plugin** — one instance across all requests. It hooks into the `beginRequest` lifecycle, runs before the router matches any URL, and can short-circuit the response.

The flow per request:

1. **Public path check** — if `req.pathname` is in `publicPaths`, skip auth entirely and continue.
2. **Cookie read** — extract JWT from `req.cookie(cookieName)`. If missing → unauthorized.
3. **Verify** — call `options.verify(jwt, req)`. If it returns truthy, continue. If falsy or throws → unauthorized.
4. **Unauthorized** — generate a response according to `onUnauthorized` (redirect, inline render, or custom handler).

No URL routes are registered by the plugin itself. Developers implement `/login` and related endpoints as plain markdoc pages (marked public) or via a separate plugin.

## Cookie source

```typescript
Authen({
  cookieName: "token",  // default: "token"
  // ...
})
```

The plugin reads `req.cookie(cookieName)`. Cookies are auto-parsed from the `Cookie` header by the core request layer. If the cookie is absent or empty, the request is treated as unauthenticated (`verify` is not called).

To use a header instead of a cookie (e.g. `Authorization: Bearer ...`), write a custom `verify` that reads `req.header("authorization")` and return truthy without relying on the cookie value — but typically you still need a token source. A future version may accept `{ source: "header" }`.

## Verify function

```typescript
type AuthenVerify = (
  jwt: string,
  req: MarkdocRequest,
) => boolean | Promise<boolean>;
```

Truthy return means the request passes. The plugin does not interpret the JWT payload itself — that is the developer's responsibility via `verify`. You are free to:

- Use any JWT library (`jose`, `jsonwebtoken`, custom HS256 check)
- Combine JWT verification with a database lookup (session ID, revocation list)
- Check claims against the current request (IP, User-Agent, path)
- Throw on invalid tokens — `Authen` catches and treats as unauthorized

```typescript
Authen({
  verify: async (jwt, req) => {
    const { payload } = await jose.jwtVerify(jwt, SECRET);

    // Extra policy: deny if token IP doesn't match request IP
    if (payload.ip && payload.ip !== req.header("x-real-ip")) {
      return false;
    }

    return !!payload.sub;
  },
  // ...
})
```

## Unauthorized strategies

The `onUnauthorized` option accepts three shapes:

### String → redirect

Simplest case. Relative paths are resolved against the request origin.

```typescript
Authen({
  onUnauthorized: "/login",
  // ...
})
```

Generates `302 Found` with `Location: /login`. Absolute URLs (`https://...`) are passed through unchanged.

### Render config → inline login UI

Return HTML directly without redirect. Good for single-page login forms that submit to an API endpoint.

```typescript
Authen({
  onUnauthorized: {
    mode: "render",
    template: `
      <!DOCTYPE html>
      <html>
        <head><title>Login</title></head>
        <body>
          <form method="POST" action="/auth/login">
            <input name="email" type="email" required />
            <input name="password" type="password" required />
            <button>Sign in</button>
          </form>
        </body>
      </html>
    `,
    status: 401,
    contentType: "text/html; charset=utf-8",
  },
  // ...
})
```

The `template` can also be a function that receives the request and returns HTML dynamically — useful for including the original path as a return URL:

```typescript
Authen({
  onUnauthorized: {
    mode: "render",
    template: (req) => `
      <form method="POST" action="/auth/login">
        <input type="hidden" name="return_to" value="${req.pathname}" />
        <!-- fields -->
      </form>
    `,
  },
  // ...
})
```

Defaults: `status: 401`, `contentType: "text/html; charset=utf-8"`.

### Custom handler → full control

Return any `Response` you need — JSON error body, redirect with custom cookie, 403 forbidden page, etc.

```typescript
Authen({
  onUnauthorized: async (req, res) => {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  },
  // ...
})
```

The handler receives `MarkdocRequest` and `MarkdocResponse` but returns a native `Response`. You can use `res` to build the response and call `res.toResponse()` if preferred.

## Public paths

Paths in `publicPaths` bypass authentication entirely. Exact match against `req.pathname` — no glob or regex.

```typescript
Authen({
  publicPaths: [
    "/login",
    "/register",
    "/forgot-password",
    "/healthz",
    "/sitemap.xml",
    "/robots.txt",
  ],
  // ...
})
```

Typical entries:

- **Auth endpoints** — `/login`, `/register`, `/forgot-password` must be reachable without auth
- **Health checks** — `/healthz`, `/ready` for load balancers and monitoring
- **SEO artifacts** — `/sitemap.xml`, `/robots.txt` if you want crawlers to see them

If the path is missing from this list, even a public file gets blocked — always include `/sitemap.xml` when using the Sitemap plugin on a gated site if search engines should still discover content.

## Integration with login flow

The plugin only blocks requests; you still implement the login endpoint, the login UI, and (optionally) logout yourself. Authen stays agnostic about your credential schema — email/password, OAuth, magic link, SSO — because each application has different needs.

The full flow is:

1. User hits a protected page without a valid cookie.
2. Authen redirects (or renders) the login UI.
3. User submits credentials to your `/auth/login` endpoint (custom plugin you write).
4. Your endpoint verifies credentials via `req.json()` / `req.formData()`, signs a JWT, and sets the cookie via `Set-Cookie` header.
5. User retries the original page — cookie now present, `verify` returns truthy, page renders.

`MarkdocRequest` exposes body accessors — `req.json<T>()`, `req.formData()`, `req.text()`, `req.arrayBuffer()` — so your endpoint can parse whatever content type the form submits. The plugin itself never touches the body; reading and validating it is entirely your endpoint's job.

See the [Authentication guide](/guides/authentication) for a complete working example: a login POST endpoint, a logout endpoint, security hardening, and variations (remember me, OAuth, magic link, role-based access).

## Configuration types

```typescript
interface AuthenOptions {
  cookieName?: string;                                    // default "token"
  verify: AuthenVerify;                                   // required
  onUnauthorized: string | AuthenRenderConfig | AuthenHandler;
  publicPaths?: string[];                                 // default []
}

type AuthenVerify = (
  jwt: string,
  req: MarkdocRequest,
) => boolean | Promise<boolean>;

interface AuthenRenderConfig {
  mode: "render";
  template: string | ((req: MarkdocRequest) => string | Promise<string>);
  contentType?: string;   // default "text/html; charset=utf-8"
  status?: number;        // default 401
}

type AuthenHandler = (
  req: MarkdocRequest,
  res: MarkdocResponse,
) => Response | Promise<Response>;
```

## Why `beginRequest`

Authen uses a lifecycle hook that runs **before the router matches any URL**. This means:

- Authentication applies uniformly to every page, including plugin-registered routes.
- You cannot forget to guard a new route — it is gated by default.
- `publicPaths` is the only allow-list.

The hook is available to any plugin that implements `beginRequest(req, res)` on the `PluginLike` interface. Other cross-cutting plugins (rate limiting, CORS, geo-blocking, maintenance mode) can use the same extension point.

## Exports

```typescript
import {
  Authen,
  type AuthenOptions,
  type AuthenVerify,
  type AuthenRenderConfig,
  type AuthenHandler,
} from "@ecosy/markdoc";
```

`Authen` is a factory that returns a Plugin class. Pass the result into `plugins[]`:

```typescript
plugins: [Authen({ verify, onUnauthorized })]
```
