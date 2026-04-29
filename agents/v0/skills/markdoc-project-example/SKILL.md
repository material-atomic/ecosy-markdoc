---
name: markdoc-project-example
description: Skill for wiring a complete end-to-end Markdoc deployment. Call this skill when bootstrapping a new docs site, planning a repository layout, coordinating plugins + imports + layout + manifest, or designing parallel Cloudflare Workers + Node.js deployments from a single source.
---

# Project Example — End-to-End Wiring

<instructions>
  <rule>
    <title>Keep `app.ts` as the single source of truth</title>
    <details>
      Build the runtime once in `src/app.ts` via `markdoc({...})` and export it. Both the Cloudflare Workers entry (`src/worker.ts`) and the Node.js entry (`src/server.ts`) import that same app — the Workers entry re-exports `{ fetch: app.fetch }`; the Node entry hands the app to the adapter. This avoids drift between environments and keeps environment-specific wiring at the edges.
    </details>
  </rule>
  <rule>
    <title>Follow the layered `plugins` order</title>
    <details>
      Registration order matters because `beginRequest` short-circuits on the first non-null response and `endRequest` chains in the same order. A stable convention: (1) `Cors` (preflight + headers), (2) rate limiting / security guards, (3) `Authen`, (4) `Layout`, (5) content-contributing plugins (SEO, feeds), (6) ops dashboards. Response transformers register early so they sit at the tail of the `endRequest` chain.
    </details>
  </rule>
  <rule>
    <title>Separate runtime config from request config</title>
    <details>
      Environment variables (JWT secrets, external endpoints, feature flags) belong in whichever entry loads them (`process.env` on Node, `env` on Workers). Pass them into `markdoc({...})` as plain values — never import `process.env` inside plugin factories.
    </details>
  </rule>
  <rule>
    <title>Use `imports` only for runtime-level behavior</title>
    <details>
      `AutoInvalidate` (on Node), metrics reporters, custom engines — all go in `imports`. Cloudflare Workers entries should usually omit `imports` entirely because ephemeral runtimes don't support long-running services. Use environment-aware code to skip imports conditionally if the same app is shared across runtimes.
    </details>
  </rule>
  <rule>
    <title>Keep the content repo thin — content + components + manifest</title>
    <details>
      The GitHub content repo contains only markdown pages, `_components/*.html`, and `_manifest.json` files. Plugins, layouts, and runtime wiring live in the deployment repo. Keep separation of concerns so content authors never touch TypeScript.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Shared `app.ts` used by both Workers and Node</description>
    <reference_path>./examples/correct-app.ts</reference_path>
  </example>
  <example>
    <description>Correct: Cloudflare Workers entry</description>
    <reference_path>./examples/correct-worker.ts</reference_path>
  </example>
  <example>
    <description>Correct: Node.js entry with graceful shutdown</description>
    <reference_path>./examples/correct-server.ts</reference_path>
  </example>
  <example>
    <description>Correct: Content repo layout (manifest + components)</description>
    <reference_path>./examples/correct-content-layout.md</reference_path>
  </example>
</examples>
