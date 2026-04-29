---
name: markdoc-engine
description: Skill for working with the rendering engine — component templates, tag rendering, placeholder interpolation. Call this skill when defining `_components/*.html` templates, contributing inline components from a plugin, or understanding how tag trees become HTML.
---

# Engine — Component Templates and Tag Rendering

<instructions>
  <rule>
    <title>Components live under `_components/` on the CDN</title>
    <details>
      Any HTML file under `<dir>/_components/` is fetched on demand and registered in the engine by filename (without extension). `_components/card.html` becomes the component `card`, usable in markdown via a Markdoc tag. The engine lazy-loads each component the first time it is referenced, then caches until `engine.reload()`.
    </details>
  </rule>
  <rule>
    <title>Plugins can contribute inline components</title>
    <details>
      `PluginRegistry.components` maps component name → HTML template. Plugin-provided components override file-based components of the same name — this is how themes or overlays customize visuals. Contribute the template as a raw string with `{{ key }}` placeholders.
    </details>
  </rule>
  <rule>
    <title>`{{ key }}` is the placeholder syntax</title>
    <details>
      The engine's interpolator replaces `{{ key }}` and `{{ scope.title }}` patterns. Resolution uses `JSONQuery.evaluate` so dot-paths work (`{{ attrs.class }}`, `{{ scope.breadcrumbs[0].title }}`). Unmatched placeholders are left literal — deliberately, so template typos are visible rather than silently swallowed.
    </details>
  </rule>
  <rule>
    <title>Tag attributes + body become template variables</title>
    <details>
      When rendering a tag, the engine builds a variable bag from `tag.attrs` (flat keys), merges in the current scope, and exposes `tag.body` as `{{ body }}`. Every attribute on the tag is available directly: `{% card title="Hello" %}...{% /card %}` → the template sees `{{ title }}` and `{{ body }}`.
    </details>
  </rule>
  <rule>
    <title>`engine.reload()` clears the component cache</title>
    <details>
      Invoked by `Markdash` and `AutoInvalidate`. After `reload()`, the next request fetches components fresh from the CDN. Inline components contributed by plugins are not affected — those are re-applied when the `Pluginable` resolves for each request.
    </details>
  </rule>
  <rule>
    <title>HTML escaping is the consumer's responsibility</title>
    <details>
      The engine does not escape attribute values or body before interpolation. If a markdown author puts `<script>` in a tag attribute, it ends up in the rendered HTML verbatim. Sanitize at the boundary — either in the parser (`sanitizeHtml`) or in the plugin that accepts user input. Templates are trusted content; tag bodies / attrs may not be.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: File-based component with attributes</description>
    <reference_path>./examples/correct-component.html</reference_path>
  </example>
  <example>
    <description>Correct: Plugin contributing inline components</description>
    <reference_path>./examples/correct-plugin-components.ts</reference_path>
  </example>
  <example>
    <description>Correct: Markdown usage of components</description>
    <reference_path>./examples/correct-markdown-usage.md</reference_path>
  </example>
  <example>
    <description>Wrong: Common engine mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
