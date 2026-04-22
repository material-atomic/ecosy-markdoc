---
title: Metadata
description: Control page metadata and HTML meta tags from frontmatter
order: 5
---

# Metadata

Every markdown page in Ecosy Markdoc starts with YAML frontmatter. The frontmatter defines page-level settings like `title` and `description`, and can include a `metadata` key for custom HTML `<meta>` tags.

## Frontmatter structure

```yaml
---
title: Getting Started
description: Installation, configuration, and first deployment
order: 1
metadata:
  author: Ken Nguyen
  robots: index, follow
  og:image: ./images/getting-started-cover.png
  twitter:card: summary_large_image
---
```

Top-level keys like `title`, `description`, and `order` are reserved by the framework. The `metadata` key is a flat object whose entries become `<meta>` tags in the rendered HTML `<head>`.

## Auto-generated tags

The server automatically generates these tags from top-level frontmatter — you do not need to repeat them in `metadata`:

```html
<title>Getting Started</title>
<meta name="description" content="Installation, configuration, and first deployment">
<meta property="og:title" content="Getting Started">
<meta property="og:description" content="Installation, configuration, and first deployment">
```

These are always present when `title` and `description` are set.

## Custom metadata

Entries under the `metadata` key are rendered as `<meta>` tags. The attribute used depends on the key prefix:

Keys starting with `og:` or `fb:` use the `property` attribute (Open Graph / Facebook protocol). All other keys use the `name` attribute.

```yaml
metadata:
  author: Ken Nguyen        # → <meta name="author" content="Ken Nguyen">
  robots: index, follow     # → <meta name="robots" content="index, follow">
  og:image: ./images/og.png # → <meta property="og:image" content="https://cdn...">
  og:type: article          # → <meta property="og:type" content="article">
  twitter:card: summary     # → <meta name="twitter:card" content="summary">
```

## Template placement

In the root template, the `{{ head.metadata }}` placeholder renders all generated meta tags. A typical `<head>` section:

```html
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{{ head.metadata }}
{{ head.links }}
{{ head.scripts }}
<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">
</head>
```

The template can also reference individual scope values. For example, `{{ scope.title }}` and `{{ scope.description }}` are available as standalone variables for use outside of meta tags:

```html
<title>{{ scope.title }} — My Docs</title>
```

## Global metadata with _metadata.md

Create a `_metadata.md` file at the root of your content directory to define site-wide default metadata. This acts as a fallback — every page inherits these values unless it overrides them.

```
docs/content/
  _manifest.md
  _metadata.md       ← global defaults
  _template.md
  index.md
  getting-started.md
```

Example `_metadata.md`:

```yaml
---
metadata:
  author: Ken Nguyen
  og:type: article
  og:site_name: Ecosy Markdoc Docs
  twitter:card: summary
  robots: index, follow
---
```

Every page automatically inherits these meta tags. A page that declares its own `metadata.author` overrides the global value; keys not overridden are preserved.

## Merge priority

Metadata is merged from three sources. Later sources override earlier ones:

1. **Global** — `_metadata.md` at the content root (lowest priority)
2. **Page** — the page's own `path.md` frontmatter
3. **Index** — `path/index.md` if it exists (highest priority)

Top-level keys and the nested `metadata` object are both merged. The `metadata` object is deep-merged one level — individual keys inside `metadata` are overridden independently, not the entire object.

For example, given these three files:

`_metadata.md` (global):

```yaml
---
metadata:
  author: Ken Nguyen
  robots: index, follow
  og:site_name: Ecosy Markdoc Docs
---
```

`guides/plugins.md` (page):

```yaml
---
title: Plugins
description: Plugin system overview
metadata:
  og:image: ./images/plugins.png
---
```

`guides/plugins/index.md` (index):

```yaml
---
title: Plugins Guide
metadata:
  og:image: ./images/plugins-v2.png
---
```

The merged result for route `/guides/plugins`:

```yaml
title: Plugins Guide                    # from index.md
description: Plugin system overview     # from plugins.md
metadata:
  author: Ken Nguyen                    # from _metadata.md (global)
  robots: index, follow                 # from _metadata.md (global)
  og:site_name: Ecosy Markdoc Docs     # from _metadata.md (global)
  og:image: ./images/plugins-v2.png    # from index.md (overrides page)
```

The global file is loaded once at startup alongside the manifest and engine. Page and index files are fetched in parallel so latency is not affected.

## Store state

All metadata is available in the structured store state under `scope.metadata`. Plugins and components can access it:

```typescript
// In a plugin
const meta = this.store.getState().scope.metadata;
const author = meta.author;
```

In components, use dot-path expressions:

```html
<span>{{ scope.title }}</span>
<span>{{ scope.description }}</span>
```

## Reserved frontmatter keys

These top-level frontmatter keys have special meaning:

- `title` — page title, used in `<title>` tag and Open Graph
- `description` — page description, used in meta description and Open Graph
- `order` — sort order for manifest children
- `children` — declares child pages (only in `_manifest.md`)
- `metadata` — custom `<meta>` tag entries (see above)
