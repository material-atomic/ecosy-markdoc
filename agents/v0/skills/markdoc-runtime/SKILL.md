---
name: markdoc-runtime
description: Skill for bootstrapping a Markdoc application. Call this skill when setting up a new Markdoc deployment, configuring the `markdoc()` factory, wiring GitHub as the content source, or deploying to a WinterCG runtime.
---

# Markdoc Runtime — The `markdoc()` Entry Point

<instructions>
  <rule>
    <title>A Markdoc app is produced by `markdoc(config)`</title>
    <details>
      The `markdoc()` factory takes a `MarkdocConfigurations` object and returns an edge-server app with a single `fetch(request): Promise<Response>` method. The app is a WinterCG-compatible handler — export it as the default for Cloudflare Workers, pass it to `server(app)` from `@ecosy/markdoc/nodejs` for Node.js, or hand it to any fetch-first hosting runtime.
    </details>
  </rule>
  <rule>
    <title>Content source is a GitHub repository via jsDelivr</title>
    <details>
      The `repo: "owner/name"` option is required; `branch` defaults to the repo's default branch; `dir` narrows the content root inside the repo. The runtime never clones the repo — every file is fetched from `cdn.jsdelivr.net/gh/<repo>@<branch>/<dir>/<path>` at request time and cached according to `revalidate`.
    </details>
  </rule>
  <rule>
    <title>`provider` + `interpolate` shape the content URL</title>
    <details>
      `provider` (default `"https://cdn.jsdelivr.net/gh"`) and `interpolate` (default `"{provider}/{repo}{branch}{dir}{path}"`) together decide how every content URL is built. Change `provider` to point at a different CDN or a local mirror (see the `Locally` practice in `docs/`). Change `interpolate` when the target CDN uses a different path layout — for example `raw.githubusercontent.com` needs `"{provider}/{repo}/{branch}{dir}{path}"` because it separates repo and branch with `/` instead of `@`. Most apps leave both at their defaults.
    </details>
  </rule>
  <rule>
    <title>`revalidate` is a TTL, not a polling interval</title>
    <details>
      `revalidate` (milliseconds) controls how stale cached manifests, engine components, and rendered pages can get. The runtime re-fetches lazily on the *next* request after TTL expires. It does not run a background timer by default — use the `AutoInvalidate` plugin (from `@ecosy/markdoc/plugins`) if you want proactive refresh.
    </details>
  </rule>
  <rule>
    <title>`plugins` is the only extension point for URLs, templates, components</title>
    <details>
      Every URL, every HTML template, every named inline component comes from a plugin. The plugins array is ordered — first-match routing and chained `beginRequest`/`endRequest` hooks follow that order. Put cross-cutting guards (auth, CORS) first and response transformers last.
    </details>
  </rule>
  <rule>
    <title>`imports` is for runtime-wide services</title>
    <details>
      `imports` registers classables at the runtime layer (via `Injectable`). They run once and live for the lifetime of the runtime — use them for cache invalidation timers, observability hooks, custom parsers, engine replacements. They never handle requests directly. Reserved keys: `configuration`, `repo`, `documentation`, `fetchable`, `manifest`, `pagable`, `pluginable`, `server`.
    </details>
  </rule>
  <rule>
    <title>The runtime is request-agnostic until `fetch()` is called</title>
    <details>
      `markdoc(config)` only constructs the runtime. No network calls, no manifest fetch, no plugin instantiation happens up-front. Everything is lazy: the first `fetch()` triggers plugin resolution (via `Pluginable`), which pulls `Manifest`, `Engine`, etc. through `Inject`. This keeps cold-start fast.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Minimal Cloudflare Workers deployment</description>
    <reference_path>./examples/correct-workers.ts</reference_path>
  </example>
  <example>
    <description>Correct: Full configuration with plugins and imports</description>
    <reference_path>./examples/correct-full-config.ts</reference_path>
  </example>
  <example>
    <description>Correct: Custom provider + interpolate (raw.githubusercontent.com)</description>
    <reference_path>./examples/correct-custom-provider.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common configuration mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
