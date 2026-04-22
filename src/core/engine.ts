import type { ConfigurationLike } from "./configuration";
import type { DocumentationLike } from "./documentation";
import { Inject } from "./executor";
import type { FetchableLike } from "./fetchable";
import { JSONQuery } from "../json/json-query";
import type { PluginLike, StoreLike } from "./plugin";

// ─── Types ──────────────────────────────────────────────────────────

export interface EngineLike {
  /**
   * Preload all components declared in `_components/_manifest.md`.
   * Fetches manifest → resolves children → fetches all component
   * HTML files in parallel. Call once at startup.
   */
  preload(): Promise<void>;

  /**
   * Merge inline components from plugin registries into the Engine.
   * Plugin components override file-based components of the same name.
   * Called after plugins are resolved.
   */
  mergePluginComponents(plugins: PluginLike[]): void;

  /**
   * Resolve all `<markdoc component="..." />` tags in the HTML string.
   * Uses preloaded component content, interpolated with store state
   * and tag attributes per route.
   */
  resolve(html: string, store: StoreLike): Promise<string>;
}

// ─── Regex ──────────────────────────────────────────────────────────

/** Matches `<markdoc ... />` (self-closing). */
const SELF_CLOSING = /<markdoc\s+([^>]*?)\/>/gi;

/** Matches `<markdoc ...>body</markdoc>` (with content). */
const WITH_BODY = /<markdoc\s+([^>]*?)>([\s\S]*?)<\/markdoc>/gi;

/** Parses key="value" or key='value' attribute pairs. */
const ATTR_PATTERN = /(\w[\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

// ─── Tag parsing ────────────────────────────────────────────────────

interface MarkdocTag {
  match: string;
  component: string;
  attrs: Record<string, string>;
  body?: string;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_PATTERN.lastIndex = 0;
  while ((m = ATTR_PATTERN.exec(raw)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? "true";
  }
  return attrs;
}

function parseTags(html: string): MarkdocTag[] {
  const tags: MarkdocTag[] = [];
  let m: RegExpExecArray | null;

  SELF_CLOSING.lastIndex = 0;
  while ((m = SELF_CLOSING.exec(html)) !== null) {
    const allAttrs = parseAttrs(m[1]);
    const { component, ...attrs } = allAttrs;
    if (component) tags.push({ match: m[0], component, attrs });
  }

  WITH_BODY.lastIndex = 0;
  while ((m = WITH_BODY.exec(html)) !== null) {
    const allAttrs = parseAttrs(m[1]);
    const { component, ...attrs } = allAttrs;
    if (component) tags.push({ match: m[0], component, attrs, body: m[2] });
  }

  return tags;
}

function interpolateVars(content: string, vars: Record<string, unknown>): string {
  return content.replace(
    /\{\{\s*([\w][\w.-]*)\s*\}\}/g,
    (match, expr) => {
      const value = JSONQuery.evaluate(vars, expr);
      return value !== undefined && value !== null ? String(value) : match;
    },
  );
}

// ─── Manifest parser ────────────────────────────────────────────────

/**
 * Parse `_manifest.md` frontmatter to extract children list.
 * Reuses the same YAML subset as page manifests.
 */
function parseManifestChildren(raw: string): string[] {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return [];

  const children: string[] = [];
  let inChildren = false;

  for (const line of fmMatch[1].split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "children:") {
      inChildren = true;
      continue;
    }
    if (inChildren) {
      const itemMatch = trimmed.match(/^-\s+(.+)$/);
      if (itemMatch) {
        children.push(itemMatch[1].trim());
      } else {
        break;
      }
    }
  }

  return children;
}

// ─── Engine ─────────────────────────────────────────────────────────

/** Max recursion depth for nested components. */
const MAX_DEPTH = 10;

/**
 * Engine — manages `<markdoc component="..." />` resolution.
 *
 * Lifecycle:
 * 1. `preload()` — fetches `_components/_manifest.md` from CDN,
 *    reads `children` list, fetches all component HTML files
 *    in parallel. Cached in memory.
 *
 * 2. `resolve(html, store)` — scans HTML for `<markdoc />` tags,
 *    replaces each with the preloaded component content interpolated
 *    with store state + tag attributes. Recurses for nested components.
 *
 * Components live in `_components/{name}.html` on the content CDN.
 * Only components declared in the manifest are loaded.
 *
 * @example
 * ```
 * _components/
 *   _manifest.md      ← children: [nav, sidebar, footer]
 *   nav.html
 *   sidebar.html
 *   footer.html
 * ```
 */
class EngineNode implements EngineLike {
  /** Preloaded component content keyed by name. */
  private readonly components = new Map<string, string>();
  private preloaded = false;

  constructor(
    private readonly fetchable = Inject<FetchableLike>("fetchable"),
    private readonly documentation = Inject<DocumentationLike>("documentation"),
    private readonly configuration = Inject<ConfigurationLike>("configuration"),
  ) {}

  async preload(): Promise<void> {
    if (this.preloaded) return;
    this.preloaded = true;

    // 1. Fetch manifest
    const manifestContent = await this.fetchFile("_components/_manifest.md");
    if (!manifestContent) return;

    // 2. Parse children
    const children = parseManifestChildren(manifestContent);
    if (children.length === 0) return;

    // 3. Fetch all component files in parallel
    const entries = await Promise.all(
      children.map(async (name) => {
        const content = await this.fetchFile(`_components/${name}.html`);
        return [name, content] as const;
      }),
    );

    for (const [name, content] of entries) {
      if (content != null) {
        this.components.set(name, content);
      }
    }
  }

  mergePluginComponents(plugins: PluginLike[]): void {
    for (const plugin of plugins) {
      const registry = plugin.getRegistry();
      if (!registry.components) continue;
      for (const [name, content] of Object.entries(registry.components)) {
        // Plugin components override file-based components
        this.components.set(name, content);
      }
    }
  }

  async resolve(html: string, store: StoreLike): Promise<string> {
    if (this.components.size === 0) return html;
    return this.resolveRecursive(html, store, 0);
  }

  private async resolveRecursive(
    html: string,
    store: StoreLike,
    depth: number,
  ): Promise<string> {
    if (depth >= MAX_DEPTH) return html;

    const tags = parseTags(html);
    if (tags.length === 0) return html;

    let result = html;

    for (const tag of tags) {
      const rendered = this.renderTag(tag, store);
      result = result.replace(tag.match, rendered);
    }

    return this.resolveRecursive(result, store, depth + 1);
  }

  private renderTag(tag: MarkdocTag, store: StoreLike): string {
    const content = this.components.get(tag.component);
    if (!content) return `<!-- component "${tag.component}" not found -->`;

    // Build vars: full store state (nested) + tag attributes + body
    // JSONQuery resolves dot-path expressions like {{ scope.title }}
    const storeState = store.getState() as Record<string, unknown>;
    const vars: Record<string, unknown> = { ...storeState };

    // Tag attributes override store values (flat keys)
    for (const [k, v] of Object.entries(tag.attrs)) {
      vars[k] = v;
    }
    if (tag.body != null) {
      vars.body = tag.body;
    }

    return interpolateVars(content, vars);
  }

  private async fetchFile(path: string): Promise<string | null> {
    const url = this.documentation.getContentUrl({ path });
    const result = await this.fetchable.http.get<string | null>(url);
    return result.success ? (result.data ?? null) : null;
  }
}

export const Engine = EngineNode;
