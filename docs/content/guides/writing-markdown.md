---
title: Writing Markdown
description: How to write markdown content for Ecosy Markdoc
order: 1
---

# Writing Markdown

Every page in Ecosy Markdoc is a plain `.md` file. The framework parses each file into two parts: **frontmatter** (YAML metadata between `---` fences) and **body** (everything after the closing fence). Both are returned in the JSON response.

## Frontmatter

Frontmatter is a block of YAML-like metadata at the top of your file, wrapped in triple dashes:

```markdown
---
title: My Page Title
description: A short summary of what this page covers
author: Jane Doe
draft: false
order: 3
---

Your content starts here.
```

The parser supports a subset of YAML:

**Scalar values** — strings, numbers, booleans, and null are auto-detected:

```yaml
title: Getting Started       # string
order: 3                     # number
draft: false                 # boolean
deprecated: null             # null
```

**Quoted strings** — wrap in double quotes to preserve the exact value and prevent coercion:

```yaml
version: "3.0"               # stays as string "3.0", not number 3
code: "true"                 # stays as string "true", not boolean
```

**Lists** — declare a key with no inline value, then indent with `- ` on the following lines:

```yaml
tags:
  - getting-started
  - tutorial
  - beginner
```

Lists are always flat (one level deep). Nested lists are not supported.

**Comments** — lines starting with `#` inside the frontmatter block are ignored.

## Body content

Everything after the closing `---` is the body. The framework returns it as a raw string — it does not transform or render the markdown. Your frontend is responsible for rendering the body however you like (using a markdown renderer, MDX pipeline, or plain HTML conversion).

This means you can use any markdown syntax your frontend supports: headings, links, images, code blocks, tables, HTML embeds, custom components — the framework does not restrict or validate body content.

## Files without frontmatter

If a file has no `---` fences, the entire content is treated as the body and metadata will be an empty object:

```json
{
  "metadata": {},
  "body": "The entire file content..."
}
```

## File naming

Page files use slug-style names: lowercase letters, numbers, and hyphens. The file extension is always `.md`.

```
getting-started.md        ✓
api-reference.md          ✓
01-introduction.md        ✓
My Page.md                ✗  (spaces not allowed)
page_with_underscores.md  ✗  (underscores not allowed in slugs)
```

The filename (minus `.md`) becomes the URL path. `guides/writing-markdown.md` is served at `/guides/writing-markdown`.

## Special files

Files named `_manifest.md` are not content pages. They are structural files that define the sitemap. See the [Organizing Content](/guides/organizing-content) guide for details.
