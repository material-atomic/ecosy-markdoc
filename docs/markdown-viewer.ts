/**
 * MarkdownViewer — reference custom parser for @ecosy/markdoc.
 *
 * Plugs into the `parser` option of `markdoc({...})` and replaces the built-in
 * lightweight parser. Ships the feature surface a documentation site is
 * expected to need:
 *
 *   - GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks)
 *   - LaTeX math via KaTeX (server-rendered — inline `$x$` + block `$$…$$`)
 *   - Mermaid diagrams (code fence `mermaid` → client-rendered `<pre class="mermaid">`)
 *   - Syntax-highlighted code blocks via highlight.js
 *   - GFM alert blocks (`> [!NOTE]`, `> [!TIP]`, …)
 *   - Heading anchors (`<h2 id="…"><a href="#…">…</a></h2>`)
 *   - Footnotes
 *   - Inline attributes (`{.class #id key=val}`)
 *
 * This file doubles as a best-practice example of swapping the Markdoc
 * parser. If you copy it into your own docs, you only need to:
 *
 *   1. `yarn add markdown-it markdown-it-anchor markdown-it-footnote
 *                markdown-it-attrs markdown-it-task-lists
 *                @traptitech/markdown-it-katex highlight.js katex`
 *   2. Pass `MarkdownViewer()` to `markdoc({ parser: ... })`.
 *   3. Include KaTeX + highlight.js CSS and Mermaid JS in your layout
 *      (see `content/_template.md` for the reference setup).
 */

import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import attrs from "markdown-it-attrs";
import taskLists from "markdown-it-task-lists";
import { full as emoji } from "markdown-it-emoji";
import katex from "@traptitech/markdown-it-katex";
import hljs from "highlight.js";
import type { MarkdownParser } from "@ecosy/markdoc";

// ─── Options ─────────────────────────────────────────────────────────

export interface MarkdownViewerOptions {
  /**
   * Allow raw HTML in the source. Default `true`. Set `false` to strictly
   * escape user-authored HTML — useful if the content repo accepts PRs
   * from untrusted contributors.
   */
  allowHtml?: boolean;

  /**
   * Treat single newlines as `<br>`. Default `false` (GitHub/CommonMark).
   */
  breaks?: boolean;

  /**
   * Autolink bare URLs and emails. Default `true`.
   */
  linkify?: boolean;

  /**
   * Apply typographic replacements (`--` → `–`, `...` → `…`, smart quotes).
   * Default `true`.
   */
  typographer?: boolean;

  /**
   * KaTeX options forwarded to `@traptitech/markdown-it-katex`. See
   * https://katex.org/docs/options for the full list.
   */
  katex?: Record<string, unknown>;

  /**
   * Permalink decoration on headings. `symbol` is the rendered glyph,
   * `placement` is `"before"` (default) or `"after"`.
   */
  permalink?: {
    symbol?: string;
    placement?: "before" | "after";
    class?: string;
  };
}

// ─── Factory ─────────────────────────────────────────────────────────

/**
 * Build a `MarkdownParser` backed by markdown-it + its plugin stack.
 *
 * Returned function has the signature Markdoc expects — pass it directly
 * to the `parser` option:
 *
 * ```ts
 * markdoc({
 *   repo: "...",
 *   parser: MarkdownViewer({ katex: { strict: false } }),
 * })
 * ```
 */
export function MarkdownViewer(options: MarkdownViewerOptions = {}): MarkdownParser {
  const md = new MarkdownIt({
    html: options.allowHtml ?? true,
    linkify: options.linkify ?? true,
    typographer: options.typographer ?? true,
    breaks: options.breaks ?? false,
    xhtmlOut: false,
    langPrefix: "language-",
    highlight: (code, lang) => highlight(code, lang),
  });

  // Anchors on every heading — makes `#heading-id` links work.
  md.use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    permalink: anchor.permalink.linkInsideHeader({
      symbol: options.permalink?.symbol ?? "#",
      placement: options.permalink?.placement ?? "before",
      class: options.permalink?.class ?? "doc-anchor",
      ariaHidden: true,
    }),
    slugify: slugify,
  });

  // Footnotes: `[^id]` references + `[^id]:` definitions.
  md.use(footnote);

  // Inline attribute blocks: `{.class #id key=val}` right after an element.
  md.use(attrs, {
    leftDelimiter: "{",
    rightDelimiter: "}",
    allowedAttributes: [], // empty array = allow everything (plugin convention)
  });

  // Task lists: `- [ ]` and `- [x]` → <input type="checkbox">.
  md.use(taskLists, { enabled: true, label: true, labelAfter: true });

  // Emoji shortcodes: `:smile:` → 😄. The `full` preset includes every
  // named emoji GitHub supports (`:+1:`, `:heart:`, `:tada:`, ...).
  md.use(emoji);

  // KaTeX: inline `$x$` + block `$$x$$` → server-side rendered HTML.
  md.use(katex, {
    throwOnError: false,
    errorColor: "#dc2626",
    ...options.katex,
  });

  // GFM alert blocks: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`, ...
  installAlertBlocks(md);

  // Mermaid fences: ```mermaid → <pre class="mermaid">…</pre>
  installMermaidFence(md);

  // Link hygiene — external links get rel + target; internal links stay clean.
  installLinkAttributes(md);

  return (markdown, _metadata) => md.render(markdown);
}

// ─── Internals: code highlighting ────────────────────────────────────

function highlight(code: string, lang: string): string {
  if (lang === "mermaid") {
    // Handled by the fence override, but keep defensive in case a plugin
    // bypasses `renderer.rules.fence`.
    return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
  }

  if (lang && hljs.getLanguage(lang)) {
    try {
      const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      return `<pre class="hljs language-${lang}"><code class="language-${lang}">${html}</code></pre>`;
    } catch {
      /* fall through to plain rendering */
    }
  }

  return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
}

// ─── Internals: Mermaid fence ────────────────────────────────────────

function installMermaidFence(md: MarkdownIt): void {
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = (token.info ?? "").trim().split(/\s+/)[0];

    if (lang === "mermaid") {
      // Keep the raw content unescaped apart from entity-safe characters —
      // Mermaid parses the literal text client-side. The `.mermaid` class
      // is what Mermaid's `run()` scans for.
      return `<pre class="mermaid">${escapeHtml(token.content.trimEnd())}</pre>\n`;
    }

    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

// ─── Internals: GFM alert blocks ────────────────────────────────────

const ALERT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
type AlertType = (typeof ALERT_TYPES)[number];

function installAlertBlocks(md: MarkdownIt): void {
  // Post-process the AST: when a blockquote opens with `[!TYPE]` on its
  // first line, re-tag the blockquote with a CSS class and strip the marker.
  md.core.ruler.after("block", "gfm_alerts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "blockquote_open") continue;

      // Find the first inline token inside the blockquote.
      const inline = findFirstInline(tokens, i);
      if (!inline) continue;

      const m = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:\n|$)/i);
      if (!m) continue;

      const type = m[1].toLowerCase() as AlertType;
      tokens[i].attrJoin("class", `alert alert-${type}`);

      // Strip the marker from the inline content + its children.
      inline.content = inline.content.slice(m[0].length);
      if (inline.children?.length) {
        const firstText = inline.children.find((c) => c.type === "text");
        if (firstText) {
          firstText.content = firstText.content.replace(
            /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i,
            "",
          );
        }
        // Drop the softbreak that followed the marker, if present.
        if (inline.children[0]?.type === "softbreak") {
          inline.children.shift();
        }
      }
    }
  });
}

function findFirstInline(
  tokens: ReturnType<MarkdownIt["parse"]>,
  blockquoteOpenIdx: number,
) {
  for (let j = blockquoteOpenIdx + 1; j < tokens.length; j++) {
    if (tokens[j].type === "blockquote_close") return null;
    if (tokens[j].type === "inline") return tokens[j];
  }
  return null;
}

// ─── Internals: link attributes ──────────────────────────────────────

function installLinkAttributes(md: MarkdownIt): void {
  const defaultOpen = md.renderer.rules.link_open;

  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet("href") ?? "";

    if (/^https?:\/\//i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }

    return defaultOpen
      ? defaultOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };
}

// ─── Internals: helpers ──────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
