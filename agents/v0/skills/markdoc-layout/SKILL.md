---
name: markdoc-layout
description: Skill for writing the root page layout. Call this skill when defining the HTML shell around every page, loading a layout template from the CDN, or mixing store-reactive expressions into the layout via the `html` tagged literal.
---

# Layout — The Root HTML Wrapper

<instructions>
  <rule>
    <title>Every app needs exactly one root layout</title>
    <details>
      `Layout({ template: { root: true }, ... })` marks a plugin as the root layout provider. The server picks the first plugin registering `root: true` — subsequent ones are dead code. The layout wraps every markdown-rendered page and every plugin-rendered HTML response (unless the plugin sets a non-HTML `Content-Type`).
    </details>
  </rule>
  <rule>
    <title>Four ways to supply a template, in priority order</title>
    <details>
      (1) Config `getTemplate` — inline string or `(store) => string` factory, highest priority, no file loading.
      (2) Config `path: { name, parser }` — CDN file with `parser: "root"` (store as the root template) or a transform function (e.g. run markdown through `marked`).
      (3) Default `_template.md` — when no `getTemplate` or `path` is set.
      (4) Built-in fallback — minimal docs-style HTML if none of the above is available.
    </details>
  </rule>
  <rule>
    <title>Template placeholders come from the request scope</title>
    <details>
      The layout is interpolated with the same `{{ key }}` / `{{ dot.path }}` syntax as components. Common keys: `{{ scope.title }}`, `{{ head.metadata }}`, `{{ head.links }}`, `{{ head.style }}`, `{{ head.scripts }}`, `{{ body.main }}`, `{{ body.scripts }}`. `{{ body.main }}` is the required rendered-page slot.
    </details>
  </rule>
  <rule>
    <title>Use the `html` tagged literal for store-reactive content</title>
    <details>
      `html` mixes static `{{ key }}` interpolation (resolved at render time from payload/scope) with dynamic `${store => ...}` expressions (called at render time with the current store). Inside `${...}` you have full JS — read `store.getState()`, map pages to nav links, compute year, etc. Static text still uses `{{ key }}` because the layout sees the full request scope, not just `store`.
    </details>
  </rule>
  <rule>
    <title>Loading from a CDN file lets content authors own the template</title>
    <details>
      `path: { name: "_template.md", parser: "root" }` tells the runtime to fetch that file from the CDN and register it under the `"root"` template name. A parser function can post-process: `(content) => marked.parse(content)` turns a markdown file into HTML. This is how non-developer content teams can iterate on the page shell without redeploying the runtime.
    </details>
  </rule>
  <rule>
    <title>`payload` injects extra template variables</title>
    <details>
      `payload: { siteName: "…" }` (or a `(store) => ({...})` factory) merges into the interpolation context. Use it for site-wide constants (name, author, social URLs) so the template can reference `{{ siteName }}` without reaching into the store. Dynamic payload lets you compute per-request values while keeping the template declarative.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Inline template via `html` tagged literal</description>
    <reference_path>./examples/correct-html-template.ts</reference_path>
  </example>
  <example>
    <description>Correct: Load template from CDN file (`_template.html`)</description>
    <reference_path>./examples/correct-path-template.ts</reference_path>
  </example>
  <example>
    <description>Correct: Markdown template with custom parser</description>
    <reference_path>./examples/correct-markdown-template.ts</reference_path>
  </example>
  <example>
    <description>Correct: Template file shipped with the app</description>
    <reference_path>./examples/correct-template.html</reference_path>
  </example>
  <example>
    <description>Wrong: Common layout mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
