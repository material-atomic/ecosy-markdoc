import type { ConfigurationLike } from "./configuration";
import type { ContentContextLike } from "./content";
import type { DocumentationLike } from "./documentation";
import { Inject } from "./executor";
import type { FetchableLike } from "./fetchable";
import { Markdown, type MarkdownLike } from "./markdown";

// ─── Types ─────────────────────────────────────────────────────────

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

// ─── Pagable ───────────────────────────────────────────────────────

/**
 * Pagable — page lifecycle manager.
 *
 * Centralizes page creation, caching, loading, and error handling.
 * Dependencies resolved lazily via Inject default params.
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

  async resolve(path: string): Promise<PageOutcome> {
    let page = this.pages.get(path);

    if (!page) {
      const contentCtx: ContentContextLike = {
        fetchable: this.fetchable,
        revalidate: this.revalidate,
        contentUrl: this.documentation.getContentUrl({ path }),
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
