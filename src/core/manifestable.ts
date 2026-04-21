import { RuntimeAccessor } from "./common";
import { ConfigurationLike } from "./configuration";
import type { ContentContextLike } from "./content";
import { DocumentationLike } from "./documentation";
import { FetchableLike } from "./fetchable";
import { Markdown, type MarkdownLike } from "./markdown";

export interface ManifestLike {
  readonly ready: Promise<ManifestResult>;
  readonly root: ManifestResult | null;
  /** Check if a canonical path exists in the sitemap */
  hasPage(canonicalPath: string): boolean;
  /** Get public URL for a canonical path, or undefined */
  getUrl(canonicalPath: string): string | undefined;
}

// ─── Path classification ─────────────────────────────────────────────

const MANIFEST_PATTERN = /\/?_manifest(\.md)?$/;
const SLUG_PATTERN = /^[a-zA-Z0-9\-\/]+(\.md)?$/;

function isManifestPath(path: string): boolean {
  return MANIFEST_PATTERN.test(path);
}

function isPagePath(path: string): boolean {
  return SLUG_PATTERN.test(path) && !isManifestPath(path);
}

/** Normalize path to always end with .md */
function normalizePath(path: string): string {
  return path.endsWith(".md") ? path : `${path}.md`;
}

/** Convert canonical path to public URL: remove .md */
function pathToUrl(path: string): string {
  const normalized = normalizePath(path);
  return `/${normalized.replace(/\.md$/, "")}`;
}

// ─── Types ───────────────────────────────────────────────────────────

export interface ManifestPage {
  /** Canonical path (e.g. "blog/post-1.md") */
  path: string;
  /** Public URL (e.g. "/blog/post-1") */
  url: string;
}

export interface ManifestResult {
  /** Path of this _manifest.md */
  path: string;
  /** Parsed frontmatter metadata */
  metadata: Record<string, unknown>;
  /** Direct page children */
  pages: ManifestPage[];
  /** Nested child manifests */
  children: ManifestResult[];
}

// ─── ManifestNode ────────────────────────────────────────────────────

class ManifestNode {
  /**
   * Manifest MarkdownLike instances keyed by canonical path.
   * Only _manifest.md files live here — content pages do NOT.
   * Circular-safe: check before recursing.
   */
  static manifests = new Map<string, MarkdownLike>();

  /**
   * All discovered page URLs from manifest traversal.
   * Keyed by canonical path → public URL.
   * Manifest does NOT read page content — Server uses this
   * sitemap to know which paths are valid, and fetches content
   * on demand when a URL is actually requested.
   */
  static urls = new Map<string, string>();

  public root: ManifestResult | null = null;

  /**
   * Resolves when all _manifest.md files are loaded and
   * ManifestNode.urls is fully populated.
   * Server.fetch() awaits this before handling requests.
   */
  readonly ready: Promise<ManifestResult>;

  constructor(
    private readonly documentation: DocumentationLike,
    private readonly fetchable: FetchableLike,
    private readonly configuration: ConfigurationLike,
  ) {
    // Fire immediately — no await needed from caller.
    // Server.fetch() gates on `this.ready`.
    this.ready = this.resolveManifest("_manifest.md").then(result => {
      this.root = result;
      return result;
    });
  }

  hasPage(canonicalPath: string): boolean {
    return ManifestNode.urls.has(canonicalPath);
  }

  getUrl(canonicalPath: string): string | undefined {
    return ManifestNode.urls.get(canonicalPath);
  }

  private getOrCreateMarkdown(canonicalPath: string): MarkdownLike {
    let node = ManifestNode.manifests.get(canonicalPath);
    if (!node) {
      const context: ContentContextLike = {
        fetchable: this.fetchable,
        revalidate: this.configuration.options.revalidate || 0,
        contentUrl: this.documentation.getContentUrl({ path: canonicalPath }),
      };
      const MdClass = Markdown(context);
      node = new MdClass();
      ManifestNode.manifests.set(canonicalPath, node);
    }
    return node;
  }

  private async resolveManifest(manifestPath: string): Promise<ManifestResult> {
    const normalized = normalizePath(manifestPath);

    // Circular guard: if already in manifests map, it's being/been resolved
    if (ManifestNode.manifests.has(normalized)) {
      const existing = ManifestNode.manifests.get(normalized)!;
      return {
        path: normalized,
        metadata: existing.metadata,
        pages: [],
        children: [],
      };
    }

    const mdNode = this.getOrCreateMarkdown(normalized);
    await mdNode.load();

    const metadata = mdNode.metadata;
    const rawChildren = Array.isArray(metadata.children)
      ? (metadata.children as string[])
      : [];

    // Derive directory prefix
    // "blog/_manifest.md" → "blog/"
    const dir = normalized.replace(/\/?_manifest\.md$/, "");
    const prefix = dir ? `${dir}/` : "";

    const pages: ManifestPage[] = [];
    const childPromises: Promise<ManifestResult>[] = [];

    for (const child of rawChildren) {
      const childPath = child.startsWith("/") ? child.slice(1) : `${prefix}${child}`;

      if (isManifestPath(childPath)) {
        childPromises.push(this.resolveManifest(childPath));
      } else if (isPagePath(childPath)) {
        const normalizedChild = normalizePath(childPath);
        const url = pathToUrl(normalizedChild);
        pages.push({ path: normalizedChild, url });
        // Register in sitemap — Server reads from here
        ManifestNode.urls.set(normalizedChild, url);
      }
    }

    // §9.5: child manifests load in parallel
    const children = await Promise.all(childPromises);

    return {
      path: normalized,
      metadata,
      pages,
      children,
    };
  }

  /**
   * PRD §10.3: invalidate cache.
   * No argument → clear all. With path → clear specific.
   * PRD §10.4: destroys instance, not just data.
   */
  static invalidate(path?: string) {
    if (path) {
      const normalized = normalizePath(path);
      ManifestNode.manifests.delete(normalized);
      ManifestNode.urls.delete(normalized);
    } else {
      ManifestNode.manifests.clear();
      ManifestNode.urls.clear();
    }
  }
}

export const Manifest = {
  target: ManifestNode,
  get: (accessor: RuntimeAccessor) =>
    [
      accessor.get<DocumentationLike>("documentation"),
      accessor.get<FetchableLike>("fetchable"),
      accessor.get<ConfigurationLike>("configuration"),
    ] as const,
};
