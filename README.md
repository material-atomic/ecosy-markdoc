# @ecosy/markdoc

A headless markdown documentation runtime for edge environments. Treats GitHub as a CMS, fetches raw files through jsDelivr on demand, and ships a typed plugin API for every extension point.

The package stays deliberately small: a runtime, a plugin base class, a handful of essentials (auth, CORS, layout, feeds, sitemap, robots, ops dashboard), and a Node adapter. Everything beyond that — custom parsers, specialized plugins, full deployment recipes — lives as **copy-paste-ready practices in the [`docs/` folder of the repository](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs)**, not as more package exports. See the [Practices](#practices) section below.

## AI Agent Learning

If you are an AI Coding Assistant, Agent, or Copilot analyzing or generating code for a repository that lists `@ecosy/markdoc` as a dependency, read this section before anything else.

### The vision — npm *is* the skill registry

Every skill, rule, and prompt this package wants to teach you lives **inside the published tarball**, under `agents/v<major>/`. When a developer runs `yarn add @ecosy/markdoc`, the skills come down to `node_modules/@ecosy/markdoc/agents/v0/`. There is no separate skill registry to query, no out-of-band MCP server to register, no extra credential. npm is the distribution channel; `package.json.agents` is the manifest.

This means: the single source of truth for *how to use this package* ships alongside the code that implements it. Version skew is impossible — if a consumer is on `@ecosy/markdoc@0.3.1`, the skills they read are the skills that match v0.3.1.

### How to load the skills

1. **Open `node_modules/@ecosy/markdoc/package.json`** — or the tarball root if you're analyzing without install.
2. **Locate the top-level `"agents"` object.** It declares:
   - `agents.current` — the revision the author currently points at as default (e.g. `"v0"`). This is **not** necessarily the highest number — when multiple revisions ship in one tarball, `current` is the author-blessed stable one.
   - `agents.prompts` — role definitions for assuming the right voice.
   - `agents.rules` — DO/DON'T absolutes; violating these produces broken code.
   - `agents.skills` — topical how-to files keyed by name, each pointing to a `SKILL.md` with a frontmatter + `<instructions>` + `<examples>` block.
   - `agents.workflows` — an **ordered** array telling you which entries to read, in what sequence. Honor this order.
3. **Resolve `$this://` to the package root.** `$this://agents/v0/PROMPT.md` means `<package root>/agents/v0/PROMPT.md` — the directory that contains this `package.json`. Never try to fetch `$this://` as a URL.
4. **Load every reference the skill embeds.** Each `SKILL.md` lists `<example>` entries with `<reference_path>` pointers to `.ts` / `.html` / `.md` / `.json` files under `examples/`. Those are canonical — consume them as ground truth when generating code.
5. **For task-specific patterns, also read the `docs/` folder on GitHub** — [`https://github.com/material-atomic/ecosy-markdoc/tree/main/docs`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs). The tarball ships the minimal core; `docs/` holds production-shape recipes (custom parsers, full deployment wiring, advanced template examples) that are intentionally *not* package exports. Skills reference docs/ for deeper patterns.

### House rules (shortcut — full set in `agents/v0/RULES.md`)

1. **Every extension goes through a plugin.** Never mutate the router, engine, or manifest directly. URLs, templates, and components are all contributed via `PluginRegistry`.
2. **Lifecycle is split by concern.** `beforeRequest` is the guard hook (auth, CORS preflight, rate limit); `fetch` handles plugin-owned URLs; `afterRequest` is the response transformer chain (CORS headers, security headers, compression). Never mix these.
3. **Annotate factory return types.** Every plugin factory must return `PluginConstructor` (or a subtype). This keeps `.d.ts` emit clean when the class expression has `private`/`protected` members.
4. **Edge-first.** Default runtime is WinterCG (`Request`/`Response`). Node.js support lives in the separate `@ecosy/markdoc/nodejs` import — never reach for `node:*` APIs from the core runtime or plugins.
5. **`imports` are runtime-wide services.** They cannot handle requests. URLs live in `plugins`.
6. **Follow the project example skill.** `markdoc-project-example` walks through a parallel Cloudflare Workers + Node.js deployment built on a single shared `app.ts` — it is the canonical end-to-end pattern.

### Versioning contract

The skill schema revision is encoded **in the directory path** (`agents/v<n>/`) and pointed at by **`agents.current`** — not by a `version` key inside `agents`. Why? CI shell scripts routinely parse `package.json` with `grep '"version"'`, `sed`, `awk`, or `jq '.version'` to read the root package version. A nested `agents.version` key would shadow those searches and produce silent misreads. `"current"` avoids the collision entirely while staying semantically honest.

This release ships `v0` under `agents/v0/`. Breaking changes to the skill contract (renamed sections, new frontmatter fields, reorganized hierarchies) bump to `v1`, `v2`, … and live under sibling directories. A single tarball may ship multiple revisions for migration windows — `agents.current` tells you which one the author recommends as default. Agents that understand the `current` revision should use it; agents that only understand an older revision can look for that revision's directory and use it as a fallback.

---

## Features

- **GitHub as CMS** — Content lives in a GitHub repo; runtime fetches through `cdn.jsdelivr.net/gh` on demand
- **Edge-first** — WinterCG-native (`Request`/`Response`), runs on Cloudflare Workers, Deno Deploy, Vercel Edge, Bun
- **Node.js adapter** — Optional `@ecosy/markdoc/nodejs` bridge for long-running servers, with HMR-safe port handling
- **Plugin system** — `beforeRequest` guards, `fetch` handlers, `afterRequest` transformers, plus `PluginRegistry` for URLs/templates/components
- **Essentials, not a plugin marketplace** — The package ships exactly what most docs sites need: `Authen`, `Cors`, `Layout`, `Markdash`, `RobotsTxt`, `RSSFeed`, `Sitemap`. Further patterns (custom parsers, specialized templates, third-party integrations) live as reference [practices in `docs/`](#practices) rather than as additional built-ins.
- **Runtime imports** — `AutoInvalidate` and custom long-lived services via the `imports` map
- **`html` tagged literal** — Store-reactive layout templates with static `{{ key }}` + dynamic `${store => ...}`
- **Type-safe factory surface** — Every factory exposes a `*Constructor` interface so `.d.ts` emit stays clean
- **Zero Node dependencies** — Core runtime uses only Web standards; Node-specific code isolated in the adapter

## Installation

```bash
yarn add @ecosy/markdoc
```

## Quick Start

```typescript
import markdoc, {
  Authen, Cors, Layout, html,
  RobotsTxt, Sitemap, RSSFeed,
  AutoInvalidate,
} from "@ecosy/markdoc";

const app = markdoc({
  // Content source — content/ inside the GitHub repo, fetched via jsDelivr
  repo: "owner/docs",
  branch: "main",
  dir: "content",
  revalidate: 5 * 60_000,

  plugins: [
    // Response-level concerns first (afterRequest runs last-in-first-out)
    Cors({ origin: "*" }),

    // Guard — short-circuits via beforeRequest
    Authen({
      verify: async (jwt) => !!jwt,
      onUnauthorized: "/login",
      publicPaths: ["/login", "/healthz"],
    }),

    // Root layout — exactly one required per app
    Layout({
      template: { root: true },
      getTemplate: html`
        <!DOCTYPE html>
        <html>
          <head><title>{{ scope.title }}</title></head>
          <body>{{ body.main }}</body>
        </html>
      `,
    }),

    // Content-contributing
    RobotsTxt(),
    Sitemap,
    RSSFeed({
      title: "Docs Updates",
      description: "Latest changes",
      link: "https://docs.example.com",
      items: [],
    }),
  ],

  // Long-running only — skip on ephemeral runtimes
  imports: {
    autoInvalidate: AutoInvalidate({ interval: 5 * 60_000 }),
  },
});

// Cloudflare Workers
export default { fetch: app.fetch };
```

### On Node.js

```typescript
import { server } from "@ecosy/markdoc/nodejs";

server(app, { port: 3000 }).start(() => {
  console.log("http://localhost:3000");
});
```

## Core API

### `markdoc(config)`

Entry factory. Returns an edge-server app (`{ fetch: (req: Request) => Promise<Response> }`).

| Option        | Type                                   | Description                                                         |
| ------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `repo`        | `string` (required)                    | GitHub repo `"owner/name"` — jsDelivr source                        |
| `branch`      | `string`                               | Repo branch (default: repo's default branch)                        |
| `dir`         | `string`                               | Content root inside the repo                                        |
| `provider`    | `string`                               | Base URL for content fetches. Default `"https://cdn.jsdelivr.net/gh"` |
| `interpolate` | `string`                               | URL template with `{provider}/{repo}/{branch}/{dir}/{path}` placeholders. Default `"{provider}/{repo}{branch}{dir}{path}"` (jsDelivr). Override for CDNs with different shapes (e.g. `raw.githubusercontent.com`) |
| `revalidate`  | `number`                               | Cache TTL in ms (applies to manifest, engine, pages)                |
| `plugins`     | `PluginableLike[]`                     | Request-scoped plugins — URLs, templates, lifecycle hooks           |
| `imports`     | `Record<string, Classable>`            | Runtime-wide services. Reserved keys are filtered out               |
| `lifecycle`   | `RequestLifecycleOptions`              | Per-request middleware pipeline (guards, pipes, interceptors)       |

### `Plugin` — Base Class

```typescript
import { Plugin, type PluginConstructor, type PluginRegistry } from "@ecosy/markdoc";

export function MyPlugin(options: MyOptions): PluginConstructor {
  return class extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return { urls: { "/my": { method: "GET" } } };
    }

    async fetch(req, res) { return res.json({ ok: true }); }
    async beforeRequest(req, res) { return null; } // optional
    afterRequest(req, res, response) { return response; } // optional
  };
}
```

| Member             | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `getRegistry()`    | Declare URLs, templates, and inline components the plugin contributes     |
| `fetch()`          | Handle requests matched to plugin-registered URLs                         |
| `beforeRequest()`  | Pre-routing guard — returns `Response` to short-circuit, `null` to pass   |
| `afterRequest()`   | Post-response transformer — chained across plugins in registration order  |
| `getTemplate()`    | Return HTML for a named template (required when `template` is registered) |
| `static __global`  | `true` → one instance shared across requests; otherwise per-request        |

### Built-in Plugins

The curated set below covers the needs of a typical documentation site and is deliberately fixed. Anything more specialized ships as a [practice in `docs/`](#practices), not as a new built-in.

| Plugin         | Purpose                                                       |
| -------------- | ------------------------------------------------------------- |
| `Authen`       | JWT cookie auth via `beforeRequest` + custom `onUnauthorized` |
| `Cors`         | Preflight + header injection, split across both lifecycle hooks |
| `Layout`       | Mandatory root HTML wrapper with inline or CDN-backed template |
| `Markdash`     | Operator dashboard for reloading manifest/engine/pages         |
| `RobotsTxt`    | Serves `/robots.txt` with custom rules + sitemap discovery     |
| `RSSFeed`      | RSS 2.0 / Atom 1.0 feeds with static or dynamic items          |
| `Sitemap`      | Auto-generated `/sitemap.xml` from the manifest tree           |

### Runtime Imports

```typescript
import markdoc, { AutoInvalidate } from "@ecosy/markdoc";

markdoc({
  repo: "owner/docs",
  imports: {
    autoInvalidate: AutoInvalidate({
      interval: 5 * 60_000,
      targets: ["manifest", "pages"],
      onTick: ({ ok, target, elapsed }) => console.log({ ok, target, elapsed }),
    }),
  },
});
```

Reserved keys (filtered out): `configuration`, `repo`, `documentation`, `fetchable`, `manifest`, `pagable`, `pluginable`, `server`. Only `engine` can be overridden through `imports`.

### `html` Tagged Literal

```typescript
import { Layout, html } from "@ecosy/markdoc";

Layout({
  template: { root: true },
  getTemplate: html`
    <h1>{{ scope.title }}</h1>
    <nav>${(store) => {
      const pages = store.getState().pages as Array<[string, string]>;
      return pages.map(([t, u]) => `<a href="${u}">${t}</a>`).join("");
    }}</nav>
    {{ body.main }}
  `,
});
```

- `{{ key }}` — static interpolation from page scope + payload (resolved at render time).
- `${store => ...}` — dynamic expression called with the request store, result stringified.

### Node.js Adapter

```typescript
import { server } from "@ecosy/markdoc/nodejs";

const Server = server(app, { port: 3000, hostname: "0.0.0.0" });
Server.start(() => console.log("listening"));
process.on("SIGTERM", () => Server.stop(() => process.exit(0)));
```

HMR-safe: uses `globalThis` + `Symbol.for` to track the running HTTP server across module reloads. `tsx watch` / `nodemon` / `vite-node` reload the entry file without port conflicts.

### `redirect(location, status?)`

```typescript
import { redirect } from "@ecosy/markdoc";

// 302 (default)
return redirect("/login");
// Permanent
return redirect("/archive", 301);
```

### `markdoc-manifest` CLI

Ships in the package `bin/` — filesystem → manifest drift guard. Scans the content directory, rebuilds each `_manifest.md`'s `children:` list from the `.md` files it finds, and either prints a diff (default) or applies the update in place. Author-written frontmatter (`title`, `description`, custom keys) is preserved; only `children:` is regenerated. Skips `_components/`, `_template.md`, `_metadata.md`, and dotfiles.

```sh
yarn markdoc-manifest                       # dry-run diff, exit 1 on drift
yarn markdoc-manifest --write               # apply proposed changes
yarn markdoc-manifest --init                # create missing _manifest.md files
yarn markdoc-manifest --root docs/content   # point at a non-default content root
```

Wire `yarn markdoc-manifest` into CI — a non-zero exit in dry-run mode means a `.md` page landed without the parent manifest being updated. Default root is `./content`; override with `--root`.

## Practices

The package ships a minimal core. Richer patterns — custom parsers, specialized plugins, full deployment recipes — live as **copy-paste-ready reference implementations in the [`docs/` folder of the GitHub repository](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs)**, not as additional package exports.

Why this split: every new built-in accumulates surface area, transitive dependencies, and bundle weight for consumers that never use it. Practices in `docs/` cost nothing to publish, are versioned alongside the code they target, and can evolve at their own pace. When a practice proves ubiquitous enough to be worth the carry cost, it graduates into a first-class export.

Current practices (see the folder for the full list):

- **[`docs/markdown-viewer.ts`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/markdown-viewer.ts)** — full-featured custom parser built on [markdown-it](https://github.com/markdown-it/markdown-it). Covers GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks), emoji shortcodes, heading anchors, footnotes, inline attributes, LaTeX math (server-rendered via [KaTeX](https://katex.org/)), [Mermaid](https://mermaid.js.org/) diagrams, syntax-highlighted code blocks (via [highlight.js](https://highlightjs.org/)), and GitHub-style alert blocks (`> [!NOTE]`, `> [!WARNING]`, …). Plug it into `markdoc({ parser: MarkdownViewer() })` to replace the built-in lightweight parser.
- **[`docs/content/_template.md`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/content/_template.md)** — production-shape root layout with a fixed header, centered flex container, sticky sidebar, KaTeX/highlight.js CSS loaded from CDN, and a client-side Mermaid render hook.
- **[`docs/index.ts`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/index.ts) + [`docs/node.ts`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/node.ts)** — how a single app is wired once and served from both Cloudflare Workers (`wrangler dev`) and Node.js (`tsx watch`).
- **[`docs/locally.ts`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/locally.ts)** — `withLocally(config)` wrapper + `Locally` importer. In Node dev it boots a loopback HTTP server mirroring jsDelivr's `/gh/...` path shape and redirects `provider` at it; on edge runtimes / in production it is a no-op (Node imports stay lazy via `new Function("id", "return import(id)")` so bundlers never see a static `node:*` specifier).

### Contributing a practice

Patterns welcome as PRs into `docs/`:

1. Drop a single-file `.ts` / `.md` / `.html` practice under `docs/` (or a subfolder if it needs assets).
2. Start the file with a comment block explaining what the practice solves and what else it requires (deps, CDN links, runtime constraints).
3. Add a bullet under this section in README linking to the GitHub path, with a one-line description of the outcome.

If a practice ends up representing a common need and its trade-offs stabilize, we'll promote it into an exported plugin or import.

## Architecture

```
                   markdoc(config)
                          │
                          ▼
                    Runtimable
       (Injectable composing core classables)
                          │
    ┌─────┬──────┬────────┼────────┬──────┬──────┬─────────┐
    │     │      │        │        │      │      │         │
  Config Repo  Docu-   Fetch-  Manifest Engine Pagable  Pluginable
         mentation    able                                    │
                                                      ┌───────┴────────┐
                                                      │                │
                                                   Global          Transient
                                                   (cached)      (per-request)
                                                      │                │
                                                      └───────┬────────┘
                                                              ▼
                                                         beforeRequest
                                                              │
                                                              ▼
                                                      Router ↔ Manifest
                                                              │
                                                   ┌──────────┴──────────┐
                                                   ▼                     ▼
                                           plugin.fetch           page handler
                                                   │                     │
                                                   └──────────┬──────────┘
                                                              ▼
                                                        afterRequest
                                                              │
                                                              ▼
                                                           Response
```

- **Runtime** (`Runtimable`) — built once, reused across requests. Owns all core classables.
- **Request scope** — `Pluginable` resolves per-request plugins, walks `beforeRequest`, routes, dispatches, then walks `afterRequest`.
- **Content** — `Manifest` resolves URL → markdown URL; `Engine` renders tag trees with component templates; `Pagable` caches rendered pages by TTL.
- **Imports** — `AutoInvalidate` (and custom services) extend the runtime, never touch requests.

## Runtime Support

| Runtime              | Status    | Entry                              |
| -------------------- | --------- | ---------------------------------- |
| Cloudflare Workers   | Primary   | `@ecosy/markdoc` (default export)  |
| Deno Deploy          | Primary   | `@ecosy/markdoc` (default export)  |
| Bun                  | Primary   | `@ecosy/markdoc` (default export)  |
| Vercel Edge          | Primary   | `@ecosy/markdoc` (default export)  |
| Node.js 18+          | Adapter   | `@ecosy/markdoc/nodejs`            |

## Reference Project

**ecosy-docs** — The Ecosy documentation site, running `@ecosy/markdoc` end-to-end. The same `docs/` folder is both the deployed site's source **and** the practices library this package points consumers at.

- Live: [markdoc.ecosy.io](https://markdoc.ecosy.io)
- Practices folder (source of truth for recipes): [github.com/material-atomic/ecosy-markdoc/tree/main/docs](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs)
- Repository: [github.com/material-atomic/ecosy-markdoc](https://github.com/material-atomic/ecosy-markdoc)

## License

MIT
