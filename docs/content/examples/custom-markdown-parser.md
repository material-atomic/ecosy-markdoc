---
title: Custom Markdown Parser with GFM, KaTeX, Mermaid
description: Replace the built-in lightweight parser with markdown-it + full GitHub Flavored Markdown, math, diagrams, and syntax highlighting.
order: 4
---

# Custom Markdown Parser with GFM, KaTeX, Mermaid

The built-in `builtinParser` covers the essentials (headings, tables, task lists, code blocks). When you need emoji shortcodes, LaTeX math, Mermaid diagrams, or full syntax highlighting, plug in [markdown-it](https://github.com/markdown-it/markdown-it).

## What you'll build

A drop-in parser that supports:

- **GitHub Flavored Markdown** — tables, strikethrough, autolinks, task lists
- **Emoji shortcodes** — `:smile:` → 😄
- **LaTeX math** — inline `$x^2$` and block `$$...$$` rendered server-side via KaTeX
- **Mermaid diagrams** — fenced code blocks with ` ```mermaid ` rendered client-side
- **GitHub alert blocks** — `> [!NOTE]`, `> [!WARNING]`, …
- **Server-side syntax highlighting** via highlight.js
- **Heading anchors + footnotes + inline attributes**

A reference implementation ships in the repo at [`docs/markdown-viewer.ts`](https://github.com/material-atomic/ecosy-markdoc/tree/main/docs/markdown-viewer.ts). This page shows the public API.

## Install

```sh
yarn add markdown-it markdown-it-anchor markdown-it-footnote \
         markdown-it-attrs markdown-it-task-lists markdown-it-emoji \
         @traptitech/markdown-it-katex highlight.js katex
yarn add -D @types/markdown-it @types/markdown-it-footnote @types/markdown-it-emoji
```

## Parser

```typescript
// markdown-viewer.ts
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import attrs from "markdown-it-attrs";
import taskLists from "markdown-it-task-lists";
import { full as emoji } from "markdown-it-emoji";
import katex from "@traptitech/markdown-it-katex";
import hljs from "highlight.js";
import type { MarkdownParser } from "@ecosy/markdoc";

export function MarkdownViewer(): MarkdownParser {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: (code, lang) => {
      if (lang === "mermaid") {
        return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
      }
      if (lang && hljs.getLanguage(lang)) {
        try {
          const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
          return `<pre class="hljs language-${lang}"><code>${html}</code></pre>`;
        } catch { /* fall through */ }
      }
      return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
    },
  });

  md.use(anchor, { level: [1, 2, 3, 4, 5, 6] });
  md.use(footnote);
  md.use(attrs);
  md.use(taskLists, { enabled: true, label: true });
  md.use(emoji);
  md.use(katex, { throwOnError: false });

  // Mermaid override: treat ```mermaid fences as a render target for the
  // client-side Mermaid library, not as a code block
  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    const lang = (t.info ?? "").trim().split(/\s+/)[0];
    if (lang === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(t.content.trimEnd())}</pre>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  return (markdown) => md.render(markdown);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

## Wiring

```typescript
import markdoc from "@ecosy/markdoc";
import { MarkdownViewer } from "./markdown-viewer";

export default markdoc({
  repo: "your-org/your-docs-repo",
  parser: MarkdownViewer(),
});
```

## Layout HTML (needed for KaTeX/hljs/Mermaid)

The parser emits HTML; the browser still needs CSS for KaTeX + highlight.js, and the Mermaid runtime for diagrams. Load them in your `_template.md`:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css" />

<!-- bottom of body -->
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
  mermaid.run({ querySelector: "pre.mermaid" });
</script>
```

## What a page looks like now

```markdown
## Math

Inline: $E = mc^2$

Block:
$$
\int_0^1 x^2\,dx = \tfrac{1}{3}
$$

## Diagram

\`\`\`mermaid
graph LR
  A[Client] --> B[Markdoc]
  B --> C[jsDelivr CDN]
  C --> B
\`\`\`

## Emoji + task list

I :heart: GFM :smile:

- [x] tables
- [ ] definition lists
- [x] footnotes[^note]

[^note]: rendered at the bottom via `markdown-it-footnote`.

## Alert

> [!WARNING]
> Tag bodies are trusted content. Sanitize user input separately.
```

## Next steps

- [Store-reactive layout](/examples/store-reactive-layout) — customize the HTML shell
- [Operator dashboard](/examples/operator-dashboard) — let operators reload component templates
