---
name: markdoc-manifest
description: Skill for working with the Markdoc manifest — the authoritative map from URL pathnames to GitHub markdown sources. Call this skill when defining `_manifest.json`, composing sub-manifests, resolving pages programmatically, or invalidating the manifest cache.
---

# Manifest — The Content Tree

<instructions>
  <rule>
    <title>`_manifest.json` declares every page the runtime can serve</title>
    <details>
      A manifest is a JSON file at the root of your content directory. It lists pages (path → markdown file) and optional sub-manifests (nested directories with their own manifest). The runtime fetches it once per `revalidate` window and resolves every incoming pathname against it. If a path isn't in the manifest, the runtime returns 404 — it never falls back to arbitrary repo files.
    </details>
  </rule>
  <rule>
    <title>Sub-manifests compose by prefix</title>
    <details>
      A manifest entry can reference another manifest by directory. When a request hits `/guides/intro`, the root manifest resolves `/guides` → `guides/_manifest.json`, then the sub-manifest resolves `/intro` → `guides/intro.md`. This lets teams own their own sections without a single global file.
    </details>
  </rule>
  <rule>
    <title>Manifest paths are URL paths, not filesystem paths</title>
    <details>
      Entries use URL-shaped keys (leading `/`, lowercase, hyphen-separated). The runtime normalizes incoming requests the same way. Do not embed file extensions in keys — the value of the entry points at the `.md` file; the key is the pretty URL.
    </details>
  </rule>
  <rule>
    <title>Programmatic resolution via `this.manifest.resolve(path)`</title>
    <details>
      Plugins can call `resolve(path)` on the injected `ManifestLike`. It returns `{ found, contentUrl, manifestPath, meta? }`. `contentUrl` is the fully-qualified jsDelivr URL of the markdown file. Use `this.fetchable.http.get(contentUrl)` to fetch the raw content.
    </details>
  </rule>
  <rule>
    <title>`manifest.reload()` invalidates — but lazily</title>
    <details>
      `reload()` clears the in-memory manifest cache. The next request that needs the manifest re-fetches it from the CDN. This is how `Markdash` and `AutoInvalidate` trigger refreshes. Calling `reload()` does *not* block until the fetch completes — keep it fire-and-forget.
    </details>
  </rule>
  <rule>
    <title>Manifest entries may carry metadata</title>
    <details>
      Each entry can include a `meta: { title?, description?, tags?, ... }` payload. The runtime surfaces it as the page's scope during rendering. Front-matter inside the `.md` file overrides manifest-level `meta` for per-page values, but manifest metadata is still useful for listings, sitemaps, and feeds.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Root manifest with sub-manifests</description>
    <reference_path>./examples/correct-manifest.json</reference_path>
  </example>
  <example>
    <description>Correct: Sub-manifest for a `/guides` section</description>
    <reference_path>./examples/correct-sub-manifest.json</reference_path>
  </example>
  <example>
    <description>Correct: Programmatic resolution in a plugin</description>
    <reference_path>./examples/correct-programmatic.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common manifest mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
