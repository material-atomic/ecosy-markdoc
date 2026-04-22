---
title: Layout
description: Template-based page wrapper — wraps every page in an HTML layout
order: 1
---

# Layout

The Layout plugin wraps every rendered page in an HTML template. It is the only plugin the server creates automatically — you never add it to `plugins[]` yourself. If you need a custom layout, you override it by writing your own Layout plugin or by placing a `_template.md` file in your content root.

## How the server resolves layout

On each request the server picks the layout in this order:

1. **User plugin** — if any plugin in `plugins[]` declares `template.root` in its registry and implements `getTemplate()`, that plugin becomes the layout. This is a full override.
2. **Built-in Layout** — the server creates an internal Layout instance. It loads `_template.md` from your content directory on the CDN.
3. **Default template** — if `_template.md` does not exist, the server falls back to a minimal HTML template with Inter font, responsive CSS, and clean typography.

Every page is always wrapped — there is no "layout-less" mode.

## Template file

Place a `_template.md` file in your content root. The server loads it automatically:

```
docs/content/
  _manifest.md
  _metadata.md
  _template.md       <-- layout template
  index.md
  getting-started.md
```

Use `{{ path.key }}` placeholders for dynamic values. The server builds a structured store state and interpolates all expressions using JSONQuery dot-path evaluation:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{ head.metadata }}
  {{ head.links }}
  {{ head.scripts }}
  <style>{{ head.style }}</style>
</head>
<body>
  <main>{{ body.main }}</main>
  {{ body.scripts }}
</body>
</html>
```

## Store state variables

The server populates these structured variables before template interpolation:

### `head`

```
head.metadata   — generated <meta> tags (title, description, OG, custom)
head.links      — <link> tags
head.scripts    — <script> tags for <head>
head.style      — inline CSS
```

### `body`

```
body.main       — rendered and sanitized page HTML
body.scripts    — <script> tags for end of <body>
```

### `scope`

```
scope.path        — canonical page path (e.g. "guides/metadata")
scope.url         — public URL for the page
scope.title       — page title from frontmatter
scope.description — page description from frontmatter
scope.metadata    — full merged metadata object
scope.pages       — array of [path, url] tuples from manifest
```

For convenience, `{{ title }}` and `{{ description }}` are flat aliases for `{{ scope.title }}` and `{{ scope.description }}`.

## Components in templates

Templates can include `<markdoc component="..." />` tags. The Engine resolves these after layout interpolation, loading HTML files from the `_components/` directory:

```html
<body>
  <markdoc component="nav" />
  <markdoc component="sidebar" />
  <main>
    <markdoc component="page-header"
      title="{{ scope.title }}"
      description="{{ scope.description }}" />
    {{ body.main }}
  </main>
  <markdoc component="footer" />
  {{ body.scripts }}
</body>
```

Component attributes can reference store variables — the Layout interpolates `{{ scope.title }}` first, then the Engine receives the resolved attribute values.

## Custom Layout plugin

For full control, use the `Layout()` factory to create a custom plugin:

```typescript
import { markdoc, Layout, Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  plugins: [
    Layout({
      template: { root: true },
      urls: {
        "assets/css/style.css": { summary: "Stylesheet" },
      },
      payload: { siteName: "My Docs", year: 2025 },
    }),
    Sitemap,
  ],
});
```

## Configuration

The `Layout()` factory accepts a `LayoutConfig` object:

### `template`

Declares named templates. Set `root: true` to mark the plugin as the root layout provider:

```typescript
Layout({ template: { root: true } })
```

### `urls`

Static assets served by the plugin. Keys are URL paths, values are route schema metadata:

```typescript
Layout({
  template: { root: true },
  urls: {
    "assets/css/style.css": { summary: "Main stylesheet" },
    "assets/js/app.js": { summary: "Client script" },
  },
})
```

### `path`

File-based template source loaded from CDN. Has `name` (file path relative to content root) and `parser` (string or function):

```typescript
// Default — equivalent to omitting path entirely
Layout({
  template: { root: true },
  path: { name: "_template.md", parser: "root" },
})

// Custom file with custom parser
Layout({
  template: { root: true },
  path: {
    name: "_layout.md",
    parser: (content) => marked.parse(content),
  },
})
```

When `parser` is a string, the fetched content is stored under that template name. When it is a function, it receives the raw file content and returns processed HTML.

### `getTemplate`

Inline template — takes precedence over `path` and the default file. Three forms:

**Plain string:**

```typescript
Layout({
  template: { root: true },
  getTemplate: `<html><body>{{ body.main }}</body></html>`,
})
```

**Function receiving the store:**

```typescript
Layout({
  template: { root: true },
  getTemplate: (store) => {
    const pages = store.getState().scope?.pages ?? [];
    const nav = pages.map(([, url]) => `<a href="${url}">Link</a>`).join("");
    return `<html><body><nav>${nav}</nav>{{ body.main }}</body></html>`;
  },
})
```

**Tagged template literal via `html`:**

```typescript
import { Layout, html } from "@ecosy/markdoc";

Layout({
  template: { root: true },
  getTemplate: html`
    <html>
    <body>
      <nav>${store => {
        const pages = store.getState().scope?.pages ?? [];
        return pages.map(([p, u]) => `<a href="${u}">${p}</a>`).join("");
      }}</nav>
      <main>{{ body.main }}</main>
    </body>
    </html>
  `,
})
```

The `html` tag mixes `${store => ...}` for store-reactive values with `{{ key }}` for placeholder interpolation.

### `payload`

Static object or factory function. Values become available as `{{ key }}` placeholders in the template:

```typescript
Layout({
  template: { root: true },
  payload: { siteName: "My Docs", year: 2025 },
})

// Dynamic payload from store
Layout({
  template: { root: true },
  payload: (store) => ({
    siteName: "My Docs",
    pageCount: store.getState().scope?.pages?.length ?? 0,
  }),
})
```

## Subclassing

You can extend the factory output for full method override:

```typescript
class MyLayout extends Layout({
  template: { root: true },
  payload: { siteName: "My Docs" },
}) {
  getTemplate(name: string): string {
    return `<html>
      <head><title>{{ scope.title }} — {{ siteName }}</title></head>
      <body>{{ body.main }}</body>
    </html>`;
  }
}
```

## Default template styles

When no `_template.md` exists and no custom Layout is registered, the built-in template provides:

- Google Fonts Inter (400/500/600/700)
- Responsive `.container` with `max-width: 48rem`, mobile breakpoint at 640px
- Typography for headings, paragraphs, links, lists, tables, blockquotes
- Dark code blocks (`#1e293b`) with monospace font
- XSS-safe output — page body is sanitized before interpolation

## Exports

```typescript
import {
  Layout,
  html,
  type LayoutConfig,
  type LayoutPathEntry,
  type LayoutPathParser,
  type LayoutPayloadFn,
  type LayoutTemplate,
  type LayoutTemplateFn,
  type LayoutUrls,
} from "@ecosy/markdoc";
```
