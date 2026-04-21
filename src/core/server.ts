import { RuntimeAccessor } from "./common";
import { ConfigurationLike } from "./configuration";
import type { ContentContextLike } from "./content";
import { DocumentationLike } from "./documentation";
import { FetchableLike } from "./fetchable";
import { ManifestLike } from "./manifestable";
import { Markdown, type MarkdownLike } from "./markdown";

class ServerNode {
  private pages = new Map<string, MarkdownLike>();

  constructor(
    private readonly manifest: ManifestLike,
    private readonly documentation: DocumentationLike,
    private readonly fetchable: FetchableLike,
    private readonly configuration: ConfigurationLike,
  ) {}

  async fetch(request: Request): Promise<Response> {
    await this.manifest.ready;

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/^\//, "");

    const canonicalPath = pathname.endsWith(".md")
      ? pathname
      : `${pathname}.md`;

    if (!this.manifest.hasPage(canonicalPath)) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    let page = this.pages.get(canonicalPath);
    if (!page) {
      const context: ContentContextLike = {
        fetchable: this.fetchable,
        revalidate: this.configuration.options.revalidate || 0,
        contentUrl: this.documentation.getContentUrl({ path: canonicalPath }),
      };
      const MdClass = Markdown(context);
      page = new MdClass();
      this.pages.set(canonicalPath, page);
    }

    await page.load();

    if (page.error) {
      return new Response(JSON.stringify({ error: String(page.error) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      path: canonicalPath,
      url: this.manifest.getUrl(canonicalPath),
      metadata: page.metadata,
      body: page.body,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Server = {
  target: ServerNode,
  get: (accessor: RuntimeAccessor) =>
    [
      accessor.get<ManifestLike>("manifest"),
      accessor.get<DocumentationLike>("documentation"),
      accessor.get<FetchableLike>("fetchable"),
      accessor.get<ConfigurationLike>("configuration"),
    ] as const,
};
