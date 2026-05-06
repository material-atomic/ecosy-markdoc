# Changelog

## 0.1.1 (2026-05-06)

### New Features

- **`__preloadSync` plugin static** — opt-in marker for plugins whose `start()` hook must complete before `manifest.preload()` and `engine.preload()` run. Use for plugins that intercept the runtime's content fetches (filesystem mirrors, request rewriters, custom transports). Without the marker, `start()` runs in parallel with content preload (existing behavior — fast path for self-contained setup).
- **`Pluginable.waitStart()`** — joins the in-flight `start()` promises of non-`__preloadSync` plugins. `Server.handleRequest` calls it inside `Promise.allSettled([manifest.preload(), engine.preload(), pluginable.waitStart()])` so non-sync starts run alongside content preload.
- **Two-phase `Pluginable.resolve()`** — when called, awaits `__preloadSync` plugins' `start()` synchronously before returning, while non-sync plugins' `start()` is fired and tracked for later joining via `waitStart()`. Server consumes the new contract; plugins without the marker see no behavior change.

### Fixes

- **`docs/locally.ts` reference**: switched plugin hook from `beforeRequest` (does not exist; was a stale rename — actual hook is `beginRequest`) to `start`. Combined with the new `__preloadSync = true` marker, the local HTTP server now binds before the first content fetch leaves the runtime.

### Documentation

- 0.1.0 changelog entries referenced `beforeRequest` / `afterRequest` — these are the prior names of `beginRequest` / `endRequest` (the actual runtime hooks). The runtime contract has always been the latter.

## 0.1.0 (2026-04-29)

Initial public release. `@ecosy/markdoc` is a headless markdown documentation runtime for edge environments — GitHub as CMS, jsDelivr as CDN, WinterCG `Request`/`Response` as the public API.

### Features

#### Runtime

- **`markdoc(config)`** — single-factory entry point that returns an edge-server app (`{ fetch }`). Synchronous construction, lazy resolution; all CDN work happens inside the first `fetch()` call.
- **`Runtimable`** — `Injectable`-composed runtime root, built once and reused across requests. Owns `Configuration`, `Repo`, `Documentation`, `Fetchable`, `Manifest`, `Engine`, `Pagable`, `Pluginable`, `Server`.
- **Reserved keys** — `configuration`, `repo`, `documentation`, `fetchable`, `manifest`, `pagable`, `pluginable`, `server` are filtered out of `imports`. Only `engine` is replaceable.
- **`revalidate` TTL** — global cache window for manifest, engine components, and rendered pages. Lazy — re-fetch happens on the next request after the TTL elapses.
- **`interpolate` config option** — template string for content URL assembly. Placeholders: `{provider}`, `{repo}`, `{branch}`, `{dir}`, `{path}`. Defaults to `"{provider}/{repo}{branch}{dir}{path}"` (jsDelivr shape). Override when pointing `provider` at a CDN with a different URL layout (e.g. `raw.githubusercontent.com` → `"{provider}/{repo}/{branch}{dir}{path}"`). `Documentation` exposes it as `DEFAULT_INTERPOLATE` static for reference.
- **`DocumentationLike.configure({ provider?, interpolate? })` + `reset()`** — runtime-mutable content source. `configure` applies a partial update (fields omitted stay unchanged; empty string / `null` resets that field to the hard-coded default). `reset()` restores the values captured at construction time — i.e. whatever `markdoc(config)` passed in, **not** the jsDelivr default — so custom-configured apps keep their baseline on reset. Both methods are side-effect-only at the Documentation layer; callers that also want stale cached pages dropped should call `pagable.clear()` afterwards. Typical consumer: the Markdash dashboard's "Content source" card.

#### Plugin system

- **`Plugin` base class** — `getRegistry()` declares URL / template / component contributions; `fetch()` handles plugin-owned URLs.
- **`beforeRequest(req, res)`** — pre-routing guard hook. Returning a `Response` short-circuits; returning `null`/`undefined` continues. Invoked in plugin registration order.
- **`afterRequest(req, res, response)`** — post-response transformer. Chained across plugins; each receives the previous output.
- **`getTemplate(name)`** — resolves named templates when registered via `template` in the plugin registry.
- **`__global` static flag** — `true` = one instance cached across requests; otherwise transient (per-request).
- **`PluginConstructor` interface** — required return type for plugin factories. Keeps `.d.ts` emit clean when the returned class expression has `private`/`protected` members.
- **`Inject<T>(key)` in plugin constructors works end-to-end.** `Pluginable.resolve()` now pushes a scope onto the classable stack that delegates key lookups to the live Runtime instance, so plugin constructor default parameters such as `= Inject<ManifestLike>("manifest")` resolve correctly. (Prior to this, `Inject` in a plugin fell through to `MarkdocTeleport.get(key)` which only exposes the top-level `runtime` key — every plugin service injection silently returned `undefined`.)

#### Built-in plugins

- **`Authen({ cookieName, verify, onUnauthorized, publicPaths })`** — JWT cookie authentication via `beforeRequest`. `onUnauthorized` accepts a string URL (redirect), an `AuthenRenderConfig` (inline HTML), or a custom handler.
- **`Cors({ origin, methods, headers, credentials, exposeHeaders, maxAge })`** — preflight handling in `beforeRequest` + header injection in `afterRequest`. `credentials: true` with `origin: "*"` throws at factory time.
- **`Layout({ template, getTemplate, path, payload })`** — root HTML wrapper. Templates can be inline strings, `(store) => string` factories, CDN-file paths, or markdown processed by a custom parser.
- **`Markdash({ prefix, enableSwitchSource })`** — operator dashboard for triggering `manifest.reload()`, `engine.reload()`, and `pagable.clear()` from a browser. Opting into `enableSwitchSource: true` exposes a **Content source** card plus three extra endpoints (`GET /<prefix>/inspect/documentation`, `POST /<prefix>/configure/documentation`, `POST /<prefix>/reset/documentation`) that flip `Documentation.provider` / `interpolate` live and auto-clear the page cache — useful when iterating on content against a ~24 h jsDelivr cache (switch to `raw.githubusercontent.com`, edit, switch back once the CDN catches up). Off by default because it mutates runtime state; gate behind `Authen` in production.
- **`RobotsTxt({ rules, sitemapUrl })`** — serves `/robots.txt` with custom rules and auto-detected sitemap URL.
- **`RSSFeed({ format, path, title, description, link, items, maxItems })`** — RSS 2.0 or Atom 1.0 feeds. `items` accepts a static array or a `(req) => FeedItem[] | Promise<FeedItem[]>` factory.
- **`Sitemap`** — auto-generated `/sitemap.xml` from the manifest tree. Drop-in class (not a factory).

#### Templating

- **`html` tagged literal** — mixes static `{{ key }}` interpolation (resolved from scope + payload at render time) with dynamic `${(store) => ...}` expressions (called per render with the request store).
- **`{{ dot.path }}` placeholders** — resolved via `JSONQuery.evaluate`. Unmatched placeholders are left literal so typos surface.
- **Built-in fallback template** — minimal docs-style HTML used when no `Layout` is registered.

#### Imports

- **`AutoInvalidate({ interval, targets, onTick })`** — timer-based cache invalidation. `targets` is a subset of `"manifest" | "engine" | "pages"`. `onTick` fires once per target per tick with `{ ok, target, elapsed, error? }`. Long-running runtimes only — `setInterval` dies on ephemeral edge platforms.
- **Custom imports** — any `Injectable`-compatible classable via the `imports` map. Constructor default parameters can use `Inject<T>(key)` to pull runtime dependencies.

#### Response surface

- **`MarkdocResponse.stream(body, contentType?)`** — opt-in chunked body. Takes a `ReadableStream<Uint8Array>` and forwards it verbatim to the platform `Response`, enabling proxy passthrough, LLM-token streaming, and SSE without buffering. String-body helpers (`html` / `text` / `xml` / `json`) remain the default for the common case. Content-type defaults to `application/octet-stream` unless the caller sets one explicitly. Mid-stream errors can only drop the connection (status line is already on the wire), so validate inputs before calling `.stream()`.
- **`MarkdocResponseBody` type alias** — `string | ReadableStream<Uint8Array> | null`. Useful when typing plugins that decide between buffered and streaming bodies dynamically.

#### Request surface

- **`MarkdocRequest`** — WinterCG request wrapper with normalized headers/cookies/queries, body accessors (`json`, `formData`, `text`, `arrayBuffer`, `body`), and a `raw` escape hatch.
- **`MarkdocResponse`** — chainable response builder (`status`, `setHeader`, `json`, `html`, `text`, `xml`).
- **`MarkdocURL`** — parsed URL with security utilities (origin, pathname, CORS context, embed detection).
- **`redirect(location, status?)`** — helper for 3xx responses.

#### Node.js adapter

- **`@ecosy/markdoc/nodejs`** — `server(app, { port, hostname }).start()` bridges Node's `IncomingMessage`/`ServerResponse` onto Web `Request`/`Response`.
- **HMR-safe** — running HTTP server is stashed on `globalThis` via `Symbol.for("@ecosy/markdoc/nodejs.httpServer")`. On re-execution (tsx watch, nodemon, vite-node) the adapter auto-closes the previous server before binding the new one.
- **Streaming** — request bodies stream through a Web `ReadableStream` with `duplex: "half"`; response bodies stream back without full buffering.
- **`stop(callback)`** — cooperative graceful shutdown via `httpServer.close()`.

#### Type-safe factory surface

- Every factory returns an explicit constructor interface so `.d.ts` emit stays clean despite `private`/`protected` members:
  - `PluginConstructor` (base for all plugin factories)
  - `LayoutPluginConstructor` (extends `PluginConstructor` with `__layout` + `layout` statics)
  - `StorableConstructor<S>` + `StorableInstance<S>`
  - `ContentConstructor` + `ContentInstance`
  - `MarkdownConstructor`
  - `DocumentationConstructor`
  - `ConfigurationConstructor`
  - `AutoInvalidateConstructor`
  - `NodeJSServerStatic`
- Named node classes re-exported as types for downstream reference: `ServerNode`, `ManifestNode`, `PagableNode`, `EngineNode`, `PluginableNode`.

#### CLI

- **`markdoc-manifest`** — bin shipped in the package. Filesystem → manifest drift guard. Walks the configured content directory, rebuilds each `_manifest.md`'s `children:` list, and either prints a diff (default) or applies the changes (`--write`) while preserving author-written frontmatter (`title`, `description`, custom keys). `--init` creates manifests for directories that don't have one yet. Non-zero exit in dry-run mode signals drift — suitable as a CI gate. Skips `_components/`, `_template.md`, `_metadata.md`, and dotfiles. Default root is `./content`; override with `--root <path>`.

#### Agent skills

- **Full `agents/` directory** with structured AI documentation:
  - `PROMPT.md` — senior-architect role definition with seven architectural principles (edge-first, GitHub-as-CMS, factory-produced classables, plugins as the only extension point, split lifecycle, imports vs. plugins, type-safe declaration surface).
  - `RULES.md` — DO/DON'T constraints covering runtime, plugins, registry, imports, manifest/engine, layout, types, and general integration.
  - Nine skills, each with `SKILL.md` + `examples/` directory (correct and wrong pattern TypeScript/HTML/JSON files):
    - `markdoc-runtime` — `markdoc()` entry, configuration, request flow
    - `markdoc-plugin-system` — `Plugin` base, registry, lifecycle hooks
    - `markdoc-plugins-builtin` — the seven shipped plugins
    - `markdoc-imports` — `AutoInvalidate` + custom runtime services
    - `markdoc-manifest` — manifest tree, sub-manifests, programmatic resolution
    - `markdoc-engine` — component templates, tag rendering, `{{ key }}` interpolation
    - `markdoc-layout` — root HTML wrapper, four template strategies, `html` tagged literal
    - `markdoc-nodejs-adapter` — HTTP bridge, HMR handling, graceful shutdown
    - `markdoc-project-example` — end-to-end shared `app.ts` → Workers + Node.js deployments

### Package exports

| Subpath                   | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `@ecosy/markdoc`          | Core runtime + default export + `Plugin` base    |
| `@ecosy/markdoc/plugins`  | All built-in plugins                             |
| `@ecosy/markdoc/plugins/*` | Individual plugin imports                       |
| `@ecosy/markdoc/imports`  | Runtime-wide services (`AutoInvalidate`)         |
| `@ecosy/markdoc/imports/*` | Individual import services                      |
| `@ecosy/markdoc/nodejs`   | Node.js HTTP adapter                             |

### Dependencies

- `@ecosy/classable ^0.2.0` — DI substrate (Injectable, Teleportability, Executable, Lifecycle)
- `@ecosy/core ^0.3.4` — utility primitives (Subscriber, serialize, freeze, types)
- `@ecosy/json ^0.1.0` — JSON path evaluation for `{{ dot.path }}` placeholders
- `front-matter ^4.0.2` — YAML front-matter parsing
