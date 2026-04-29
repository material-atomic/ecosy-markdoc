import fm from "front-matter";
import { Router } from "./router";
import { Storable } from "./storable";
import { Injectable } from "@ecosy/classable/injectable";
import { sanitizeHtml } from "./parser";
import { MarkdocRequest } from "./request";
import { MarkdocResponse } from "./response";
import { Executor, Inject } from "./executor";
import { RequestLifecycle, type RequestLifecycleOptions } from "./request-lifecycle";
import { Layout, hasLoadPaths, interpolate, resolvePayload } from "../plugins/layout";
import { RequestContext, type HeadState, type BodyState, type ScopeState } from "./request-context";
import type { EngineLike } from "./engine";
import type { PagableLike } from "./pagable";
import type { ManifestLike } from "./manifestable";
import type { FetchableLike } from "./fetchable";
import type { ConfigurationLike } from "./configuration";
import type { DocumentationLike } from "./documentation";
import type { PluginLike, PluginableLikeLike } from "./plugin";

class ServerNode extends Injectable({
  store: { target: Storable(), get: () => [{}] },
  router: Router,
}) {
  private readonly lifecycle: RequestLifecycle;

  /**
   * Layout plugin instance — always present after `initLayout()`.
   * Built-in default with CSS, or user plugin override.
   */
  private layoutPlugin: PluginLike | null = null;
  private layoutInitialized = false;

  /**
   * Global metadata from `_metadata.md` — loaded once, used as fallback
   * for every page. Page-level metadata overrides these values.
   */
  private globalMetadata: Record<string, unknown> = {};
  private globalMetadataLoaded = false;

  constructor(
    private readonly configuration = Inject<ConfigurationLike>("configuration"),
    private readonly engine = Inject<EngineLike>("engine"),
    private readonly manifest = Inject<ManifestLike>("manifest"),
    private readonly pagable = Inject<PagableLike>("pagable"),
    private readonly pluginable = Inject<PluginableLikeLike>("pluginable"),
    private readonly fetchable = Inject<FetchableLike>("fetchable"),
    private readonly documentation = Inject<DocumentationLike>("documentation"),
  ) {
    super();
    this.lifecycle = new RequestLifecycle(
      this.configuration.options.lifecycle as RequestLifecycleOptions | undefined,
    );
  }

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.handleRequest(request);
    } catch (err) {
      const message = err instanceof Error ? err.stack || err.message : String(err);
      return new Response(
        `<html><body style="font-family:monospace;padding:2rem;background:#1a1a2e;color:#e94560">` +
          `<h1>500 — Internal Server Error</h1>` +
          `<pre style="background:#16213e;padding:1rem;border-radius:8px;overflow-x:auto;color:#eee">${this.escapeHtml(message)}</pre>` +
          `</body></html>`,
        { status: 500, headers: { "Content-Type": "text/html" } },
      );
    }
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /**
   * CDN fetch function — shared by layout initialization.
   * Fetches a file from the content directory via the documentation CDN.
   */
  private async fetchContent(path: string): Promise<string | null> {
    const url = this.documentation.getContentUrl({ path });
    const result = await this.fetchable.http.get<string | null>(url);
    return result.success ? (result.data ?? null) : null;
  }

  /**
   * Initialize the layout plugin.
   *
   * Resolution order (highest priority first):
   * 1. **User plugin** — if any plugin in `plugins[]` declares `template.root`
   *    and implements `getTemplate()`, it takes precedence as full override.
   * 2. **Built-in default Layout** — auto-created by server with default
   *    CSS template. Tries to load `_template.md` from CDN first.
   */
  private async initLayout(ctx: RequestContext, plugins: PluginLike[]): Promise<void> {
    if (this.layoutInitialized) return;
    this.layoutInitialized = true;

    // 1. Check user plugins for template.root override
    for (const plugin of plugins) {
      const registry = plugin.getRegistry();
      if (registry.template && "root" in registry.template && plugin.getTemplate) {
        this.layoutPlugin = plugin;

        if (hasLoadPaths(plugin)) {
          await plugin.loadPaths((path) => this.fetchContent(path));
        }
        return;
      }
    }

    // 2. Built-in default Layout — tries _template.md, falls back to DEFAULT_TEMPLATE with CSS
    const LayoutClass = Layout({ template: { root: true } });
    const instance = new LayoutClass(ctx, this.store);
    this.layoutPlugin = instance;

    if (hasLoadPaths(instance)) {
      await instance.loadPaths((path) => this.fetchContent(path));
    }
  }

  /**
   * Load `_metadata.md` from the content root.
   *
   * Parses frontmatter only — body content is ignored.
   * Cached after first load. Used as fallback metadata for every page:
   * global metadata → page metadata → index.md metadata (highest priority).
   */
  private async loadGlobalMetadata(): Promise<void> {
    if (this.globalMetadataLoaded) return;
    this.globalMetadataLoaded = true;

    const content = await this.fetchContent("_metadata.md");
    if (!content) return;

    try {
      const { attributes } = fm<Record<string, unknown>>(content);
      this.globalMetadata = attributes;
    } catch {
      // Invalid frontmatter — skip silently
    }
  }

  /**
   * Merge global metadata as fallback under page metadata.
   *
   * Priority (highest wins):
   * 1. Page-level frontmatter (from .md or merged index.md)
   * 2. Global `_metadata.md` frontmatter
   *
   * Nested `metadata` objects are deep-merged one level.
   */
  private mergeWithGlobalMetadata(pageMeta: Record<string, unknown>): Record<string, unknown> {
    if (Object.keys(this.globalMetadata).length === 0) return pageMeta;

    const merged = { ...this.globalMetadata, ...pageMeta };

    // Deep-merge the nested `metadata` object (one level)
    const globalInner = this.globalMetadata.metadata as Record<string, unknown> | undefined;
    const pageInner = pageMeta.metadata as Record<string, unknown> | undefined;

    if (globalInner || pageInner) {
      merged.metadata = { ...(globalInner ?? {}), ...(pageInner ?? {}) };
    }

    return merged;
  }

  /**
   * Build `<meta>` tags from page frontmatter.
   *
   * Auto-generates `<title>`, `description`, and Open Graph tags from
   * top-level `title`/`description`. Additional tags come from the
   * `metadata` key in frontmatter:
   *
   * ```yaml
   * metadata:
   *   og:image: ./images/cover.png
   *   author: Ken Nguyen
   *   robots: index, follow
   * ```
   *
   * Keys starting with `og:` use `property` attribute (Open Graph).
   * All others use `name` attribute.
   * Relative image URLs in `og:image` / `twitter:image` are resolved
   * to absolute CDN URLs.
   */
  private buildMetaTags(meta: Record<string, unknown>, pagePath: string): string {
    const tags: string[] = [];
    const title = String(meta.title ?? "");
    const description = String(meta.description ?? "");

    // Auto-generate from top-level title/description
    if (title) tags.push(`<title>${this.escapeHtml(title)}</title>`);
    if (description)
      tags.push(`<meta name="description" content="${this.escapeHtml(description)}">`);
    if (title) tags.push(`<meta property="og:title" content="${this.escapeHtml(title)}">`);
    if (description)
      tags.push(`<meta property="og:description" content="${this.escapeHtml(description)}">`);

    // Custom metadata from frontmatter `metadata` key
    const custom = meta.metadata as Record<string, unknown> | undefined;
    if (custom && typeof custom === "object") {
      for (const [key, rawValue] of Object.entries(custom)) {
        if (rawValue == null) continue;
        let value = String(rawValue);

        // Resolve relative image URLs for og:image, twitter:image
        if (
          (key === "og:image" || key === "twitter:image") &&
          !/^(https?:\/\/|\/\/|data:)/i.test(value)
        ) {
          value = this.resolveContentUrl(value, pagePath);
        }

        // og: and fb: → property, everything else → name
        const attr = key.startsWith("og:") || key.startsWith("fb:") ? "property" : "name";
        tags.push(`<meta ${attr}="${this.escapeHtml(key)}" content="${this.escapeHtml(value)}">`);
      }
    }

    return tags.join("\n");
  }

  /**
   * Resolve a relative path to an absolute CDN URL
   * based on the page's content directory.
   */
  private resolveContentUrl(relativePath: string, pagePath: string): string {
    const pageUrl = this.documentation.getContentUrl({ path: pagePath });
    const baseUrl = pageUrl.substring(0, pageUrl.lastIndexOf("/") + 1);
    try {
      return new URL(relativePath, baseUrl).href;
    } catch {
      return relativePath;
    }
  }

  /**
   * Render page body through the Layout plugin's root template.
   *
   * Builds the full `head`, `body`, `scope` store state, then
   * interpolates the template using `{{ path.key }}` expressions
   * resolved via JSONQuery.
   */
  private async renderLayout(
    ctx: RequestContext,
    rawBody: string,
    pageMeta: Record<string, unknown>,
    routePath: string,
  ): Promise<string> {
    // Merge global → page metadata
    const meta = this.mergeWithGlobalMetadata(pageMeta);

    const plugin = this.layoutPlugin!;
    const template = await plugin.getTemplate!("root");

    // Read frozen payload from static class
    const ctor = plugin.constructor as unknown as Record<string, unknown>;
    const layoutConfig = ctor.layout as { payload?: unknown } | undefined;
    const payload = resolvePayload(
      layoutConfig?.payload as Parameters<typeof resolvePayload>[0],
      this.store,
    );

    // Resolve images before sanitizing
    const resolvedBody = this.resolveImageUrls(rawBody, routePath);
    const sanitizedBody = sanitizeHtml(resolvedBody);

    // ── Build structured store state ────────────────────────

    const head: HeadState = {
      scripts: "",
      links: "",
      style: "",
      metadata: this.buildMetaTags(meta, routePath),
    };

    const body: BodyState = {
      main: sanitizedBody,
      scripts: "",
    };

    const scope: ScopeState = {
      path: routePath,
      url: this.manifest.getUrl(routePath),
      title: String(meta.title ?? ""),
      description: String(meta.description ?? ""),
      metadata: meta,
      pages: this.manifest.getUrls(),
      // Spread payload (user-defined layout vars)
      ...payload,
    };

    // Update store with full structured state
    ctx.store.setState({ head, body, scope });

    // ── Interpolate template ────────────────────────────────

    // Build flat + nested vars for interpolation:
    // Supports both {{ title }} (flat) and {{ head.style }} (nested)
    const vars: Record<string, unknown> = {
      head,
      body,
      scope,
      // Flat aliases for convenience — template can use {{ title }}
      // instead of {{ scope.title }}
      title: scope.title,
      description: scope.description,
    };

    const html = interpolate(template, vars);

    // Resolve <markdoc component="..." /> tags
    return this.engine.resolve(html, this.store);
  }

  /**
   * Rewrite relative image `src` attributes to absolute CDN URLs.
   *
   * When users store images alongside markdown in the same GitHub repo,
   * relative paths like `./images/diagram.png` or `../assets/logo.png`
   * need to resolve against the content CDN, not the served domain.
   *
   * Skips absolute URLs (http/https/data/protocol-relative).
   */
  private resolveImageUrls(html: string, pagePath: string): string {
    return html.replace(/<img\s([^>]*?)src="([^"]+)"([^>]*?)>/gi, (match, before, src, after) => {
      if (/^(https?:\/\/|\/\/|data:)/i.test(src)) return match;
      const resolved = this.resolveContentUrl(src, pagePath);
      return `<img ${before}src="${resolved}"${after}>`;
    });
  }

  private async handleRequest(request: Request): Promise<Response> {
    const ctx = RequestContext.from(request);
    await Promise.allSettled([
      this.manifest.preload(),
      this.engine.preload(),
      this.loadGlobalMetadata(),
    ]);

    // Resolve plugins and build route table.
    // Awaited so newly-instantiated plugins (global on first cache,
    // transient on every request) have their `start()` hook complete
    // before the request pipeline proceeds.
    const plugins = await this.pluginable.resolve(ctx, this.store);
    this.router.build(this.manifest, plugins);

    // Merge inline components from plugin registries into the Engine
    this.engine.mergePluginComponents(plugins);

    // Initialize layout — user plugin override → built-in config → fallback
    await this.initLayout(ctx, plugins);

    // Debug endpoints
    const url = new URL(request.url);

    // /_debug/path — show raw fetched content before parsing
    if (url.pathname.startsWith("/_debug/")) {
      const debugPath = url.pathname.replace("/_debug/", "");
      const outcome = await this.pagable.resolve(debugPath || "index");
      return new Response(
        JSON.stringify(
          {
            path: debugPath,
            outcome: outcome.ok
              ? {
                  ok: true,
                  metadata: outcome.page.metadata,
                  body: outcome.page.body,
                  contentUrl: outcome.page.contentUrl,
                }
              : { ok: false, error: String(outcome.error) },
          },
          null,
          2,
        ),
        {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }

    if (url.pathname === "/_routes") {
      const routes: Record<string, unknown>[] = [];
      for (const [path, entry] of this.router.routes) {
        routes.push({
          path,
          source: entry.source,
          canonicalPath: entry.path,
          plugin: entry.plugin?.id ?? null,
        });
      }
      return new Response(
        JSON.stringify(
          {
            routes,
            manifestUrls: this.manifest.getUrls(),
            manifestPaths: this.manifest.getManifests(),
            manifestCdn: this.manifest.extractManifestCdn(),
            manifestRoot: this.manifest.debugRoot(),
          },
          null,
          2,
        ),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create controlled request/response
    const req = MarkdocRequest.from(request);
    const res = new MarkdocResponse();

    // Pre-routing hooks — plugins can short-circuit the response before routing.
    // Used for cross-cutting concerns: auth, rate-limit, CORS preflight,
    // geo-blocking, maintenance mode. Invoked in plugin registration order;
    // the first plugin returning a non-null/undefined value halts the chain
    // and its response is returned directly.
    for (const plugin of plugins) {
      if (typeof plugin.beginRequest !== "function") continue;
      const earlyResponse = await plugin.beginRequest(req, res);
      if (earlyResponse) return earlyResponse;
    }

    // Core handler — route matching + content/plugin delegation
    const handler = async (
      mdReq: MarkdocRequest,
      mdRes: MarkdocResponse,
    ): Promise<MarkdocResponse> => {
      const matched = this.router.match(mdReq.mdUrl);

      if (!matched) {
        return mdRes
          .status(404)
          .html(
            `<html><body style="font-family:sans-serif;padding:2rem">` +
              `<h1>404 — Not Found</h1>` +
              `<p>No route matches <code>${this.escapeHtml(mdReq.pathname)}</code></p>` +
              `</body></html>`,
          );
      }

      const { entry: route, params } = matched;
      mdReq.mdUrl.params = params;

      // Plugin route — delegate to plugin.fetch
      if (route.source === "plugin" && route.plugin) {
        return route.plugin.fetch!(mdReq, mdRes);
      }

      // Manifest route — resolve page via Pagable
      const outcome = await this.pagable.resolve(route.path);

      if (!outcome.ok) {
        return mdRes
          .status(500)
          .html(
            `<html><body style="font-family:monospace;padding:2rem;background:#1a1a2e;color:#e94560">` +
              `<h1>500 — Content Error</h1>` +
              `<pre style="background:#16213e;padding:1rem;border-radius:8px;overflow-x:auto;color:#eee">${this.escapeHtml(String(outcome.error))}</pre>` +
              `</body></html>`,
          );
      }

      // Always render through Layout plugin (built-in or user override)
      const html = await this.renderLayout(
        ctx,
        outcome.page.body ?? "",
        outcome.page.metadata,
        route.path,
      );
      return mdRes.html(html);
    };

    // Execute through lifecycle pipeline via Executor:
    // Guards → Pipes → Interceptors → execute(req, res, handler) → Filters
    const result = await Executor.lifecycle(this.lifecycle.Handler, [req, res, handler]);
    let response = ((result as MarkdocResponse) ?? res).toResponse();

    // Post-response hooks — plugins can inject/modify headers, transform body,
    // add metrics, etc. Chain runs in registered order; each plugin receives
    // the previous output.
    for (const plugin of plugins) {
      if (typeof plugin.endRequest !== "function") continue;
      response = await plugin.endRequest(req, res, response);
    }

    return response;
  }
}

export type { ServerNode };

export const Server = ServerNode;
