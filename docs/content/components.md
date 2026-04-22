---
title: Components
description: Reusable HTML components rendered by the Engine
order: 5
---

# Components

Components are reusable HTML fragments that you embed in your layout template or markdown content using `<markdoc component="name" />` tags. The Engine loads all components from the `_components/` directory at startup and resolves them at render time.

## How it works

The rendering pipeline processes components as the final step:

1. Markdown is parsed into HTML (body content).
2. The Layout template is interpolated with `{{ key }}` placeholders.
3. The Engine scans the full HTML output for `<markdoc component="..." />` tags and replaces each with the component's content, interpolated with store state and tag attributes.

Components are preloaded once — the Engine fetches `_components/_manifest.md` on first request, reads the `children` list, then fetches all component HTML files in parallel. After that, resolving is instant (no network calls per route).

## Directory structure

Components live in a `_components/` folder at the root of your content directory:

```
docs/content/
  _manifest.md
  _components/
    _manifest.md        ← declares available components
    nav.html
    sidebar.html
    footer.html
  index.md
  getting-started.md
```

The `_components/_manifest.md` file uses the same frontmatter format as page manifests:

```yaml
---
children:
  - nav
  - sidebar
  - footer
---
```

Only components listed in `children` are loaded. Files in `_components/` not listed in the manifest are ignored.

## Writing a component

A component is a plain HTML file with `{{ key }}` placeholders. Placeholders are interpolated with two sources: store state (page metadata, path, URL) and tag attributes.

Example `_components/nav.html`:

```html
<nav class="main-nav">
  <a href="/">Home</a>
  <a href="/getting-started">Getting Started</a>
  <a href="/plugins">Plugins</a>
</nav>
```

Example `_components/page-header.html` using placeholders:

```html
<header class="page-header">
  <h1>{{ title }}</h1>
  <p class="description">{{ description }}</p>
</header>
```

When a page with `title: "Plugins"` and `description: "Extend your server"` renders, the component outputs:

```html
<header class="page-header">
  <h1>Plugins</h1>
  <p class="description">Extend your server</p>
</header>
```

## Using components

### Self-closing tag

Insert a component with no inner content:

```html
<markdoc component="nav" />
```

### Tag with attributes

Pass extra values via attributes — they become `{{ key }}` variables inside the component, overriding store values of the same name:

```html
<markdoc component="sidebar" collapsed="true" />
```

Inside `_components/sidebar.html`:

```html
<aside class="sidebar" data-collapsed="{{ collapsed }}">
  {{ body }}
</aside>
```

### Tag with body content

Wrap content in an opening/closing `<markdoc>` tag. The inner HTML is available as `{{ body }}` inside the component:

```html
<markdoc component="card" title="Quick Start">
  <p>Install the package and create your first page.</p>
</markdoc>
```

Inside `_components/card.html`:

```html
<div class="card">
  <h3>{{ title }}</h3>
  <div class="card-body">{{ body }}</div>
</div>
```

## Interpolation variables

When the Engine renders a component, it builds variables from three sources in this order (later sources override earlier ones):

1. **Store state** — page metadata set by the server during request handling: `path`, `url`, `title`, `description`, and any other frontmatter fields.
2. **Tag attributes** — values from the `<markdoc>` tag itself (e.g. `collapsed="true"`).
3. **Body content** — for non-self-closing tags, the inner HTML is available as `{{ body }}`.

Unmatched `{{ key }}` placeholders are left as-is.

## Nested components

Components can reference other components. The Engine resolves recursively up to 10 passes:

`_components/page-layout.html`:

```html
<div class="page-layout">
  <markdoc component="sidebar" />
  <main>{{ body }}</main>
</div>
```

`_components/sidebar.html`:

```html
<aside class="sidebar">
  <markdoc component="nav" />
</aside>
```

The Engine resolves `page-layout` first, finds `<markdoc component="sidebar" />`, resolves it, finds `<markdoc component="nav" />` inside, and resolves that too.

## Using in templates

Components work in Layout templates too. Place `<markdoc />` tags anywhere in your `_template.md` or inline `getTemplate`:

```html
<!DOCTYPE html>
<html>
<head><title>{{ title }}</title></head>
<body>
  <markdoc component="nav" />
  <main class="container">{{ body }}</main>
  <markdoc component="footer" />
</body>
</html>
```

## Cache behavior

Components are fetched once at startup and cached in memory. When `revalidate` is set in your markdoc config, the manifest preload runs again after the cache expires, refreshing all component content.
