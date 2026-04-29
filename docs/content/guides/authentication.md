---
title: Authentication
description: Build a complete login flow with the Authen plugin and custom endpoints
order: 8
---

# Authentication

This guide walks through building a full login flow on top of the [Authen plugin](/plugins/authen). Authen gates every request behind a JWT cookie — you supply the verify function, the login endpoint, and the cookie. Everything else is up to you.

## Overview

A working auth flow has four pieces:

1. **Authen plugin** — gate every non-public request, call your `verify(jwt)` on each one.
2. **Login POST endpoint** — custom plugin that accepts credentials, signs a JWT, sets the cookie.
3. **Login UI** — either rendered inline by Authen (`mode: "render"`) or a dedicated markdown page (public path).
4. **Logout endpoint** (optional) — custom plugin that clears the cookie.

Authen handles #1 and short-circuits unauthorized requests. You write #2, #3, #4 because the login schema (email/password? OAuth? magic link?) is application-specific.

## Prerequisites

Install JWT and password libraries of your choice:

```bash
yarn add jose bcryptjs
```

`jose` for signing/verifying JWTs (works on edge + Node). `bcryptjs` for password hashing. Any equivalents work — `jsonwebtoken`, `argon2`, `scrypt`, etc.

Set a secret in your environment:

```bash
# .env
AUTH_SECRET=<generate with: openssl rand -base64 48>
```

## Step 1 — Login POST endpoint

Write a plugin that registers `POST /auth/login`, parses the body, verifies credentials, signs a JWT, and sets the cookie.

```typescript
// src/plugins/login-endpoint.ts
import { Plugin, type PluginRegistry } from "@ecosy/markdoc";
import type { MarkdocRequest, MarkdocResponse } from "@ecosy/markdoc";
import * as jose from "jose";
import bcrypt from "bcryptjs";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);
const COOKIE_NAME = "ecosy_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export class LoginEndpoint extends Plugin {
  static readonly __global = true;

  getRegistry(): PluginRegistry {
    return {
      urls: {
        "/auth/login": { method: "POST", summary: "Authenticate with email + password" },
      },
    };
  }

  async fetch(req: MarkdocRequest, res: MarkdocResponse) {
    // 1. Parse body — accept JSON or form-encoded
    const contentType = req.header("content-type") ?? "";
    const credentials = contentType.includes("application/json")
      ? await req.json<{ email: string; password: string; return_to?: string }>()
      : await this.parseForm(req);

    // 2. Look up user + verify password (your DB layer)
    const user = await findUserByEmail(credentials.email);
    if (!user) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const ok = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "invalid_credentials" });
    }

    // 3. Sign a JWT with minimal claims
    const jwt = await new jose.SignJWT({ sub: user.id, email: user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(SECRET);

    // 4. Set cookie + redirect to return_to (or "/")
    const cookieValue = [
      `${COOKIE_NAME}=${jwt}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${COOKIE_MAX_AGE}`,
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");

    return res
      .status(302)
      .header("Set-Cookie", cookieValue)
      .header("Location", credentials.return_to ?? "/")
      .toResponse();
  }

  private async parseForm(req: MarkdocRequest) {
    const form = await req.formData();
    return {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      return_to: form.get("return_to") ? String(form.get("return_to")) : undefined,
    };
  }
}
```

`findUserByEmail` and `user.passwordHash` are application-specific — plug in your database layer (D1, PostgreSQL, Prisma, whatever).

## Step 2 — Verify function

The `verify` callback given to `Authen` runs on every gated request. Keep it fast — it blocks the response.

```typescript
// src/auth/verify.ts
import * as jose from "jose";
import type { AuthenVerify } from "@ecosy/markdoc";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET!);

export const verify: AuthenVerify = async (jwt) => {
  try {
    const { payload } = await jose.jwtVerify(jwt, SECRET, {
      algorithms: ["HS256"],
    });
    return !!payload.sub;
  } catch {
    return false; // expired, tampered, malformed
  }
};
```

For richer policies, also inspect the request:

```typescript
export const verify: AuthenVerify = async (jwt, req) => {
  const { payload } = await jose.jwtVerify(jwt, SECRET);
  if (!payload.sub) return false;

  // Tie session to User-Agent (light fingerprinting — defense in depth)
  if (payload.ua && payload.ua !== req.header("user-agent")) {
    return false;
  }
  return true;
};
```

## Step 3 — Assemble the app

```typescript
// src/app.ts
import markdoc, { Authen, RobotsTxt, Sitemap } from "@ecosy/markdoc";
import { LoginEndpoint } from "./plugins/login-endpoint";
import { LogoutEndpoint } from "./plugins/logout-endpoint";
import { verify } from "./auth/verify";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Authen({
      cookieName: "ecosy_session",
      verify,
      onUnauthorized: "/login",
      publicPaths: [
        "/login",           // GET: login form page
        "/auth/login",      // POST: credential submit
        "/auth/logout",     // POST: clear cookie
        "/healthz",
        "/robots.txt",
        "/sitemap.xml",
      ],
    }),
    LoginEndpoint,
    LogoutEndpoint,
    Sitemap,
    RobotsTxt(),
  ],
});

export default app;
```

Order matters conceptually: Authen is listed first because `beginRequest` runs on every request. The other plugins register URLs that participate in normal routing.

## Step 4 — Login UI

Two options for the login form:

### Option A — Markdown page with HTML form

Create `docs/content/login.md`:

```markdown
---
title: Sign in
description: Authenticate to access Ecosy docs
---

<form method="POST" action="/auth/login" style="max-width: 320px; margin: 4rem auto">
  <h1>Sign in</h1>

  <label>Email</label>
  <input name="email" type="email" required />

  <label>Password</label>
  <input name="password" type="password" required />

  <input type="hidden" name="return_to" value="/" />

  <button type="submit">Sign in</button>
</form>
```

Make sure `/login` is in `publicPaths`. When users hit a gated page without a cookie, Authen redirects them to `/login`, the markdown page renders the form, they submit, `LoginEndpoint` handles the POST, cookie gets set, they're redirected back.

To preserve the return URL, Authen's string redirect sends them to `/login`. You can enrich the `Authen` config with a `render` handler that injects the original path:

```typescript
Authen({
  onUnauthorized: {
    mode: "render",
    template: (req) => `
      <form method="POST" action="/auth/login">
        <input type="hidden" name="return_to" value="${req.pathname}" />
        <input name="email" required />
        <input name="password" type="password" required />
        <button>Sign in</button>
      </form>
    `,
  },
  // ...
})
```

### Option B — SPA login page

Serve a static SPA (React, Vue, Svelte) that POSTs JSON to `/auth/login`:

```typescript
// In your SPA
async function login(email: string, password: string) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, return_to: location.pathname }),
    credentials: "include", // send/receive cookies
  });
  if (res.redirected) window.location.href = res.url;
  else window.location.href = "/";
}
```

`LoginEndpoint` handles both form-encoded and JSON via the `content-type` check.

## Step 5 — Logout endpoint

Clear the cookie by issuing `Set-Cookie` with `Max-Age=0`:

```typescript
// src/plugins/logout-endpoint.ts
import { Plugin, type PluginRegistry } from "@ecosy/markdoc";
import type { MarkdocRequest, MarkdocResponse } from "@ecosy/markdoc";

export class LogoutEndpoint extends Plugin {
  static readonly __global = true;

  getRegistry(): PluginRegistry {
    return {
      urls: {
        "/auth/logout": { method: "POST" },
      },
    };
  }

  async fetch(_req: MarkdocRequest, res: MarkdocResponse) {
    const cookie = [
      `ecosy_session=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");

    return res
      .status(302)
      .header("Set-Cookie", cookie)
      .header("Location", "/login")
      .toResponse();
  }
}
```

Trigger from the UI with a POST:

```html
<form method="POST" action="/auth/logout">
  <button type="submit">Sign out</button>
</form>
```

## Security checklist

Baseline hardening for production:

- ✅ **HTTPS everywhere** — without it `HttpOnly`/`Secure` are meaningless.
- ✅ **`HttpOnly`** on the session cookie — prevents JavaScript from reading the token, defeating most XSS token theft.
- ✅ **`Secure`** in production — cookie only sent over HTTPS.
- ✅ **`SameSite=Lax`** minimum — baseline CSRF mitigation. Use `Strict` if you never link in from external sites.
- ✅ **Short JWT expiration** — 7 days max for typical apps, minutes for high-sensitivity. Combine with refresh tokens for longer UX.
- ✅ **Strong password hashing** — bcrypt cost ≥ 12, or argon2id. Never store raw passwords.
- ✅ **Rate limit `/auth/login`** — slow down credential stuffing. Implement as a separate `beginRequest` plugin that counts attempts per IP.
- ✅ **Generic error messages** — return `"invalid_credentials"` whether the email exists or not. Avoid user enumeration.
- ✅ **Rotate `AUTH_SECRET`** — rotating invalidates all existing tokens. Plan a rollover strategy if rotating in production.

## Variations

### Remember me / long-lived sessions

```typescript
const rememberMe = form.get("remember_me") === "on";
const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
```

Sign the JWT with a matching `expirationTime`.

### OAuth / social login

Authen stays the same — `verify` still checks a JWT cookie. What changes is the *login endpoint*:

1. `/auth/oauth/start` plugin redirects to GitHub/Google OAuth URL with state param.
2. `/auth/oauth/callback` plugin receives the code, exchanges it for tokens, fetches user info, signs your own JWT, sets the cookie.

The Authen plugin doesn't know OAuth exists — your JWT just contains whatever claims you wrote.

### Magic link

- `/auth/magic-link/request` accepts email, signs a short-lived JWT (`10m`), emails it as `https://site/auth/magic-link/verify?token=...`.
- `/auth/magic-link/verify` verifies the token, signs a regular session JWT, sets the cookie, redirects to `/`.

Again, Authen's `verify` only sees the final session JWT — the magic link is a transient credential your endpoint exchanges for it.

### Role-based access

Authen only answers "authenticated?" not "authorized?". For per-route roles:

```typescript
Authen({
  verify: async (jwt, req) => {
    const { payload } = await jose.jwtVerify(jwt, SECRET);
    if (!payload.sub) return false;

    // Admin-only paths
    if (req.pathname.startsWith("/admin") && payload.role !== "admin") {
      return false; // treated as unauthorized → redirect to /login
    }

    return true;
  },
  // ...
})
```

For more granular policy (not just pass/block), consider a separate authorization plugin using `beginRequest` that inspects the JWT claims after Authen passes.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Cookie not set in browser | `Secure` set but serving over HTTP | Drop `Secure` in dev or use HTTPS (e.g., `mkcert`) |
| Cookie set but `verify` returns false | `AUTH_SECRET` mismatch between sign + verify | Check env var loaded in both places |
| Infinite redirect to `/login` | `/login` not in `publicPaths` | Add it (and `/auth/login`, `/auth/logout`) |
| `Cannot read body after consumption` | Called `req.json()` twice on same request | Body streams consume once — cache the result |
| Works local, fails production | `SameSite=Lax` not enough for cross-subdomain | Use `SameSite=None; Secure` if the SPA is on a different subdomain |

## Reference

- [Authen plugin](/plugins/authen) — plugin API and configuration types
- [Plugins](/plugins) — general plugin system
- [jose documentation](https://github.com/panva/jose) — JWT library used in examples
