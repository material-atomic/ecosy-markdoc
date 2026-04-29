---
title: Store-Reactive Layout with `html` Tagged Literal
description: Mix static `{{ key }}` placeholders with dynamic `${store => ...}` expressions for nav menus, breadcrumbs, and contextual content.
order: 7
---

# Store-Reactive Layout with `html` Tagged Literal

The `Layout` plugin wraps every rendered page in an HTML shell. Most of the shell is static markup with `{{ placeholder }}` interpolation, but some parts — nav menu from the manifest, breadcrumbs, page-specific scripts — need access to the request's store at render time. The `html` tagged literal is the bridge.

## What you'll build

A layout that:

- Uses static `{{ scope.title }}` and payload interpolation for things known at config time
- Calls `store.getState().pages` at render time to build a nav menu from the manifest
- Computes the current year dynamically

## Code

```typescript
import markdoc, { Layout, html } from "@ecosy/markdoc";

export default markdoc({
  repo: "your-org/your-docs-repo",
  dir: "content",

  plugins: [
    Layout({
      template: { root: true },

      // Static values injected into every `{{ key }}` placeholder below
      payload: {
        siteName: "My Docs",
      },

      getTemplate: html`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{{ scope.title }} — {{ siteName }}</title>
            <meta name="description" content="{{ scope.description }}" />
            {{ head.metadata }}
            {{ head.links }}
            {{ head.style }}
          </head>
          <body>
            <header>
              <a href="/" class="brand">{{ siteName }}</a>
              <nav>
                ${(store) => {
                  // Dynamic — runs on every request
                  const pages = (store.getState().pages ?? []) as Array<[string, string]>;
                  return pages
                    .map(([title, url]) => `<a href="${url}">${escapeHtml(title)}</a>`)
                    .join("");
                }}
              </nav>
            </header>

            <main class="container">
              <h1>{{ scope.title }}</h1>
              <article class="prose">{{ body.main }}</article>
            </main>

            <footer>
              &copy; ${() => new Date().getFullYear()} {{ siteName }}
            </footer>

            {{ body.scripts }}
          </body>
        </html>
      `,
    }),
  ],
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
```

## How `html` works

`html\`...\`` is a tagged template literal that returns a `(store) => string` function. Markdoc calls it with the current request store. Inside:

- `${(store) => ...}` — called at render time with the store. Return any string.
- `${() => ...}` — ignores the store (use for e.g. `new Date()`)
- `${someString}` — interpolated as-is (static)
- `{{ key }}` — resolved by the interpolator **after** the tagged literal runs. Comes from `payload` + the page's scope.

Order of resolution:

1. `html` tag call produces a single string (static + dynamic parts concatenated)
2. Markdoc runs the `{{ key }}` interpolator on that string with the merged scope

This means you can mix the two — `${store => store.getState().scope.author}` works, and so does `{{ scope.author }}`. Choose `${}` when you need JS control flow (loops, conditionals); choose `{{}}` for simple field lookups that the template author will edit.

## What's in the store

At layout render time, the store has:

- `pages` — all manifest entries `[[title, url], ...]`
- `scope` — page-specific frontmatter (title, description, etc.)
- `head`, `body` — markdown-rendered slot strings
- Plus anything your plugins push during `beginRequest` / `fetch`

## Alternative: file-based template

If you prefer authors to edit HTML (not TypeScript), load the template from the CDN:

```typescript
Layout({
  template: { root: true },
  path: { name: "_template.html", parser: "root" },
})
```

Now `_template.html` in your content repo becomes the layout. Trade-off: you lose the `${}` dynamic expressions, only `{{ key }}` works.

## Pitfalls

- **Calling `store.getState()` outside a `${...}`** — won't work. The raw `{{ key }}` interpolator doesn't execute functions.
- **Mixing escape rules** — content inside `${...}` is NOT auto-escaped. If you're rendering user-supplied data, call a HTML escape yourself.
- **Template gets re-created every request** — `Layout({...})` is called once at startup; the returned plugin instance caches the template. The `${store => ...}` functions run per request. Keep them cheap.

## Next steps

- [Custom markdown parser](/examples/custom-markdown-parser) — plug markdown-it into the same app
- [Operator dashboard](/examples/operator-dashboard) — admin UI at a custom prefix
