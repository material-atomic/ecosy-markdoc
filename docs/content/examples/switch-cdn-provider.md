---
title: Switch CDN Provider — raw.githubusercontent
description: Point the runtime at a different CDN (or private proxy) by changing provider + interpolate.
order: 6
---

# Switch CDN Provider

By default, Markdoc fetches content through jsDelivr (`https://cdn.jsdelivr.net/gh/...`). When you need a different CDN — zero-cache during active authoring, a company-internal proxy, or a private artifact host — override `provider` and `interpolate`.

## The `provider` + `interpolate` pair

Both options are declared together in the config:

- **`provider`** — base URL (defaults to `https://cdn.jsdelivr.net/gh`)
- **`interpolate`** — URL template with `{provider}`, `{repo}`, `{branch}`, `{dir}`, `{path}` placeholders (defaults to `{provider}/{repo}{branch}{dir}{path}`, the jsDelivr shape)

Override `interpolate` whenever the target CDN uses a different URL layout.

## Example 1 — raw.githubusercontent.com

GitHub's raw CDN serves files directly from the repo without jsDelivr's cache. URL layout:

```
https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
```

Note the separator between `<repo>` and `<branch>` is `/` (not `@`) and there's no `gh/` prefix.

```typescript
import markdoc from "@ecosy/markdoc";

export default markdoc({
  repo: "your-org/your-docs-repo",
  branch: "main",
  dir: "content",

  provider: "https://raw.githubusercontent.com",
  interpolate: "{provider}/{repo}/{branch}{dir}{path}",
});
```

Pros: zero-cache — every edit pushed to the branch is live immediately.
Cons: GitHub rate-limits raw.githubusercontent, so not suitable for production traffic.

## Example 2 — internal CDN proxy

A company-internal CDN that fronts your private repo. Suppose the proxy accepts:

```
https://docs-cdn.internal/fetch/<owner>/<repo>/<branch>/<path>
```

Then:

```typescript
markdoc({
  repo: "internal/docs",
  provider: "https://docs-cdn.internal/fetch",
  interpolate: "{provider}/{repo}/{branch}{dir}{path}",
});
```

## Example 3 — versioned tag pinning

If you always want a specific tag:

```typescript
markdoc({
  repo: "your-org/your-docs-repo",
  branch: "v2.3.1", // Markdoc adds `@` prefix for jsDelivr automatically
});
```

Works with the default provider. For custom providers where branch is a path segment, adjust `interpolate` accordingly.

## What the runtime does

`Documentation.getContentUrl({ path })` assembles the URL using `Serialize.interpolate(this.interpolate, { provider, repo, branch, dir, path })`. The template placeholders are filled from:

- `{provider}` — from config
- `{repo}` — from config (`github.com:` prefix stripped)
- `{branch}` — config value, prefixed with `@` **only if** the value doesn't contain `@`. When using raw.githubusercontent, pass `branch: "main"` and omit the `@` by positioning it correctly in your `interpolate` template (see the example).
- `{dir}` — config value, prefixed with `/` when present
- `{path}` — the page-specific path, prefixed with `/` when present

## Live-switching at runtime

`Markdash({ enableSwitchSource: true })` exposes a dashboard card to flip between providers live without restarting. See the [operator dashboard example](/examples/operator-dashboard).

## Pitfalls

- **Mismatched branch separator** — if your provider uses `/main/` but `interpolate` still has the default `@main`, URLs 404. Always edit `interpolate` when changing provider shape.
- **Forgetting `dir` leading slash** — the runtime normalizes this automatically, but if you hard-code a leading slash in `dir: "/content"` you get `//content` — fine on most CDNs, undefined on some.
- **Rate limits** — `raw.githubusercontent` is fine for dev but will 429 you in production.

## Next steps

- [Operator dashboard](/examples/operator-dashboard) — live-swap providers from the browser
- [Local dev workflow](/examples/local-dev) — point at a local server instead of a public CDN
