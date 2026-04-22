import { Injectable } from "../classable/injectable";
import type { ConfigurationLike } from "./configuration";
import { Executor, Inject } from "./executor";
import { MarkdocRequest } from "./request";
import { MarkdocResponse } from "./response";
import type { ManifestLike } from "./manifestable";
import type { PagableLike } from "./pagable";
import type { PluginableLikeLike } from "./plugin";
import { RequestContext } from "./request-context";
import { RequestLifecycle, type RequestLifecycleOptions } from "./request-lifecycle";
import { Router } from "./router";
import { Storable } from "./storable";

class ServerNode extends Injectable({
  store: { target: Storable(), get: () => [{}] },
  router: Router,
}) {
  private readonly lifecycle: RequestLifecycle;

  constructor(
    private readonly configuration = Inject<ConfigurationLike>("configuration"),
    private readonly manifest = Inject<ManifestLike>("manifest"),
    private readonly pagable = Inject<PagableLike>("pagable"),
    private readonly pluginable = Inject<PluginableLikeLike>("pluginable"),
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
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private async handleRequest(request: Request): Promise<Response> {
    const ctx = RequestContext.from(request);
    await this.manifest.preload();

    // Resolve plugins and build route table
    const plugins = this.pluginable.resolve(ctx, this.store);
    this.router.build(this.manifest, plugins);

    // Create controlled request/response
    const req = MarkdocRequest.from(request);
    const res = new MarkdocResponse();

    // Core handler — route matching + content/plugin delegation
    const handler = async (
      mdReq: MarkdocRequest,
      mdRes: MarkdocResponse,
    ): Promise<MarkdocResponse> => {
      const matched = this.router.match(mdReq.mdUrl);

      if (!matched) {
        return mdRes.status(404).html(
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
        return mdRes.status(500).html(
          `<html><body style="font-family:monospace;padding:2rem;background:#1a1a2e;color:#e94560">` +
          `<h1>500 — Content Error</h1>` +
          `<pre style="background:#16213e;padding:1rem;border-radius:8px;overflow-x:auto;color:#eee">${this.escapeHtml(String(outcome.error))}</pre>` +
          `</body></html>`,
        );
      }

      ctx.store.setState({
        path: route.path,
        url: this.manifest.getUrl(route.path),
        metadata: outcome.page.metadata,
        body: outcome.page.body,
      });

      return mdRes.html(outcome.page.body ?? "");
    };

    // Execute through lifecycle pipeline via Executor:
    // Guards → Pipes → Interceptors → execute(req, res, handler) → Filters
    const result = await Executor.lifecycle(
      this.lifecycle.Handler as any,
      [req, res, handler],
    );
    return ((result as MarkdocResponse) ?? res).toResponse();
  }
}

export const Server = ServerNode;
