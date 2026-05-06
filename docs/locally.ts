/**
 * Locally — dev-time content mirror for @ecosy/markdoc.
 *
 * The full API you care about is `withLocally(config)` — a wrapper that
 * accepts the normal `MarkdocConfigurations` and augments it with:
 *
 *   1. `provider: "http://127.0.0.1:<port>/gh"` — points the runtime's URL
 *      builder at a local server instead of jsDelivr.
 *   2. `plugins: [Locally({ port })]` — the global plugin that boots that
 *      local server and serves files from the working copy, mirroring
 *      jsDelivr's `/gh/<owner>/<repo>@<branch>/<path>` shape. Boot fires
 *      eagerly from `getPlugins()` so the port is bound before
 *      `manifest.preload()` runs on the first request.
 *
 * The wrapper is **no-op on production and on edge runtimes** (Cloudflare
 * Workers, Deno Deploy, Vercel Edge). Two layers enforce that:
 *
 *   - Detection via `new Function` — bundlers can't fold the
 *     `isEdge()`/`isDev()` branches at build time.
 *   - Node-only APIs (`node:http`, `node:fs/promises`, `node:path`,
 *     `node:url`) are **not** imported at module scope. They're loaded
 *     lazily inside `Locally` via an opaque `new Function("id", "return
 *     import(id)")` so bundlers targeting edge runtimes never see a
 *     resolvable `node:*` specifier. On edge the dynamic import throws,
 *     is caught, and the service silently no-ops.
 *
 * Result: the same file can be shipped to edge and Node alike — deploy
 * unchanged.
 *
 * @example
 * ```ts
 * import markdoc from "@ecosy/markdoc";
 * import withLocally from "./locally";
 *
 * export default markdoc(
 *   withLocally({
 *     repo: "owner/repo",
 *     branch: "main",
 *     dir: "docs/content",
 *     port: 4999,
 *     plugins: [...],
 *     imports: { ... },
 *   }),
 * );
 * ```
 */

// ─── Type-only imports — erased at compile time, no runtime cost ─────
//
// Use `import type * as ...` rather than `typeof import("node:http")` in
// type positions below. Both are type-level syntax, but the former is
// unambiguously "import type only" to every TypeScript-aware transformer
// (tsc, esbuild, swc, vite-plugin-typescript, babel, wrangler's build
// pipeline). The `typeof import(...)` form contains an `import(...)` token
// that some tools scan for as part of dynamic-import analysis — safer to
// avoid that surface entirely.

import type * as NodeHttp from "node:http";
import type * as NodeFs from "node:fs/promises";
import type * as NodePath from "node:path";
import type * as NodeUrl from "node:url";
import type { Server, IncomingMessage, ServerResponse } from "node:http";
import {
  Plugin,
  type MarkdocConfigurations,
  type PluginConstructor,
  type PluginRegistry,
} from "@ecosy/markdoc";

// ─── Defaults ────────────────────────────────────────────────────────

let serverPort = 4999;

// ─── Runtime environment detection ───────────────────────────────────
//
// Why `new Function`? Bundlers (esbuild, rollup, vite, wrangler, ...) fold
// static `typeof process === "undefined"` checks at build time based on
// target platform presets, which makes a single bundle unable to adapt to
// both Node and edge runtimes at runtime. Hiding the check inside a
// dynamically-constructed function keeps the string opaque to the
// bundler — the decision happens once per process, correctly.

function isEdge(): boolean {
  const source = "return typeof process === 'undefined' || process.release?.name !== 'node'";
  const fn = new Function(source);
  return Boolean(fn());
}

function isNodeJS(): boolean {
  const source = "return typeof process !== 'undefined' && process.release?.name === 'node'";
  const fn = new Function(source);
  return Boolean(fn());
}

function isDev(): boolean {
  if (isEdge()) {
    const source =
      "return typeof import.meta !== 'undefined' && import.meta.env && !!import.meta.env.DEV";
    try {
      const fn = new Function(source);
      return Boolean(fn());
    } catch {
      return false;
    }
  }

  if (isNodeJS()) {
    return process.env.NODE_ENV !== "production";
  }

  return false;
}

// ─── Lazy Node module loader ─────────────────────────────────────────
//
// `node:*` specifiers never appear in static imports — bundlers targeting
// edge runtimes can reject them even if the import is guarded by a runtime
// check. Here the specifier strings are passed into a dynamically-created
// function body, so bundlers see only `import(id)` where `id` is a
// parameter. Tree-shakers / module resolvers can't follow the call.

interface NodeImpl {
  http: typeof NodeHttp;
  fs: typeof NodeFs;
  path: typeof NodePath;
  url: typeof NodeUrl;
}

let nodeImplPromise: Promise<NodeImpl | null> | null = null;

async function loadNodeImpl(): Promise<NodeImpl | null> {
  if (nodeImplPromise) return nodeImplPromise;

  nodeImplPromise = (async () => {
    try {
      const importer = new Function("id", "return import(id)") as <T>(id: string) => Promise<T>;
      const [http, fs, path, url] = await Promise.all([
        importer<NodeImpl["http"]>("node:http"),
        importer<NodeImpl["fs"]>("node:fs/promises"),
        importer<NodeImpl["path"]>("node:path"),
        importer<NodeImpl["url"]>("node:url"),
      ]);
      return { http, fs, path, url };
    } catch {
      // Edge runtime or CSP-restricted — node:* unresolvable. Silent
      // no-op; Locally won't start, but `withLocally` already gated on
      // `isEdge() || !isDev()` so this path should never fire in
      // practice. The guard exists as defense in depth.
      return null;
    }
  })();

  return nodeImplPromise;
}

// ─── HMR-safe server reference ───────────────────────────────────────

const KEY = Symbol.for("@ecosy/markdoc/docs/locally.server");
type GlobalWithServer = typeof globalThis & { [KEY]?: Server | null };

function getSharedServer(): Server | null {
  return (globalThis as GlobalWithServer)[KEY] ?? null;
}

function setSharedServer(s: Server | null): void {
  (globalThis as GlobalWithServer)[KEY] = s;
}

// ─── Config slicing ──────────────────────────────────────────────────

interface LocallyOptions {
  /** Port the Locally HTTP server binds to and the provider points at. Defaults to `4999`. */
  port?: number;
  /**
   * Directory treated as the repository root. Defaults to the parent of
   * this file (`docs/..` = package root). Set explicitly if content
   * lives elsewhere.
   */
  root?: string;
  /** Log every request. Defaults to `true`. */
  log?: boolean;
}

export type LocallyConfigs = MarkdocConfigurations & LocallyOptions;

function splitConfigs(options: LocallyConfigs): [MarkdocConfigurations, LocallyOptions] {
  const { port, root, log, ...markdocConfig } = options;
  return [markdocConfig, { port, root, log }];
}

// ─── withLocally — public wrapper ────────────────────────────────────

function getConfig(port = serverPort): Partial<MarkdocConfigurations> {
  // `provider` is wired up on **any** dev runtime, including edge (e.g.
  // `wrangler dev`). In that scenario the Workers-hosted app still needs
  // content fetches to resolve to a local mirror — the developer just
  // boots the Locally HTTP server themselves from a separate Node
  // process. Only `isDev()` gates this hop; `isEdge()` is irrelevant.
  if (!isDev()) return {};
  serverPort = port;
  return {
    provider: `http://127.0.0.1:${serverPort}/gh`,
  };
}

function getPlugins(
  options: LocallyOptions,
): NonNullable<MarkdocConfigurations["plugins"]> {
  // Locally binds a Node HTTP server — only meaningful on Node dev. On
  // edge dev the developer runs Locally out-of-band; the runtime still
  // benefits from the `provider` override wired up by `getConfig`.
  if (isEdge() || !isDev()) return [];
  return [Locally(options)];
}

/**
 * Wrap a Markdoc config so it runs against the local filesystem in Node dev
 * and against jsDelivr everywhere else. Return value is a regular
 * `MarkdocConfigurations` you hand straight to `markdoc(...)`.
 */
export default function withLocally(options: LocallyConfigs): MarkdocConfigurations {
  const [config, locallyOptions] = splitConfigs(options);

  return {
    ...config,
    ...getConfig(locallyOptions.port),
    plugins: [...(config.plugins ?? []), ...getPlugins(locallyOptions)],
  };
}

// ─── Locally plugin — `__preloadSync` so server binds before content fetch ─
//
// Markdoc's `Server.handleRequest` awaits `pluginable.resolve()` BEFORE
// running `manifest.preload()` / `engine.preload()`. For `__preloadSync`
// plugins the `start()` hook is awaited inside `resolve()`, so by the
// time the manifest fetch goes out the local HTTP server is already
// bound. Without this marker, plugin `start()` runs in parallel with
// preload — fine for self-contained setup, but races for plugins that
// intercept content fetches (this is one of those).
//
// Exported so advanced consumers can plug it in manually. Most callers
// should go through `withLocally`.

export function Locally(options: LocallyOptions = {}): PluginConstructor {
  const port = options.port ?? serverPort;
  const log = options.log ?? true;
  const rootRaw = options.root;

  // Module-scoped shared promise — idempotent start across all plugin
  // instances (though `__global` means only one ever exists per runtime).
  let bootPromise: Promise<void> | null = null;

  async function ensureStarted(): Promise<void> {
    if (bootPromise) return bootPromise;
    bootPromise = (async () => {
      const impl = await loadNodeImpl();
      if (!impl) return;

      // HMR — close any server left over from a previous reload cycle.
      const previous = getSharedServer();
      if (previous) {
        try {
          previous.close();
        } catch {
          /* surface EADDRINUSE at listen() if close fails */
        }
        setSharedServer(null);
      }

      const root = resolveRoot(rootRaw, impl);

      const server = impl.http.createServer((req, res) => {
        void handleRequest(req, res, { root, log, impl }).catch((err) => {
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(`[Locally] internal error: ${(err as Error).message}`);
          }
          if (log) console.error(`[Locally] ${req.method} ${req.url} → 500`, err);
        });
      });

      // Await the `listening` event so subsequent requests are guaranteed
      // to find the port bound — no race when Fetchable fires its GET
      // right after this plugin's start() resolves.
      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", (err) => reject(err));
        server.listen(port, "127.0.0.1");
      });

      if (log) {
        console.log(
          `[Locally] mirroring ${root} at http://127.0.0.1:${port}/gh (dev jsDelivr mirror)`,
        );
      }

      setSharedServer(server);
    })();
    return bootPromise;
  }

  return class LocallyService extends Plugin {
    static readonly __global = true;
    /**
     * Tell the runtime to await this plugin's `start()` before
     * `manifest.preload()` runs — the local HTTP server has to be bound
     * before the runtime fires its first content fetch through it.
     */
    static readonly __preloadSync = true;

    getRegistry(): PluginRegistry {
      return {};
    }

    async start(): Promise<void> {
      // Markdoc awaits this before content preload thanks to
      // `__preloadSync`; subsequent invocations dedupe via the shared
      // `bootPromise` so concurrent resolves never double-bind.
      await ensureStarted();
    }

    /** Closes the HTTP server. Wired up for future `disposeInjects` support. */
    onDispose(): void {
      const server = getSharedServer();
      if (!server) return;
      server.close(() => setSharedServer(null));
      bootPromise = null;
    }
  };
}

function resolveRoot(root: string | undefined, impl: NodeImpl): string {
  if (root) return impl.path.resolve(root);
  const here = impl.path.dirname(impl.url.fileURLToPath(import.meta.url));
  return impl.path.resolve(here, "..");
}

// ─── Request handling ────────────────────────────────────────────────

/**
 * Match `/gh/<owner>/<repo>(@<branch>)?/<path>`.
 * Branch suffix is accepted and discarded — the local working copy is
 * whatever's on disk regardless of what branch the consumer *says* they
 * want. If you need branch-aware serving, run multiple Locally servers.
 */
const PATH_REGEX = /^\/gh\/[^/]+\/[^/@]+(?:@[^/]+)?\/(.+)$/;

const MIME: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function contentTypeFor(abs: string, path: NodeImpl["path"]): string {
  return MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
}

function extractRepoPath(url: string): string | null {
  const qIdx = url.indexOf("?");
  const bareUrl = qIdx === -1 ? url : url.slice(0, qIdx);
  const fIdx = bareUrl.indexOf("#");
  const pathPart = fIdx === -1 ? bareUrl : bareUrl.slice(0, fIdx);

  const match = pathPart.match(PATH_REGEX);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { root: string; log: boolean; impl: NodeImpl },
): Promise<void> {
  const { root, log, impl } = ctx;
  const method = req.method ?? "GET";

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    res.end("method not allowed");
    if (log) console.log(`[Locally] ${method} ${req.url} → 405`);
    return;
  }

  const url = req.url ?? "/";
  const repoPath = extractRepoPath(url);
  if (!repoPath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    if (log) console.log(`[Locally] ${method} ${url} → 404 (bad shape)`);
    return;
  }

  if (repoPath.startsWith("/") || repoPath.split("/").includes("..")) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bad path");
    if (log) console.log(`[Locally] ${method} ${url} → 400 (traversal)`);
    return;
  }

  const abs = impl.path.join(root, repoPath);
  try {
    const info = await impl.fs.stat(abs);
    if (!info.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not a file");
      if (log) console.log(`[Locally] ${method} ${url} → 404 (not a file)`);
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": contentTypeFor(abs, impl.path),
      "Content-Length": String(info.size),
      "Cache-Control": "no-store",
    };

    if (method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      if (log) console.log(`[Locally] HEAD ${url} → 200`);
      return;
    }

    const body = await impl.fs.readFile(abs);
    res.writeHead(200, headers);
    res.end(body);
    if (log) console.log(`[Locally] GET ${url} → 200 (${info.size}B)`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
      if (log) console.log(`[Locally] ${method} ${url} → 404 (${abs})`);
      return;
    }
    throw err;
  }
}
