import type { ConfigurationLike } from "./configuration";
import type { ContentStatus } from "./content";
import type { DocumentationLike } from "./documentation";
import { Inject } from "./executor";
import type { FetchableLike } from "./fetchable";
import { Markdown, type MarkdownContextLike, type MarkdownLike } from "./markdown";
import { builtinParser } from "./parser";

// ─── Types ──────���──────────────────────────────────────────────────

export interface PageResult {
  /** Page loaded successfully. */
  ok: true;
  page: MarkdownLike;
}

export interface PageError {
  /** Page failed to load. */
  ok: false;
  error: unknown;
}

export type PageOutcome = PageResult | PageError;

export interface PagableLike {
  resolve(path: string): Promise<PageOutcome>;
  has(path: string): boolean;
  evict(path: string): boolean;
  clear(): void;
  readonly size: number;
}

// ─── Merged page ──────────────────────────────────────────────────

/**
 * MergedMarkdown — virtual page from merging `path.md` + `path/index.md`.
 *
 * Metadata is merged (index.md overrides), body from index.md.
 * Created when both files exist for the same route.
 */
class MergedMarkdown implements MarkdownLike {
  readonly contentUrl: string;
  readonly status: ContentStatus;
  readonly error: unknown;
  readonly metadata: Record<string, unknown>;
  readonly body: string;

  constructor(main: MarkdownLike, index: MarkdownLike) {
    this.contentUrl = index.contentUrl;
    this.status = index.status;
    this.error = index.error;
    // Merge metadata — index.md takes priority
    this.metadata = { ...main.metadata, ...index.metadata };
    this.body = index.body;
  }

  async load(): Promise<void> {
    // Already loaded — this is a snapshot
  }
}

// ─── Pagable ───────────────────────────────────────────────────────

/**
 * Pagable — page lifecycle manager.
 *
 * Centralizes page creation, caching, loading, and error handling.
 * Dependencies resolved lazily via Inject default params.
 *
 * **Metadata merge**: when resolving `path.md`, also checks for
 * `path/index.md`. If both exist, metadata is merged (index wins)
 * and body is taken from index.md. Both are fetched in parallel
 * so latency = max(main, index), not main + index.
 */
class PagableNode implements PagableLike {
  private readonly pages = new Map<string, MarkdownLike>();
  private readonly revalidate: number;

  constructor(
    private readonly fetchable = Inject<FetchableLike>("fetchable"),
    private readonly documentation = Inject<DocumentationLike>("documentation"),
    private readonly configuration = Inject<ConfigurationLike>("configuration"),
  ) {
    this.revalidate = this.configuration.options.revalidate || 0;
  }

  /**
   * Load a single page. Creates and caches the Markdown instance.
   */
  private async resolveOne(path: string): Promise<PageOutcome> {
    let page = this.pages.get(path);

    if (!page) {
      const contentCtx: MarkdownContextLike = {
        fetchable: this.fetchable,
        revalidate: this.revalidate,
        contentUrl: this.documentation.getContentUrl({ path }),
        parser: this.configuration.options.parser ?? builtinParser,
      };
      const MdClass = Markdown(contentCtx);
      page = new MdClass();
      this.pages.set(path, page);
    }

    await page.load();

    if (page.error) {
      return { ok: false, error: page.error };
    }

    return { ok: true, page };
  }

  async resolve(path: string): Promise<PageOutcome> {
    const normalizedPath = path.endsWith(".md") ? path : `${path}.md`;
    const pathBase = normalizedPath.replace(/\.md$/, "");

    // Skip merge for paths that are already index
    if (pathBase.endsWith("/index") || pathBase === "index") {
      return this.resolveOne(normalizedPath);
    }

    const indexPath = `${pathBase}/index.md`;

    // Fetch both in parallel — latency = max(main, index)
    const [mainOutcome, indexOutcome] = await Promise.all([
      this.resolveOne(normalizedPath),
      this.resolveOne(indexPath),
    ]);

    // Both exist → merge metadata (index wins), use index body
    if (mainOutcome.ok && indexOutcome.ok) {
      return {
        ok: true,
        page: new MergedMarkdown(mainOutcome.page, indexOutcome.page),
      };
    }

    // Only index exists → use index
    if (indexOutcome.ok) return indexOutcome;

    // Main only (or both failed) → use main
    return mainOutcome;
  }

  has(path: string): boolean {
    return this.pages.has(path);
  }

  evict(path: string): boolean {
    return this.pages.delete(path);
  }

  clear(): void {
    this.pages.clear();
  }

  get size(): number {
    return this.pages.size;
  }
}

export const Pagable = PagableNode;
