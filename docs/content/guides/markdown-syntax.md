---
title: Markdown Syntax
description: Complete reference for the built-in markdown parser syntax
order: 3
---

# Markdown Syntax

Ecosy Markdoc includes a lightweight built-in markdown parser — zero dependencies, designed for edge runtimes. It converts markdown to HTML on the server before wrapping it in the Layout template.

You can replace the built-in parser entirely via the `parser` config option. But if you use the default, here is everything it supports.

## Headings

ATX-style headings with `#` through `######`:

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

Trailing `#` characters are stripped: `## My Title ##` renders as `<h2>My Title</h2>`.

## Paragraphs

Consecutive non-blank lines are grouped into a single `<p>` tag. A blank line starts a new paragraph.

```markdown
This is the first paragraph.
This line continues the same paragraph.

This is a new paragraph.
```

## Inline formatting

**Bold** — wrap with `**` or `__`:

```markdown
This is **bold** and this is __also bold__.
```

*Italic* — wrap with `*` or `_`:

```markdown
This is *italic* and this is _also italic_.
```

***Bold + italic*** — wrap with `***` or `___`:

```markdown
This is ***bold and italic***.
```

~~Strikethrough~~ — wrap with `~~`:

```markdown
This is ~~deleted~~ text.
```

`Inline code` — wrap with single backticks:

```markdown
Use the `console.log()` function.
```

## Links and images

Links use `[text](url)` syntax with optional title:

```markdown
[Ecosy](https://github.com/ecosy)
[Ecosy](https://github.com/ecosy "Visit Ecosy on GitHub")
```

Images use `![alt](src)` syntax with optional title:

```markdown
![Logo](/assets/logo.png)
![Logo](/assets/logo.png "Site logo")
```

## Code blocks

Fenced code blocks use triple backticks or triple tildes. An optional language identifier enables the `language-*` CSS class on the rendered `<code>` element:

````
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
```
````

Renders as:

```html
<pre><code class="language-javascript">function greet(name) {
  return `Hello, ${name}!`;
}</code></pre>
```

Tilde fences work identically:

```markdown
~~~python
print("Hello")
~~~
```

## Markdown content blocks

Use four or more backticks to create a fenced block that renders the raw markdown source inside `<pre>`:

`````
````
# This is a heading
This is **bold** text and `inline code`.

- List item one
- List item two
````
`````

This renders as a `<pre class="language-markdown"><code>` block showing the markdown source as-is — useful for documentation pages that need to display markdown examples without parsing them.

The closing fence must use the exact same number of backticks as the opening fence. This means you can nest triple-backtick code blocks inside a four-backtick markdown block without conflict.

## Blockquotes

Lines starting with `>` are grouped into `<blockquote>`:

```markdown
> This is a blockquote.
> It can span multiple lines.
>
> And multiple paragraphs.
```

Blockquote content is parsed recursively — you can use headings, lists, code, and other block elements inside blockquotes.

## Lists

Unordered lists use `-`, `*`, or `+` markers:

```markdown
- First item
- Second item
- Third item
```

Ordered lists use `1.`, `2.`, etc.:

```markdown
1. First item
2. Second item
3. Third item
```

Nested lists are supported via indentation:

```markdown
- Parent item
  - Child item
  - Another child
    - Grandchild
- Back to parent
```

### Task lists

Add `[ ]` or `[x]` after the list marker for task list items:

```markdown
- [x] Completed task
- [ ] Incomplete task
- [x] Another done
```

Renders as checkbox inputs (disabled by default).

## Tables

GFM-style tables with optional column alignment:

```markdown
| Name    | Role      | Status  |
|---------|-----------|---------|
| Alice   | Engineer  | Active  |
| Bob     | Designer  | Away    |
```

Column alignment uses colons in the separator row:

```markdown
| Left   | Center  | Right  |
|:-------|:-------:|-------:|
| text   | text    | text   |
```

- `:---` — left-aligned
- `:---:` — center-aligned
- `---:` — right-aligned

The leading and trailing `|` characters are optional.

## Horizontal rules

Three or more `*`, `-`, or `_` on a line by themselves:

```markdown
***
---
___
```

All render as `<hr>`.

## Footnotes

Define footnotes with `[^id]: text` and reference them inline with `[^id]`:

```markdown
This claim needs a source[^1].

Another point worth noting[^note].

[^1]: Source: Wikipedia
[^note]: This is a longer footnote explanation.
```

Footnote references render as superscript links. Definitions are collected into a `<section class="footnotes">` at the bottom of the page.

## XSS protection

The built-in parser includes defense-in-depth XSS protection:

1. All text content is HTML-escaped during parsing (`<`, `>`, `&`, `"` become entities).
2. After HTML generation, a post-processing sanitizer strips dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`, etc.), removes all `on*` event handler attributes, and neutralizes `javascript:`, `vbscript:`, and `data:` URI schemes.

This sanitization runs on the **page body only** — the Layout template's own `<style>`, `<link>`, and `<meta>` tags are not affected.

## Custom parser

If the built-in parser does not cover your needs, replace it entirely via the `parser` config option. The parser receives the raw markdown body (after frontmatter extraction) and the parsed frontmatter metadata object:

```typescript
import markdoc from "@ecosy/markdoc";
import { marked } from "marked";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  dir: "docs/content",
  parser: (markdown, metadata) => marked.parse(markdown),
});
```

```typescript
import MarkdownIt from "markdown-it";

const mdi = new MarkdownIt();

const app = markdoc({
  // ...
  parser: (markdown) => mdi.render(markdown),
});
```

When using a custom parser, the built-in XSS sanitizer still runs on the output before it is interpolated into the layout template. You can also import `sanitizeHtml` directly if you need it in your own pipeline:

```typescript
import { sanitizeHtml } from "@ecosy/markdoc";
```
