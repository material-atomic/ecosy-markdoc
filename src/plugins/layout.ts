import type { LiteralObject } from "@ecosy/core";
import { JSONQuery } from "../json/json-query";
import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";
import { Plugin, type PluginRegistry, type PluginRouteSchema, type StoreLike } from "../core/plugin";

// ─── Types ──────────────────────────────────────────────────────────

export type LayoutPayloadFn = (store: StoreLike) => LiteralObject;
export type LayoutUrls = Record<string, PluginRouteSchema>;
export type LayoutTemplate = Record<string, boolean>;

/**
 * Custom parser function for path-based templates.
 * Receives the raw file content fetched from CDN and returns
 * the processed template HTML string.
 */
export type LayoutPathParser = (content: string) => string | Promise<string>;

/**
 * Inline template factory.
 * Receives the store and returns the template HTML string.
 * Allows defining templates dynamically without subclassing
 * or loading from CDN files.
 */
export type LayoutTemplateFn = (store: StoreLike) => string | Promise<string>;

/**
 * Path-based template source.
 * Describes a CDN file to fetch and how to parse it.
 */
export interface LayoutPathEntry {
  /**
   * File path relative to the content root on CDN.
   *
   * @example "_template.html"
   * @example "_layout.md"
   */
  name: string;

  /**
   * How to process the fetched file content.
   *
   * - **string** — references a template name. The fetched content
   *   is stored and returned by `getTemplate(name)`.
   *   E.g. `"root"` means the file becomes the root layout template.
   *
   * - **function** — custom parser that receives the raw file content
   *   and returns the processed template HTML.
   *
   * @example "root"
   * @example (content) => marked.parse(content)
   */
  parser: string | LayoutPathParser;
}

/** Default path — used when `path` is not specified in config. */
const DEFAULT_PATH: LayoutPathEntry = Object.freeze({
  name: "_template.md",
  parser: "root",
});

export interface LayoutConfig {
  /**
   * Static assets served by this layout plugin.
   * Keys are URL paths, values are route schema metadata.
   *
   * @example
   * urls: {
   *   "assets/css/style.css": {},
   *   "assets/js/script.js": {},
   * }
   */
  urls?: LayoutUrls;

  /**
   * Named templates. Keys are template names.
   * `root: true` marks this plugin as the root layout provider.
   *
   * @example
   * template: { root: true }
   */
  template?: LayoutTemplate;

  /**
   * File-based template source loaded from CDN.
   *
   * - `name` — file path relative to content root.
   * - `parser` — string (template name to store as) or function (custom transform).
   *
   * Defaults to `{ name: "_template.md", parser: "root" }` when omitted.
   *
   * @example
   * path: { name: "_template.html", parser: "root" }
   * path: { name: "_layout.md", parser: (md) => marked.parse(md) }
   */
  path?: LayoutPathEntry;

  /**
   * Inline template — a plain string, a function receiving the store,
   * or a tagged template literal via `html`.
   *
   * Takes precedence over `path` and the default file.
   *
   * @example
   * // Plain string — no store access, just {{ key }} placeholders
   * getTemplate: `<html><body>{{ body }}</body></html>`
   *
   * // Function — receives store for dynamic content
   * getTemplate: (store) => `<html><body>{{ body }}</body></html>`
   *
   * // Tagged template — mix ${store => ...} with {{ key }}
   * getTemplate: html`<html><nav>${store => ...}</nav>{{ body }}</html>`
   */
  getTemplate?: string | LayoutTemplateFn;

  /**
   * Static payload or a factory function receiving the store.
   * Values are interpolated into `{{ key }}` template placeholders.
   *
   * @example
   * payload: { siteName: "My Docs", year: 2025 }
   * payload: (store) => ({ siteName: "My Docs", nav: store.getState().pages })
   */
  payload?: LiteralObject | LayoutPayloadFn;
}

// ─── Layout Plugin classable ────────────────────────────────────────

/**
 * Layout — template-based page wrapper as a Plugin.
 *
 * Factory function that receives `LayoutConfig`, freezes it on the
 * returned class's static. Three ways to provide templates:
 *
 * 1. **`getTemplate`** config — inline function `(store) => string`.
 *    Highest priority, no file loading needed.
 *
 * 2. **`path`** config — load from CDN file, optionally transformed
 *    by a custom parser. Defaults to `_template.md` with `"root"` parser.
 *
 * 3. **Override `getTemplate()` method** — subclass and hardcode.
 *
 * @example
 * ```ts
 * // Minimal — loads _template.md from CDN automatically
 * Layout({ template: { root: true } })
 *
 * // Inline template with store access
 * Layout({
 *   template: { root: true },
 *   getTemplate: (store) => `<html>
 *     <body>{{ body }}</body>
 *   </html>`,
 * })
 *
 * // Custom file path
 * Layout({
 *   template: { root: true },
 *   path: { name: "_layout.html", parser: "root" },
 * })
 *
 * // Custom file + custom parser
 * Layout({
 *   template: { root: true },
 *   path: { name: "_layout.md", parser: (md) => marked.parse(md) },
 * })
 * ```
 */
export function Layout(config: LayoutConfig) {
  const frozen: Readonly<LayoutConfig> = Object.freeze({
    ...config,
    urls: config.urls ? Object.freeze({ ...config.urls }) : undefined,
    template: config.template ? Object.freeze({ ...config.template }) : undefined,
    path: config.path ? Object.freeze({ ...config.path }) : undefined,
  });

  /** Resolved path — explicit config or default _template.md */
  const resolvedPath: Readonly<LayoutPathEntry> = frozen.path ?? DEFAULT_PATH;

  return class LayoutPlugin extends Plugin {
    /** Frozen layout configuration — immutable after class creation. */
    static readonly layout: Readonly<LayoutConfig> = frozen;

    /** Brand for server to detect layout plugins. */
    static readonly __layout = true as const;

    /**
     * Internal template cache.
     * Populated by `loadPaths()` for file-based templates,
     * or by `getTemplate` config function.
     */
    private _templates = new Map<string, string>();
    private _pathsLoaded = false;

    getRegistry(): PluginRegistry {
      const urls: Record<string, PluginRouteSchema> = {};
      if (frozen.urls) {
        for (const [path, schema] of Object.entries(frozen.urls)) {
          const normalized = path.startsWith("/") ? path : `/${path}`;
          urls[normalized] = { method: "GET", ...schema };
        }
      }

      const template: Record<string, string> = {};
      if (frozen.template) {
        for (const [name, enabled] of Object.entries(frozen.template)) {
          if (enabled) template[name] = name;
        }
      }

      return { urls, template };
    }

    /**
     * Return template HTML for the given name.
     *
     * Resolution order:
     * 1. Config `getTemplate` — string literal or function(store).
     * 2. Internal cache (populated by `loadPaths()`).
     * 3. Built-in fallback template.
     */
    getTemplate(name: string): string | Promise<string> {
      // 1. Config inline template — highest priority
      if (frozen.getTemplate != null) {
        if (typeof frozen.getTemplate === "string") return frozen.getTemplate;
        return frozen.getTemplate(this.store);
      }

      // 2. Cached from file-based loading
      const cached = this._templates.get(name);
      if (cached) return cached;

      // 3. Fallback
      return DEFAULT_TEMPLATE;
    }

    /**
     * Load file-based template from CDN.
     * Uses `resolvedPath` (explicit config or default `_template.md`).
     * Skipped when config `getTemplate` is provided (string or function).
     */
    async loadPaths(fetchFn: (path: string) => Promise<string | null>): Promise<void> {
      // Skip if inline template is configured
      if (frozen.getTemplate != null) return;
      if (this._pathsLoaded) return;
      this._pathsLoaded = true;

      const content = await fetchFn(resolvedPath.name);
      if (!content) return;

      if (typeof resolvedPath.parser === "string") {
        this._templates.set(resolvedPath.parser, content);
      } else {
        const result = await resolvedPath.parser(content);
        this._templates.set("root", result);
      }
    }

    /**
     * Serve static assets registered in `urls`.
     */
    async fetch(req: MarkdocRequest, res: MarkdocResponse): Promise<MarkdocResponse> {
      const contentType = resolveContentType(req.pathname);
      return res.setHeader("content-type", contentType).text("");
    }
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Check if a plugin instance has layout template capability.
 */
export function hasTemplate(plugin: {
  getRegistry(): PluginRegistry;
  getTemplate?: (name: string) => string | Promise<string>;
}): plugin is typeof plugin & {
  getTemplate(name: string): string | Promise<string>;
} {
  const registry = plugin.getRegistry();
  return !!registry.template && "root" in registry.template && typeof plugin.getTemplate === "function";
}

/**
 * Check if a plugin instance supports path-based template loading.
 */
export function hasLoadPaths(plugin: unknown): plugin is {
  loadPaths(fetchFn: (path: string) => Promise<string | null>): Promise<void>;
} {
  return typeof (plugin as Record<string, unknown>).loadPaths === "function";
}

/**
 * Resolve payload from config — static object or dynamic function.
 */
export function resolvePayload(
  payload: LiteralObject | LayoutPayloadFn | undefined,
  store: StoreLike,
): LiteralObject {
  if (!payload) return {};
  if (typeof payload === "function") return payload(store);
  return payload;
}

/**
 * Interpolate `{{ expr }}` placeholders in template string.
 *
 * Supports both flat keys (`{{ title }}`) and dot-path expressions
 * (`{{ head.style }}`, `{{ scope.title }}`). Expressions are resolved
 * via `JSONQuery.evaluate` which auto-wraps to `$.expr`.
 *
 * Unmatched placeholders are left as-is (useful for debugging).
 */
export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(
    /\{\{\s*([\w][\w.-]*)\s*\}\}/g,
    (match, expr) => {
      const value = JSONQuery.evaluate(vars, expr);
      return value !== undefined && value !== null ? String(value) : match;
    },
  );
}

/** Content-Type map for common static assets. */
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
};

function resolveContentType(path: string): string {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ─── Tagged Template Literal ────────────────────────────────────────

/**
 * Tagged template literal for Layout templates.
 * Allows embedding store-reactive expressions directly in the template
 * using `${store => store.getState().someValue}` syntax.
 *
 * Static parts use `{{ key }}` for payload/metadata interpolation.
 * Dynamic parts use `${...}` for store-reactive values.
 *
 * Returns a `LayoutTemplateFn` that the plugin calls with the store
 * to resolve all dynamic expressions at render time.
 *
 * @example
 * ```ts
 * import { Layout, html } from "@ecosy/markdoc";
 *
 * Layout({
 *   template: { root: true },
 *   getTemplate: html`
 *     <!DOCTYPE html>
 *     <html>
 *     <head><title>{{ title }}</title></head>
 *     <body>
 *       <nav>${store => {
 *         const pages = store.getState().pages ?? [];
 *         return pages.map(([p, u]) => `<a href="${u}">${p}</a>`).join("");
 *       }}</nav>
 *       <main>{{ body }}</main>
 *     </body>
 *     </html>
 *   `,
 * })
 * ```
 */
export function html(
  strings: TemplateStringsArray,
  ...expressions: Array<string | number | ((store: StoreLike) => unknown)>
): LayoutTemplateFn {
  return (store: StoreLike): string => {
    let result = strings[0];
    for (let i = 0; i < expressions.length; i++) {
      const expr = expressions[i];
      const value = typeof expr === "function" ? expr(store) : expr;
      result += String(value ?? "") + strings[i + 1];
    }
    return result;
  };
}

/** Fallback template when no file or config template is provided. */
const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ scope.title }}</title>
{{ head.metadata }}
{{ head.links }}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
{{ head.scripts }}
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    line-height: 1.7;
    color: #1a1a2e;
    background: #fafafa;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .container {
    max-width: 48rem;
    margin: 0 auto;
    padding: 3rem 1.5rem 5rem;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  @media (max-width: 640px) {
    .container { padding: 1.5rem 1rem 3rem; }
  }
  h1, h2, h3, h4, h5, h6 {
    margin-top: 1.8em;
    margin-bottom: 0.6em;
    font-weight: 600;
    line-height: 1.3;
    color: #0f0f23;
  }
  h1 { font-size: 2rem; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4em; }
  h2 { font-size: 1.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
  h3 { font-size: 1.25rem; }
  p { margin: 0.8em 0; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code {
    font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;
    font-size: 0.875em;
    background: #f1f5f9;
    padding: 0.15em 0.4em;
    border-radius: 4px;
    color: #d63384;
  }
  pre {
    margin: 1em 0;
    padding: 1rem;
    background: #1e293b;
    color: #e2e8f0;
    border-radius: 8px;
    overflow-x: auto;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; color: inherit; font-size: 0.85rem; }
  blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid #3b82f6;
    background: #eff6ff;
    color: #1e40af;
  }
  blockquote p { margin: 0.3em 0; }
  hr { margin: 2em 0; border: none; border-top: 1px solid #e2e8f0; }
  ul, ol { margin: 0.8em 0; padding-left: 1.8em; }
  li { margin: 0.3em 0; }
  table { width: 100%; margin: 1em 0; border-collapse: collapse; }
  th, td { padding: 0.6em 0.8em; border: 1px solid #e2e8f0; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
</style>
{{ head.style }}
</head>
<body>
<main class="container">
{{ body.main }}
</main>
{{ body.scripts }}
</body>
</html>`;
