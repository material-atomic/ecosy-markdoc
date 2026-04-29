---
name: markdoc-imports
description: Skill for registering runtime-wide services via the `imports` map. Call this skill when writing or configuring cache invalidation timers, observability hooks, custom parsers, or other non-request-handling services that should live for the lifetime of the runtime.
---

# Imports — Runtime-Wide Services

<instructions>
  <rule>
    <title>Imports live at the runtime layer, not the request layer</title>
    <details>
      `imports` on the `markdoc()` config is forwarded into the `Runtimable` injectable map. Each entry becomes a property on the runtime and is resolved once — the first `app.fetch()` triggers construction, subsequent requests reuse the same instance. This is the opposite of `plugins`, which can be `__global` (cached) or transient (per-request).
    </details>
  </rule>
  <rule>
    <title>Reserved keys cannot be overridden</title>
    <details>
      The framework reserves `configuration`, `repo`, `documentation`, `fetchable`, `manifest`, `pagable`, `pluginable`, `server`. Attempting to declare any of these in `imports` is ignored (filtered out before composing `Injectable`). `engine` is the only core key that can be replaced — use this to ship a custom component renderer.
    </details>
  </rule>
  <rule>
    <title>Imports are classables — produce them via factory functions</title>
    <details>
      An import is a class (or a `{ target, get }` factory descriptor). When the runtime resolves it, it calls `new Target()` with no args (or with whatever `get(accessor)` returns). Declare constructor default parameters with `Inject<T>("key")` to pull other runtime dependencies. The classable substrate handles resolution order and cycle detection.
    </details>
  </rule>
  <rule>
    <title>Use `onInit` / `onDispose` for lifecycle</title>
    <details>
      If an import needs to start a side-effect (timers, sockets, log flushers), do it in the constructor *after* `Inject` has resolved, or implement `onInit(): void | Promise<void>` which the classable runtime awaits after all injections resolve. Always pair with `onDispose()` so graceful shutdowns can tear the side-effect down.
    </details>
  </rule>
  <rule>
    <title>Imports can consume runtime instances, not request state</title>
    <details>
      Imports have no access to `MarkdocRequest` or `MarkdocResponse`. They operate on the long-lived runtime: `ManifestLike.reload()`, `EngineLike.reload()`, `PagableLike.clear()`, `FetchableLike.http`. For per-request behavior — including periodic cache invalidation that has to survive on edge runtimes — write a plugin (see `AutoInvalidate` for the shipped example).
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Custom observability import (metrics reporter)</description>
    <reference_path>./examples/correct-custom-import.ts</reference_path>
  </example>
  <example>
    <description>Correct: Custom engine replacement via imports</description>
    <reference_path>./examples/correct-engine-override.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common import mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
