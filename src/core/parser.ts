/**
 * Markdown Parser — lightweight built-in HTML renderer for edge runtimes.
 *
 * Supports: headings, paragraphs, bold, italic, links, images, code
 * (inline + fenced blocks), blockquotes, horizontal rules, unordered
 * and ordered lists (nested), GFM tables (with alignment),
 * strikethrough, task lists, and footnotes.
 *
 * Zero dependencies. Custom parsers can replace this entirely via
 * `MarkdocConfigurations.parser`.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type MarkdownParser = (markdown: string, metadata: Record<string, unknown>) => string;

// ─── Built-in parser ────────────────────────────────────────────────

/**
 * Escape HTML entities in text content.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse inline markdown: bold, italic, strikethrough, code, links, images.
 *
 * Strategy:
 * 1. Extract inline code spans into placeholders (protect from escaping).
 * 2. Escape HTML entities in remaining text so `<`, `>`, `&` render safely.
 * 3. Apply inline markdown transformations (bold, italic, links, etc.).
 * 4. Restore code spans (already escaped during extraction).
 */
function parseInline(text: string): string {
  // 1. Extract inline code spans → placeholders
  const codeSpans: string[] = [];
  let result = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00CODE${idx}\x00`;
  });

  // 2. Escape HTML in regular text (after code extraction)
  result = escapeHtml(result);

  // 3. Inline markdown transformations

  // Images ![alt](src "title") — attributes already escaped by escapeHtml above
  result = result.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, alt, src, title) => {
      const t = title ? ` title="${title}"` : "";
      return `<img src="${src}" alt="${alt}"${t}>`;
    },
  );

  // Links [text](url "title")
  result = result.replace(
    /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_, linkText, href, title) => {
      const t = title ? ` title="${title}"` : "";
      return `<a href="${href}"${t}>${linkText}</a>`;
    },
  );

  // Bold+italic ***text*** or ___text___
  result = result.replace(/(\*\*\*|___)(.+?)\1/g, "<strong><em>$2</em></strong>");

  // Bold **text** or __text__
  result = result.replace(/(\*\*|__)(.+?)\1/g, "<strong>$2</strong>");

  // Italic *text* or _text_ (avoid matching inside URLs/words with underscores)
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

  // Strikethrough ~~text~~
  result = result.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Footnote references [^id]
  result = result.replace(/\[\^([^\]]+)\]/g, '<sup><a href="#fn-$1" id="fnref-$1">$1</a></sup>');

  // 4. Restore code spans. The `\x00...` sentinels are intentional — null
  // bytes cannot appear in user input, so they are safe placeholders that
  // won't collide with anything the markdown source could produce.
  // eslint-disable-next-line no-control-regex
  result = result.replace(/\x00CODE(\d+)\x00/g, (_, idx) => codeSpans[Number(idx)]);

  return result;
}

// ─── XSS Sanitizer ─────────────────────────────────────────────────

/** Dangerous tags that should be completely removed (tag + content). */
const STRIP_TAGS =
  /(<\s*(script|style|iframe|object|embed|applet|form|textarea|select|button|input|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\2\s*>|<\s*(script|style|iframe|object|embed|applet|form|textarea|select|button|input|link|meta|base)\b[^>]*\/?\s*>)/gi;

/** Event handler attributes: onclick, onerror, onload, onmouseover, etc. */
const EVENT_ATTRS = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** javascript:, vbscript:, data: URI schemes in href/src/action attributes. */
const DANGEROUS_URIS =
  /(href|src|action|formaction|xlink:href|data)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*')/gi;

/**
 * Sanitize HTML output to prevent XSS attacks.
 *
 * Strategy:
 * 1. Strip dangerous tags entirely (script, style, iframe, object, embed, etc.)
 * 2. Remove all event handler attributes (on*)
 * 3. Remove dangerous URI schemes (javascript:, vbscript:, data:) from href/src
 *
 * This runs as a post-processing step after markdown→HTML conversion,
 * providing defense-in-depth even when the parser already escapes input.
 * Also exported for custom parsers to reuse.
 */
export function sanitizeHtml(html: string): string {
  let result = html;

  // 1. Strip dangerous tags (with content) — run twice for nested cases
  result = result.replace(STRIP_TAGS, "");
  result = result.replace(STRIP_TAGS, "");

  // 2. Remove event handler attributes
  result = result.replace(EVENT_ATTRS, "");

  // 3. Remove dangerous URI schemes
  result = result.replace(DANGEROUS_URIS, (match, attr) => `${attr}=""`);

  return result;
}

// ─── Block parsing ──────────────────────────────────────────────────

interface BlockToken {
  type: string;
  content: string;
  lang?: string;
  rows?: string[][];
  alignments?: ("left" | "center" | "right" | null)[];
  items?: ListItem[];
  ordered?: boolean;
  footnotes?: Map<string, string>;
}

interface ListItem {
  content: string;
  checked?: boolean | null;
  children?: { items: ListItem[]; ordered: boolean };
}

/**
 * Tokenize markdown into block-level tokens.
 */
function tokenize(markdown: string): BlockToken[] {
  const lines = markdown.split("\n");
  const tokens: BlockToken[] = [];
  const footnotes = new Map<string, string>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Markdown content block (4+ backticks) — render raw markdown in <pre>
    const mdBlockMatch = line.match(/^(`{4,})\s*$/);
    if (mdBlockMatch) {
      const fence = mdBlockMatch[1];
      const innerLines: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== fence) {
        innerLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      tokens.push({ type: "markdown-pre", content: innerLines.join("\n") });
      continue;
    }

    // Fenced code block (3 backticks/tildes)
    const fenceMatch = line.match(/^(`{3}|~{3,})(\w*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      tokens.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    // Footnote definition [^id]: text
    const footnoteMatch = line.match(/^\[\^([^\]]+)\]:\s+(.+)$/);
    if (footnoteMatch) {
      footnotes.set(footnoteMatch[1], footnoteMatch[2]);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      tokens.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Heading (ATX)
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (headingMatch) {
      tokens.push({
        type: `h${headingMatch[1].length}`,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      tokens.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // Table (GFM)
    if (
      i + 1 < lines.length &&
      line.includes("|") &&
      /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (row: string): string[] =>
        row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());

      const headerCells = parseRow(line);
      const alignRow = parseRow(lines[i + 1]);
      const alignments = alignRow.map((cell): "left" | "center" | "right" | null => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        if (left) return "left";
        return null;
      });

      const rows: string[][] = [headerCells];
      i += 2; // skip header + separator

      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(parseRow(lines[i]));
        i++;
      }

      tokens.push({ type: "table", content: "", rows, alignments });
      continue;
    }

    // List (unordered or ordered)
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/);
    if (listMatch) {
      const result = parseList(lines, i);
      tokens.push(result.token);
      i = result.nextIndex;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect contiguous non-blank, non-block lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(
        /^(#{1,6}\s|>|(`{3,}|~{3,})|(\*{3,}|-{3,}|_{3,})\s*$|\||\s*([-*+]|\d+\.)\s|\[\^)/,
      )
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  // Attach footnotes if any
  if (footnotes.size > 0) {
    tokens.push({ type: "footnotes", content: "", footnotes });
  }

  return tokens;
}

/**
 * Parse a list block starting at line index `start`.
 * Handles nested lists and task list items.
 */
function parseList(lines: string[], start: number): { token: BlockToken; nextIndex: number } {
  const firstMatch = lines[start].match(/^(\s*)([-*+]|\d+\.)\s(.*)$/);
  if (!firstMatch) {
    return { token: { type: "paragraph", content: lines[start] }, nextIndex: start + 1 };
  }

  const baseIndent = firstMatch[1].length;
  const ordered = /^\d+\./.test(firstMatch[2]);
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const itemMatch = line.match(/^(\s*)([-*+]|\d+\.)\s(.*)$/);

    if (!itemMatch) {
      // Blank line or non-list line — stop
      if (line.trim() === "") {
        // Check if next line continues the list
        if (i + 1 < lines.length && lines[i + 1].match(/^(\s*)([-*+]|\d+\.)\s/)) {
          i++;
          continue;
        }
      }
      break;
    }

    const indent = itemMatch[1].length;

    if (indent < baseIndent) break; // Dedented — parent scope

    if (indent > baseIndent) {
      // Nested list — recurse
      const nested = parseList(lines, i);
      if (items.length > 0) {
        items[items.length - 1].children = {
          items: nested.token.items!,
          ordered: nested.token.ordered!,
        };
      }
      i = nested.nextIndex;
      continue;
    }

    // Same level — new item
    let content = itemMatch[3];
    let checked: boolean | null = null;

    // Task list: - [ ] or - [x]
    const taskMatch = content.match(/^\[([ xX])\]\s(.*)/);
    if (taskMatch) {
      checked = taskMatch[1].toLowerCase() === "x";
      content = taskMatch[2];
    }

    items.push({ content, checked });
    i++;
  }

  return {
    token: { type: "list", content: "", items, ordered },
    nextIndex: i,
  };
}

// ─── Render ─────────────────────────────────────────────────────────

function renderListItems(items: ListItem[]): string {
  return items
    .map((item) => {
      let inner: string;

      if (item.checked !== null && item.checked !== undefined) {
        const attr = item.checked ? " checked disabled" : " disabled";
        inner = `<input type="checkbox"${attr}> ${parseInline(item.content)}`;
      } else {
        inner = parseInline(item.content);
      }

      if (item.children) {
        const tag = item.children.ordered ? "ol" : "ul";
        inner += `\n<${tag}>\n${renderListItems(item.children.items)}\n</${tag}>`;
      }

      return `<li>${inner}</li>`;
    })
    .join("\n");
}

function renderToken(token: BlockToken): string {
  switch (token.type) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `<${token.type}>${parseInline(token.content)}</${token.type}>`;

    case "paragraph":
      return `<p>${parseInline(token.content)}</p>`;

    case "code": {
      const langAttr = token.lang ? ` class="language-${escapeHtml(token.lang)}"` : "";
      return `<pre><code${langAttr}>${escapeHtml(token.content)}</code></pre>`;
    }

    case "markdown-pre":
      return `<pre class="language-markdown"><code>${escapeHtml(token.content)}</code></pre>`;

    case "blockquote": {
      // Recursively parse inner content
      const innerTokens = tokenize(token.content);
      const innerHtml = innerTokens.map(renderToken).join("\n");
      return `<blockquote>\n${innerHtml}\n</blockquote>`;
    }

    case "hr":
      return "<hr>";

    case "table": {
      const rows = token.rows!;
      const aligns = token.alignments!;

      const alignAttr = (i: number) => {
        const a = aligns[i];
        return a ? ` style="text-align:${a}"` : "";
      };

      const thead = `<thead>\n<tr>\n${rows[0]
        .map((cell, i) => `<th${alignAttr(i)}>${parseInline(cell)}</th>`)
        .join("\n")}\n</tr>\n</thead>`;

      const tbody =
        rows.length > 1
          ? `<tbody>\n${rows
              .slice(1)
              .map(
                (row) =>
                  `<tr>\n${row
                    .map((cell, i) => `<td${alignAttr(i)}>${parseInline(cell)}</td>`)
                    .join("\n")}\n</tr>`,
              )
              .join("\n")}\n</tbody>`
          : "";

      return `<table>\n${thead}\n${tbody}\n</table>`;
    }

    case "list": {
      const tag = token.ordered ? "ol" : "ul";
      return `<${tag}>\n${renderListItems(token.items!)}\n</${tag}>`;
    }

    case "footnotes": {
      const entries = [...token.footnotes!.entries()];
      const items = entries
        .map(
          ([id, text]) =>
            `<li id="fn-${escapeHtml(id)}">${parseInline(text)} <a href="#fnref-${escapeHtml(id)}">↩</a></li>`,
        )
        .join("\n");
      return `<section class="footnotes">\n<hr>\n<ol>\n${items}\n</ol>\n</section>`;
    }

    default:
      return `<p>${parseInline(token.content)}</p>`;
  }
}

/**
 * Built-in markdown parser.
 * Converts markdown to HTML string. Receives metadata for future
 * conditional rendering (not used by default).
 */
export const builtinParser: MarkdownParser = (
  markdown: string,
  _metadata: Record<string, unknown>,
): string => {
  const tokens = tokenize(markdown);
  const html = tokens.map(renderToken).join("\n");
  return sanitizeHtml(html);
};
