---
name: markdoc-plugin-system
description: Skill for building Markdoc plugins. Call this skill when writing custom plugins, implementing the `beginRequest`/`endRequest` lifecycle hooks, exposing URLs, templates, or components, or integrating cross-cutting concerns (authentication, CORS, rate limiting) into a Markdoc app.
---

# Plugin System — The Markdoc Extension Surface

<instructions>
  <rule>
    <title>A plugin is a class produced by a factory</title>
    <details>
      Every published plugin is a function that returns a class extending `Plugin`. The consumer calls the factory with options and pushes the resulting class into `plugins: [...]`. The factory pattern lets you freeze config on the class, annotate the return type with `PluginConstructor`, and keep the runtime `private`/`protected` brand out of `.d.ts`.
    </details>
  </rule>
  <rule>
    <title>`PluginRegistry` describes what the plugin contributes</title>
    <details>
      `getRegistry()` returns `{ urls?, template?, components? }`. `urls` maps request paths (starting with `/`) to Swagger-like route metadata — the router dispatches matching requests to the plugin's `fetch()`. `template` names templates the plugin supplies via `getTemplate()`. `components` contributes inline HTML components that plug into `Engine`'s tag renderer.
    </details>
  </rule>
  <rule>
    <title>`__global` marks a plugin as runtime-singleton</title>
    <details>
      Plugins without `static __global = true` are instantiated per request. Plugins with the flag are constructed once, cached on the `Pluginable`, and reused for every request. Use `__global` for stateful plugins (CORS config, auth verifiers, feed caches). Leave it off for plugins whose state is inherently per-request.
    </details>
  </rule>
  <rule>
    <title>`start()` — one-time bootstrap, awaited on first request</title>
    <details>
      `start(): void | Promise<void>` runs exactly once per plugin instance, on the first request that resolves the plugin. For `__global` plugins this is once per process/isolate; for transient plugins this is once per request (since they're recreated each time). Markdoc awaits the hook before letting the request pipeline proceed, so the first request pays the setup cost. Use it for one-time work that needs the live runtime: timer initialization (Node-side), state seeding, eager warm-up. Errors thrown here surface as a 500 — wrap best-effort setup in `try/catch` if the request should still proceed.
    </details>
  </rule>
  <rule>
    <title>`beginRequest` guards — short-circuit with a `Response`</title>
    <details>
      `beginRequest(req, res)` runs after plugins resolve, before the router matches any URL. Return a `Response` (or `Promise<Response>`) to short-circuit — the rest of the pipeline is skipped. Return `null`/`undefined` to continue. Hooks run in plugin registration order; the first non-null return wins. Use this for authentication, CORS preflight, maintenance banners, geo-blocking.
    </details>
  </rule>
  <rule>
    <title>`endRequest` transforms — chained</title>
    <details>
      `endRequest(req, res, response)` runs after the main handler produces a response and before it is returned. Each plugin in order receives the previous plugin's `Response` and returns a (possibly modified) `Response`. Use this for CORS header injection, security headers, compression, response logging.
    </details>
  </rule>
  <rule>
    <title>`fetch` handles plugin-owned URLs only</title>
    <details>
      `fetch(req, res)` is only invoked for paths listed in `getRegistry().urls`. It returns a `MarkdocResponse` (chainable) or a raw `Response`. Do not put cross-cutting logic in `fetch` — that is what `beginRequest`/`endRequest` are for. A plugin that only uses lifecycle hooks returns an empty registry.
    </details>
  </rule>
  <rule>
    <title>Use `Inject<T>(key)` for dependency access</title>
    <details>
      Plugins that need access to the manifest, engine, or pagable declare them as constructor default parameters: `constructor(ctx, store, private manifest = Inject<ManifestLike>("manifest")) { super(ctx, store); }`. The classable system resolves them automatically. Never `new Manifest()` — the runtime already owns the singleton.
    </details>
  </rule>
  <rule>
    <title>Buffered body by default, `.stream(body, contentType?)` when chunked</title>
    <details>
      `res.html(str)` / `res.json(obj)` / `res.text(str)` / `res.xml(str)` materialize the full body before handing it to the platform `Response` — the common case and the simplest API. Switch to `res.stream(readable, contentType?)` when you need to pass a `ReadableStream<Uint8Array>` straight through: proxying an upstream fetch, emitting incrementally-generated content (LLM tokens, SSE), or serving payloads too large to comfortably hold in memory on an edge runtime. The caller owns the stream lifecycle; after `.stream()` nothing else should read the stream. Error-handling caveat: once the first byte has left the process the status line is on the wire — a mid-stream failure can only drop the connection, so pre-validate inputs before starting the stream.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: URL-only plugin (serves `/healthz`)</description>
    <reference_path>./examples/correct-url-plugin.ts</reference_path>
  </example>
  <example>
    <description>Correct: `beginRequest` guard plugin (rate limiter)</description>
    <reference_path>./examples/correct-guard-plugin.ts</reference_path>
  </example>
  <example>
    <description>Correct: `endRequest` transformer (security headers)</description>
    <reference_path>./examples/correct-transformer-plugin.ts</reference_path>
  </example>
  <example>
    <description>Correct: Plugin with injected dependencies</description>
    <reference_path>./examples/correct-injected-plugin.ts</reference_path>
  </example>
  <example>
    <description>Correct: Plugin that streams an upstream body (`res.stream`)</description>
    <reference_path>./examples/correct-stream-plugin.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common plugin mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
