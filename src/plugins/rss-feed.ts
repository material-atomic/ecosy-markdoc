import { Plugin, type PluginConstructor, type PluginRegistry } from "../core/plugin";
import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";

// ─── Types ───────────────────────────────────────────────────────────

export interface FeedItem {
  /** Item title (required). */
  title: string;
  /** Absolute URL to the item's permanent page (required). */
  link: string;
  /** Plain-text or short HTML summary. Wrapped in CDATA on output. */
  description?: string;
  /** Full HTML content. RSS outputs as `<content:encoded>`, Atom as `<content>`. */
  content?: string;
  /** Publish date. `Date`, ISO string, or RFC 822 string — plugin normalizes. */
  pubDate?: Date | string;
  /** Author (name or email). */
  author?: string;
  /** Tags / categories. */
  categories?: string[];
  /** Unique identifier. Defaults to `link` if omitted. */
  guid?: string;
}

export interface FeedImage {
  url: string;
  title?: string;
  link?: string;
}

export type FeedItemsSource =
  | FeedItem[]
  | ((req: MarkdocRequest) => FeedItem[] | Promise<FeedItem[]>);

export interface RSSFeedOptions {
  /**
   * URL path the feed is served at.
   * @default "/feed.xml"
   */
  path?: string;

  /**
   * Feed format.
   * @default "rss"
   */
  format?: "rss" | "atom";

  /** Channel title (required). */
  title: string;
  /** Channel description / subtitle (required). */
  description: string;
  /** Site URL the feed represents (required, absolute). */
  link: string;
  /** Self-reference URL for the feed. Defaults to `<link><path>`. */
  feedLink?: string;

  /**
   * ISO 639-1 language code.
   * @default "en"
   */
  language?: string;

  /** Optional copyright notice. */
  copyright?: string;

  /** Optional channel image. */
  image?: FeedImage;

  /**
   * Feed items. Either a static array (frozen at plugin creation) or a
   * factory called on each request (dynamic).
   */
  items: FeedItemsSource;

  /**
   * Cap on number of items rendered. Applied after the source returns.
   * @default 20
   */
  maxItems?: number;
}

// ─── Plugin factory ──────────────────────────────────────────────────

/**
 * RSSFeed plugin — registers a feed endpoint that renders RSS 2.0 or Atom 1.0.
 *
 * The plugin provides the feed envelope (channel metadata, date formatting,
 * XML escaping). You provide the items via `options.items`, either static
 * or as a factory that resolves per request.
 *
 * @example RSS from static items
 * ```ts
 * RSSFeed({
 *   title: "My Blog",
 *   description: "Latest posts",
 *   link: "https://myblog.com",
 *   items: [
 *     {
 *       title: "Hello",
 *       link: "https://myblog.com/hello",
 *       description: "First post",
 *       pubDate: new Date("2026-04-24"),
 *     },
 *   ],
 * })
 * ```
 *
 * @example Atom feed with dynamic items (from manifest or DB)
 * ```ts
 * RSSFeed({
 *   format: "atom",
 *   path: "/atom.xml",
 *   title: "Ecosy Journey",
 *   description: "Build journey of the Ecosy framework",
 *   link: "https://ecosy.dev",
 *   items: async (req) => {
 *     const posts = await fetchPostsFromDB();
 *     return posts.map((p) => ({
 *       title: p.title,
 *       link: `${req.mdUrl.origin}/posts/${p.slug}`,
 *       description: p.excerpt,
 *       content: p.html,
 *       pubDate: p.createdAt,
 *       author: p.author,
 *       categories: p.tags,
 *     }));
 *   },
 * })
 * ```
 */
export function RSSFeed(options: RSSFeedOptions): PluginConstructor {
  const path = options.path ?? "/feed.xml";
  const format = options.format ?? "rss";
  const language = options.language ?? "en";
  const maxItems = options.maxItems ?? 20;
  const feedLink = options.feedLink ?? `${options.link.replace(/\/$/, "")}${path}`;

  return class RSSFeedPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        urls: {
          [path]: {
            method: "GET",
            summary: `${format.toUpperCase()} feed`,
            tags: ["feed"],
          },
        },
      };
    }

    async fetch(req: MarkdocRequest, res: MarkdocResponse) {
      const resolvedItems =
        typeof options.items === "function" ? await options.items(req) : options.items;
      const items = resolvedItems.slice(0, maxItems);

      const xml =
        format === "atom"
          ? renderAtom(options, items, feedLink, language)
          : renderRss(options, items, feedLink, language);

      return res
        .status(200)
        .setHeader(
          "Content-Type",
          format === "atom"
            ? "application/atom+xml; charset=utf-8"
            : "application/rss+xml; charset=utf-8",
        )
        .xml(xml);
    }
  };
}

// ─── Renderers ───────────────────────────────────────────────────────

function renderRss(
  opts: RSSFeedOptions,
  items: FeedItem[],
  feedLink: string,
  language: string,
): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
  );
  parts.push("<channel>");
  parts.push(`<title>${esc(opts.title)}</title>`);
  parts.push(`<link>${esc(opts.link)}</link>`);
  parts.push(`<description>${esc(opts.description)}</description>`);
  parts.push(`<language>${esc(language)}</language>`);
  parts.push(`<atom:link href="${esc(feedLink)}" rel="self" type="application/rss+xml" />`);
  if (opts.copyright) parts.push(`<copyright>${esc(opts.copyright)}</copyright>`);
  if (opts.image) {
    parts.push("<image>");
    parts.push(`<url>${esc(opts.image.url)}</url>`);
    parts.push(`<title>${esc(opts.image.title ?? opts.title)}</title>`);
    parts.push(`<link>${esc(opts.image.link ?? opts.link)}</link>`);
    parts.push("</image>");
  }
  parts.push(`<lastBuildDate>${toRfc822(new Date())}</lastBuildDate>`);

  for (const item of items) {
    parts.push("<item>");
    parts.push(`<title>${esc(item.title)}</title>`);
    parts.push(`<link>${esc(item.link)}</link>`);
    parts.push(
      `<guid isPermaLink="${item.guid ? "false" : "true"}">${esc(item.guid ?? item.link)}</guid>`,
    );
    if (item.description) parts.push(`<description>${cdata(item.description)}</description>`);
    if (item.content) parts.push(`<content:encoded>${cdata(item.content)}</content:encoded>`);
    if (item.pubDate) parts.push(`<pubDate>${toRfc822(toDate(item.pubDate))}</pubDate>`);
    if (item.author) parts.push(`<author>${esc(item.author)}</author>`);
    for (const cat of item.categories ?? []) parts.push(`<category>${esc(cat)}</category>`);
    parts.push("</item>");
  }

  parts.push("</channel>");
  parts.push("</rss>");
  return parts.join("");
}

function renderAtom(
  opts: RSSFeedOptions,
  items: FeedItem[],
  feedLink: string,
  language: string,
): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(`<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${esc(language)}">`);
  parts.push(`<title>${esc(opts.title)}</title>`);
  parts.push(`<subtitle>${esc(opts.description)}</subtitle>`);
  parts.push(`<link href="${esc(opts.link)}" />`);
  parts.push(`<link rel="self" href="${esc(feedLink)}" type="application/atom+xml" />`);
  parts.push(`<id>${esc(feedLink)}</id>`);
  parts.push(`<updated>${toIso(new Date())}</updated>`);
  if (opts.copyright) parts.push(`<rights>${esc(opts.copyright)}</rights>`);

  for (const item of items) {
    parts.push("<entry>");
    parts.push(`<title>${esc(item.title)}</title>`);
    parts.push(`<link href="${esc(item.link)}" />`);
    parts.push(`<id>${esc(item.guid ?? item.link)}</id>`);
    parts.push(`<updated>${toIso(toDate(item.pubDate ?? new Date()))}</updated>`);
    if (item.pubDate) parts.push(`<published>${toIso(toDate(item.pubDate))}</published>`);
    if (item.author) {
      parts.push("<author>");
      parts.push(`<name>${esc(item.author)}</name>`);
      parts.push("</author>");
    }
    if (item.description) {
      parts.push(`<summary type="html">${cdata(item.description)}</summary>`);
    }
    if (item.content) {
      parts.push(`<content type="html">${cdata(item.content)}</content>`);
    }
    for (const cat of item.categories ?? []) {
      parts.push(`<category term="${esc(cat)}" />`);
    }
    parts.push("</entry>");
  }

  parts.push("</feed>");
  return parts.join("");
}

// ─── Helpers ─────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(str: string): string {
  // Prevent accidental CDATA closing: split any `]]>` into `]]]]><![CDATA[>`
  return `<![CDATA[${str.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function toDate(input: Date | string): Date {
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toRfc822(d: Date): string {
  // RFC 822 required by RSS 2.0: "Wed, 02 Oct 2002 13:00:00 GMT"
  return d.toUTCString();
}

function toIso(d: Date): string {
  // ISO 8601 required by Atom 1.0
  return d.toISOString();
}
