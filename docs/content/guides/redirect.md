---
title: Redirects
description: Build HTTP redirect responses with the redirect() helper
order: 7
---

# Redirects

The `redirect()` helper builds a `Response` that tells the browser to navigate to a new URL. The browser follows the `Location` header and issues a fresh request — standard HTTP redirect semantics.

## Quick example

```typescript
import { redirect } from "@ecosy/markdoc";

// Inside a plugin handler, guard, or unauthorized response:
return redirect("/login");
```

That is functionally equivalent to:

```typescript
return new Response(null, {
  status: 302,
  headers: { Location: "/login" },
});
```

## Signature

```typescript
function redirect(location: string, status?: RedirectStatus): Response;

type RedirectStatus = 301 | 302 | 303 | 307 | 308;
```

- `location` — absolute URL (`https://...`) or relative path (`/login`, `../other`). Relative paths resolve against the request origin at the browser side.
- `status` — HTTP redirect status code. Defaults to `302`.

## Choosing the right status

| Code | Meaning | Method after redirect | Typical use |
|---|---|---|---|
| `301` | Moved Permanently | May change (legacy) | SEO-friendly permanent moves |
| `302` | Found (default) | May change | General-purpose temporary redirect |
| `303` | See Other | Always `GET` | After a successful POST (PRG pattern) |
| `307` | Temporary | Preserves method + body | Temporary redirect where method matters |
| `308` | Permanent | Preserves method + body | Permanent URL migration (method-safe) |

### `303` after POST

The Post-Redirect-Get pattern avoids duplicate form submissions on refresh:

```typescript
// Login endpoint after successful credential check
return redirect("/dashboard", 303);
```

The browser issues a `GET /dashboard`, not a `POST /dashboard`, so the form does not resubmit when the user refreshes the landing page.

### `308` for permanent migration

When you move `/old-path` to `/new-path` permanently and need to preserve method + body (e.g., external services POST to the old URL):

```typescript
return redirect("/new-path", 308);
```

## Relative vs absolute URLs

Browsers resolve relative `Location` values against the current URL origin. Both work, but be aware of the subtle difference:

```typescript
// Same-origin, simplest case
return redirect("/login");

// Explicit absolute — required for cross-origin redirects
return redirect("https://auth.example.com/login");

// Protocol-relative — matches current scheme (http/https)
return redirect("//auth.example.com/login");
```

For external OAuth flows, always use absolute URLs.

## Common patterns

### Auth redirect

```typescript
if (!userIsAuthenticated) {
  return redirect(`/login?return_to=${encodeURIComponent(req.pathname)}`);
}
```

### Post-login landing

```typescript
// Preserve the page the user was trying to reach
const target = req.query("return_to") ?? "/";
return redirect(target, 303);
```

### External OAuth start

```typescript
const state = crypto.randomUUID();
const url = new URL("https://github.com/login/oauth/authorize");
url.searchParams.set("client_id", CLIENT_ID);
url.searchParams.set("redirect_uri", `${req.mdUrl.origin}/auth/callback`);
url.searchParams.set("state", state);
return redirect(url.toString());
```

### Canonical URL enforcement

```typescript
// Force trailing-slash removal
if (req.pathname !== "/" && req.pathname.endsWith("/")) {
  return redirect(req.pathname.slice(0, -1), 308);
}
```

## What this is not

`redirect()` builds an HTTP response. It does **not**:

- Re-enter the server to serve different content at the same URL (that would be an *internal rewrite*, a different feature)
- Track the redirect chain server-side — each request is independent from the server's perspective, and the browser handles following the chain

For use cases where the URL should stay the same but the rendered content comes from a different path, render inline instead of redirecting — for example `Authen`'s `mode: "render"` strategy.

## Exports

```typescript
import { redirect, type RedirectStatus } from "@ecosy/markdoc";
```

Both the function and the status type are part of the root package. No subpath import is required.
