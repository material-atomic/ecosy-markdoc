---
title: Operator Dashboard with Markdash
description: Browser-based dashboard to reload caches + flip the content source (e.g. jsDelivr ↔ raw.githubusercontent) live.
order: 8
---

# Operator Dashboard with Markdash

`Markdash` is a small built-in dashboard that lets operators invalidate caches and (optionally) swap the content source without restarting the runtime. Essential for production where jsDelivr's 24h cache makes fresh edits slow to propagate.

## What you'll build

- Dashboard UI at `/_ops/dash`
- Buttons to reload manifest, reload engine components, clear page cache
- A **Content source** card to flip between jsDelivr and `raw.githubusercontent.com` live
- All endpoints gated behind `Authen` with an `ops` scope check

## Code

```typescript
import markdoc, { Authen, Markdash } from "@ecosy/markdoc";
import * as jose from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export default markdoc({
  repo: "your-org/your-docs-repo",
  dir: "content",

  plugins: [
    // Gate first — every Markdash route requires the ops scope
    Authen({
      cookieName: "ops_session",
      verify: async (jwt) => {
        try {
          const { payload } = await jose.jwtVerify(jwt, SECRET);
          const scopes = (payload.scopes as string[] | undefined) ?? [];
          return scopes.includes("ops");
        } catch {
          return false;
        }
      },
      onUnauthorized: "/login",
      publicPaths: ["/login", "/healthz"],
    }),

    // Now drop the dashboard in. `enableSwitchSource: true` adds the
    // Content source card + configure/reset/inspect endpoints.
    Markdash({
      prefix: "_ops/dash",
      enableSwitchSource: true,
    }),
  ],
});
```

## URLs exposed

Base endpoints (always on):

- `GET  /_ops/dash` — the HTML dashboard
- `POST /_ops/dash/reload/manifest` — re-fetch `_manifest.md` tree
- `POST /_ops/dash/reload/engine` — re-fetch `_components/*`
- `POST /_ops/dash/clear/pages` — drop the page render cache

With `enableSwitchSource: true`:

- `GET  /_ops/dash/inspect/documentation` — read current `provider` + `interpolate`
- `POST /_ops/dash/configure/documentation` — body `{ provider?, interpolate? }` → updates live + clears page cache
- `POST /_ops/dash/reset/documentation` — restore provider/interpolate to the values set at `markdoc(config)` time

## Typical workflow

Team pushes new docs at 14:00. jsDelivr caches for ~24 h — the content won't reflect until the CDN refreshes on its own.

1. Operator opens `/_ops/dash`, authenticated
2. Clicks **Content source** → **raw.githubusercontent**
   - Runtime flips provider + interpolate live, clears page cache
   - Next request fetches directly from GitHub raw (zero cache)
3. Operator verifies the new content renders correctly
4. Clicks **Content source** → **Reset to startup config**
   - Provider flips back to the configured default (jsDelivr or whatever)
   - Page cache cleared again; subsequent requests use the normal CDN

## Semantics of `reset`

`reset()` restores `provider` and `interpolate` to **whatever `markdoc(config)` originally set**, not hardcoded defaults. If your config explicitly pointed at an internal proxy, reset returns there — not to jsDelivr.

## Custom provider via the form

The **Apply custom** button accepts free-form provider + interpolate inputs. Use for ad-hoc testing — e.g. switching to a staging CDN for the duration of a rollout.

```
provider:     https://cdn-staging.example.com/docs
interpolate:  {provider}/{repo}/{branch}{dir}{path}
```

## Pitfalls

- **`Markdash` before `Authen`** — order matters. `beginRequest` plugins run in registration order; if `Markdash` is before `Authen`, dashboard routes match first, `Authen` never sees them. Always register gates ahead of the dashboard.
- **Shipping `enableSwitchSource: true` without auth** — anyone on the internet can flip your CDN runtime. Always gate behind `Authen` (or network-level ACLs) in production.
- **Expecting cache auto-refresh** — the runtime re-fetches lazily on the next request after TTL expires. The dashboard buttons trigger immediate invalidation; `revalidate` is passive. Pair with the `AutoInvalidate` plugin for proactive refresh.

## Next steps

- [Authentication with JWT](/examples/authentication-jwt) — the full `Authen` setup referenced here
- [Switch CDN provider](/examples/switch-cdn-provider) — programmatic (non-dashboard) override at config time
