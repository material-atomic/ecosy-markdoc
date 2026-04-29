import {
  Plugin,
  type PluginConstructor,
  type PluginRegistry,
  type StoreLike,
} from "../core/plugin";
import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";
import type { RequestContext } from "../core/request-context";
import type { ManifestLike } from "../core/manifestable";
import type { EngineLike } from "../core/engine";
import type { PagableLike } from "../core/pagable";
import type { DocumentationLike } from "../core/documentation";
import { Inject } from "../core/executor";

// ─── Types ───────────────────────────────────────────────────────────

export interface MarkdashOptions {
  /**
   * URL prefix for all Markdash routes. No leading/trailing slashes —
   * they are stripped and normalized internally.
   *
   * Final mounted URLs:
   * - `GET  /<prefix>`
   * - `POST /<prefix>/reload/manifest`
   * - `POST /<prefix>/reload/engine`
   * - `POST /<prefix>/clear/pages`
   *
   * When `enableSwitchSource` is `true`, three extra routes are also
   * registered:
   * - `POST /<prefix>/configure/documentation`
   * - `POST /<prefix>/reset/documentation`
   * - `GET  /<prefix>/inspect/documentation`
   *
   * @default "_markdash"
   */
  prefix?: string;

  /**
   * Enable the **Content source** dashboard card and the companion
   * `configure` / `reset` / `inspect` endpoints. When on, operators can
   * live-switch `Documentation.provider` + `interpolate` between the
   * default CDN (jsDelivr, ~24 h cache) and a zero-cache alternative
   * (`raw.githubusercontent.com`) from the browser. Each switch
   * automatically drops the page cache so the next request hits the
   * new source.
   *
   * Left `false` by default because the feature mutates runtime state
   * that would otherwise be constant for the life of the process. Turn
   * it on deliberately in environments where a trusted operator is
   * behind `Authen`.
   *
   * @default false
   */
  enableSwitchSource?: boolean;
}

// ─── Plugin factory ──────────────────────────────────────────────────

/**
 * Markdash plugin — a small dashboard that lets developers invalidate
 * Markdoc caches (manifest, engine components, page cache) from the
 * browser. Intended for local/dev use or staging environments where
 * content changes frequently and you want to force a refresh without
 * restarting the server.
 *
 * The plugin registers:
 *
 * - `GET /<prefix>` — HTML dashboard with one button per cache
 * - `POST /<prefix>/reload/manifest` — triggers `manifest.reload()`
 * - `POST /<prefix>/reload/engine` — triggers `engine.reload()`
 * - `POST /<prefix>/clear/pages` — triggers `pagable.clear()`
 *
 * Gate this plugin behind `Authen` in production so only authorized
 * developers can invalidate caches.
 *
 * @example
 * ```ts
 * import markdoc, { Markdash, Authen } from "@ecosy/markdoc";
 *
 * const app = markdoc({
 *   repo: "owner/repo",
 *   dir: "docs/content",
 *   plugins: [
 *     Authen({ verify, onUnauthorized: "/login", publicPaths: ["/login"] }),
 *     Markdash({ prefix: "_ops/dash" }), // reachable at /_ops/dash
 *   ],
 * });
 * ```
 */
export function Markdash(options: MarkdashOptions = {}): PluginConstructor {
  const rawPrefix = options.prefix ?? "_markdash";
  const prefix = rawPrefix.replace(/^\/+|\/+$/g, "");
  const enableSwitchSource = options.enableSwitchSource ?? false;

  const root = `/${prefix}`;
  const reloadManifestPath = `/${prefix}/reload/manifest`;
  const reloadEnginePath = `/${prefix}/reload/engine`;
  const clearPagesPath = `/${prefix}/clear/pages`;
  const configureDocPath = `/${prefix}/configure/documentation`;
  const resetDocPath = `/${prefix}/reset/documentation`;
  const inspectDocPath = `/${prefix}/inspect/documentation`;

  return class MarkdashPlugin extends Plugin {
    static readonly __global = true;

    constructor(
      ctx: RequestContext,
      store: StoreLike,
      private readonly manifest = Inject<ManifestLike>("manifest"),
      private readonly engine = Inject<EngineLike>("engine"),
      private readonly pagable = Inject<PagableLike>("pagable"),
      private readonly documentation = Inject<DocumentationLike>("documentation"),
    ) {
      super(ctx, store);
    }

    getRegistry(): PluginRegistry {
      const urls: Record<string, { summary: string; method: string; tags: string[] }> = {
        [root]: {
          summary: "Markdash dashboard",
          method: "GET",
          tags: ["markdash"],
        },
        [reloadManifestPath]: {
          summary: "Reload manifest cache",
          method: "POST",
          tags: ["markdash"],
        },
        [reloadEnginePath]: {
          summary: "Reload engine component cache",
          method: "POST",
          tags: ["markdash"],
        },
        [clearPagesPath]: {
          summary: "Clear page cache",
          method: "POST",
          tags: ["markdash"],
        },
      };

      if (enableSwitchSource) {
        urls[configureDocPath] = {
          summary: "Override Documentation provider / interpolate",
          method: "POST",
          tags: ["markdash"],
        };
        urls[resetDocPath] = {
          summary: "Reset Documentation to startup config",
          method: "POST",
          tags: ["markdash"],
        };
        urls[inspectDocPath] = {
          summary: "Read current provider / interpolate",
          method: "GET",
          tags: ["markdash"],
        };
      }

      return { urls };
    }

    async fetch(req: MarkdocRequest, res: MarkdocResponse): Promise<MarkdocResponse> {
      const pathname = req.pathname;
      const method = req.method;

      // Dashboard UI
      if (pathname === root && method === "GET") {
        return res
          .setHeader("Content-Type", "text/html; charset=utf-8")
          .html(renderDashboard(prefix, enableSwitchSource));
      }

      // Switch-source endpoints — only registered / reachable when opt-in.
      if (enableSwitchSource) {
        if (pathname === inspectDocPath && method === "GET") {
          return res.json({
            ok: true,
            provider: this.documentation.provider,
            interpolate: this.documentation.interpolate,
          });
        }
      }

      if (method === "POST") {
        try {
          if (pathname === reloadManifestPath) {
            await this.manifest.reload();
            return res.json({ ok: true, action: "reload-manifest" });
          }
          if (pathname === reloadEnginePath) {
            await this.engine.reload();
            return res.json({ ok: true, action: "reload-engine" });
          }
          if (pathname === clearPagesPath) {
            this.pagable.clear();
            return res.json({ ok: true, action: "clear-pages" });
          }
          if (enableSwitchSource && pathname === configureDocPath) {
            const body = (await req.json().catch(() => ({}))) as {
              provider?: string | null;
              interpolate?: string | null;
            };
            this.documentation.configure(body);
            // Drop cached pages — they were rendered against the previous
            // content URL shape and could still point at the old CDN.
            this.pagable.clear();
            return res.json({
              ok: true,
              action: "configure-documentation",
              provider: this.documentation.provider,
              interpolate: this.documentation.interpolate,
            });
          }
          if (enableSwitchSource && pathname === resetDocPath) {
            this.documentation.reset();
            this.pagable.clear();
            return res.json({
              ok: true,
              action: "reset-documentation",
              provider: this.documentation.provider,
              interpolate: this.documentation.interpolate,
            });
          }
        } catch (err) {
          return res.status(500).json({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return res.status(404).json({ ok: false, error: "not_found" });
    }
  };
}

// ─── Dashboard HTML ──────────────────────────────────────────────────

function renderDashboard(prefix: string, enableSwitchSource: boolean): string {
  const sourceCard = enableSwitchSource
    ? `
        <article class="card source-card">
          <h2>Content source</h2>
          <p>Flip between the default jsDelivr CDN (cached ~24 h) and a zero-cache alternative like <code>raw.githubusercontent.com</code> while iterating. Each switch automatically clears the page cache so the next request hits the new source.</p>
          <dl class="source-state" id="source-state">
            <dt>provider</dt>
            <dd id="source-provider">—</dd>
            <dt>interpolate</dt>
            <dd id="source-interpolate">—</dd>
          </dl>
          <div class="source-presets">
            <button data-preset="jsdelivr">jsDelivr</button>
            <button data-preset="raw-github">raw.githubusercontent</button>
            <button data-action="reset-documentation">Reset to startup config</button>
          </div>
          <div class="source-form">
            <label>provider (leave blank to keep current)</label>
            <input id="custom-provider" type="text" placeholder="https://cdn.example.com/gh" />
            <label>interpolate (leave blank to keep current)</label>
            <input id="custom-interpolate" type="text" placeholder="{provider}/{repo}{branch}{dir}{path}" />
            <button data-action="configure-documentation">Apply custom</button>
          </div>
        </article>`
    : "";

  // JS fragments emitted only when the switch-source feature is on.
  const switchSourceEndpoints = enableSwitchSource
    ? `"configure-documentation": BASE + "/configure/documentation",
      "reset-documentation": BASE + "/reset/documentation",`
    : "";
  const switchSourceScript = enableSwitchSource
    ? `
    const INSPECT_ENDPOINT = BASE + "/inspect/documentation";
    const PRESETS = {
      "jsdelivr": {
        provider: "https://cdn.jsdelivr.net/gh",
        interpolate: "{provider}/{repo}{branch}{dir}{path}",
      },
      "raw-github": {
        provider: "https://raw.githubusercontent.com",
        interpolate: "{provider}/{repo}/{branch}{dir}{path}",
      },
    };
    const providerField = document.getElementById("source-provider");
    const interpolateField = document.getElementById("source-interpolate");
    const customProvider = document.getElementById("custom-provider");
    const customInterpolate = document.getElementById("custom-interpolate");

    async function refreshSource() {
      try {
        const res = await fetch(INSPECT_ENDPOINT);
        if (!res.ok) return;
        const data = await res.json();
        if (!data || !data.ok) return;
        providerField.textContent = data.provider;
        interpolateField.textContent = data.interpolate;
      } catch { /* non-fatal */ }
    }

    document.querySelectorAll("button[data-preset]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const preset = PRESETS[btn.dataset.preset];
        if (!preset) return;
        btn.disabled = true;
        try { await runAction("configure-documentation", preset); }
        finally { btn.disabled = false; }
      });
    });

    refreshSource();`
    : `
    const customProvider = null;
    const customInterpolate = null;
    async function refreshSource() { /* disabled */ }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Markdash — Cache Dashboard</title>
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --surface-2: #334155;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --ok: #10b981;
      --err: #ef4444;
      --border: #334155;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2rem 1rem 4rem;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      line-height: 1.5;
    }
    .wrap {
      max-width: 840px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 2rem;
    }
    header h1 {
      margin: 0 0 0.25rem;
      font-size: 1.75rem;
      letter-spacing: -0.02em;
    }
    header p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .card h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    .card p {
      margin: 0;
      color: var(--text-muted);
      font-size: 0.8125rem;
      flex: 1;
    }
    button {
      appearance: none;
      background: var(--accent);
      color: #0b1220;
      border: 0;
      border-radius: 6px;
      padding: 0.5rem 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      align-self: flex-start;
      transition: background 120ms;
    }
    button:hover:not(:disabled) { background: var(--accent-hover); }
    button:disabled {
      opacity: 0.5;
      cursor: wait;
    }
    #status {
      margin-top: 1.5rem;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-family: ui-monospace, "JetBrains Mono", monospace;
      min-height: 2.5rem;
      background: var(--surface-2);
      color: var(--text-muted);
    }
    #status.ok { color: var(--ok); }
    #status.err { color: var(--err); }
    code {
      background: var(--surface-2);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.8125rem;
    }
    .source-card { grid-column: 1 / -1; }
    .source-presets { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .source-presets button { align-self: auto; }
    .source-state {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.35rem 0.75rem;
      font-size: 0.8125rem;
      font-family: ui-monospace, "JetBrains Mono", monospace;
      background: var(--surface-2);
      padding: 0.6rem 0.8rem;
      border-radius: 6px;
    }
    .source-state dt { color: var(--text-muted); white-space: nowrap; }
    .source-state dd { margin: 0; color: var(--text); word-break: break-all; }
    .source-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }
    .source-form label { font-size: 0.8125rem; color: var(--text-muted); }
    .source-form input {
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.45rem 0.6rem;
      font-size: 0.8125rem;
      font-family: ui-monospace, "JetBrains Mono", monospace;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Markdash</h1>
      <p>Cache dashboard — mounted at <code>/${prefix}</code></p>
    </header>
    <main>
      <div class="grid">
        <article class="card">
          <h2>Manifest</h2>
          <p>Re-fetch the manifest tree from the CDN. Applies new or removed pages and sub-manifests.</p>
          <button data-action="reload-manifest">Reload</button>
        </article>
        <article class="card">
          <h2>Engine components</h2>
          <p>Re-fetch all <code>_components/*</code> HTML files. Applies edits to shared component templates.</p>
          <button data-action="reload-engine">Reload</button>
        </article>
        <article class="card">
          <h2>Page cache</h2>
          <p>Drop every cached page. The next request for each page fetches fresh markdown from the CDN.</p>
          <button data-action="clear-pages">Clear</button>
        </article>${sourceCard}
      </div>
      <div id="status" role="status" aria-live="polite">Ready.</div>
    </main>
  </div>
  <script type="module">
    const BASE = "/${prefix}";
    const ENDPOINTS = {
      "reload-manifest": BASE + "/reload/manifest",
      "reload-engine": BASE + "/reload/engine",
      "clear-pages": BASE + "/clear/pages",
      ${switchSourceEndpoints}
    };

    const status = document.getElementById("status");

    function setStatus(cls, text) {
      status.className = cls || "";
      status.textContent = text;
    }

    async function postJson(endpoint, body) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    }

    async function runAction(action, body) {
      const endpoint = ENDPOINTS[action];
      if (!endpoint) return;
      setStatus("", "Running " + action + "…");
      const t0 = performance.now();
      try {
        const { res, data } = await postJson(endpoint, body);
        const elapsed = (performance.now() - t0).toFixed(0);
        if (res.ok && data.ok) {
          setStatus("ok", "✓ " + action + " completed in " + elapsed + "ms");
          await refreshSource();
          return true;
        }
        const err = data.error || res.statusText || ("HTTP " + res.status);
        setStatus("err", "✗ " + action + " failed: " + err);
      } catch (err) {
        setStatus("err", "✗ " + action + " network error: " + err.message);
      }
      return false;
    }
    ${switchSourceScript}

    // Plain action buttons
    document.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          if (btn.dataset.action === "configure-documentation") {
            const body = {};
            const p = customProvider ? customProvider.value.trim() : "";
            const i = customInterpolate ? customInterpolate.value.trim() : "";
            if (p) body.provider = p;
            if (i) body.interpolate = i;
            if (!p && !i) {
              setStatus("err", "✗ nothing to apply — both fields blank");
              return;
            }
            await runAction("configure-documentation", body);
          } else {
            await runAction(btn.dataset.action);
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  </script>
</body>
</html>`;
}
