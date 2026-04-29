import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server as HttpServer,
} from "node:http";

export interface NodeJSOptions {
  /**
   * Port to bind. Defaults to 3000.
   */
  port?: number;
  /**
   * Hostname/interface to bind. Defaults to `"127.0.0.1"` (localhost only).
   * Set `"0.0.0.0"` to expose on all interfaces.
   */
  hostname?: string;
}

export interface EdgeServer {
  fetch(request: Request): Promise<Response>;
}

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = "127.0.0.1";

// ─── Global-scoped server reference ──────────────────────────────────
// Hot reload (Vite HMR, tsx watch, nodemon, ...) re-executes this module,
// so each `server()` call returns a brand new `NodeJSServer` class with
// an empty static slot. To survive reloads we store the running HTTP server
// on `globalThis` via `Symbol.for` — the global symbol registry yields the
// same symbol across every module/reload instance, so the new class can
// find and close the previous server.

const HTTP_SERVER_KEY = Symbol.for("@ecosy/markdoc/nodejs.httpServer");

type GlobalWithServer = typeof globalThis & {
  [HTTP_SERVER_KEY]?: HttpServer | null;
};

function getSharedServer(): HttpServer | null {
  return (globalThis as GlobalWithServer)[HTTP_SERVER_KEY] ?? null;
}

function setSharedServer(server: HttpServer | null): void {
  (globalThis as GlobalWithServer)[HTTP_SERVER_KEY] = server;
}

/**
 * Node.js HTTP adapter for the Markdoc edge server.
 *
 * Bridges Node's `IncomingMessage`/`ServerResponse` and the Web
 * `Request`/`Response` APIs: converts the incoming request into a Web
 * `Request`, calls `app.fetch()`, and streams the response back to the client.
 *
 * @param app Markdoc edge app (returned from `markdoc(config)`).
 * @param options Node HTTP config (port, hostname).
 *
 * @example
 * ```ts
 * import markdoc from "@ecosy/markdoc";
 * import { server } from "@ecosy/markdoc/nodejs";
 *
 * const app = markdoc({ repo: "owner/repo", branch: "main", dir: "docs" });
 * server(app, { port: 3000 }).start(() => {
 *   console.log("http://localhost:3000");
 * });
 * ```
 */
/**
 * Static-only surface of the class returned by `server()`. The HTTP
 * adapter is intentionally not instantiated by consumers — `start()`
 * and `stop()` are called on the class directly.
 */
export interface NodeJSServerStatic {
  readonly port: number;
  readonly hostname: string;
  start(callback?: () => void): void;
  stop(callback?: (err?: Error) => void): void;
}

export function server(app: EdgeServer, options: NodeJSOptions = {}): NodeJSServerStatic {
  const port = options.port ?? DEFAULT_PORT;
  const hostname = options.hostname ?? DEFAULT_HOSTNAME;

  return class NodeJSServer {
    static readonly port = port;
    static readonly hostname = hostname;

    /**
     * Start the server. Hot-reload friendly: if a previous server is still
     * running (left over from a reload), it is auto-closed before the new
     * one binds. Never throws — callers invoke `start()` once in their entry
     * file and the HMR cycle is handled transparently.
     */
    static start(callback?: () => void) {
      const existing = getSharedServer();
      if (existing) {
        existing.close(() => {
          setSharedServer(null);
          NodeJSServer.listen(callback);
        });
        return;
      }
      NodeJSServer.listen(callback);
    }

    static stop(callback?: (err?: Error) => void) {
      const current = getSharedServer();
      if (!current) {
        callback?.();
        return;
      }
      current.close((err) => {
        setSharedServer(null);
        callback?.(err);
      });
    }

    private static listen(callback?: () => void) {
      const httpServer = createServer((req, res) => {
        handle(req, res, app).catch((err) => {
          writeError(res, err);
        });
      });

      httpServer.listen(port, hostname, () => {
        callback?.();
      });

      setSharedServer(httpServer);
    }
  };
}

// ─── Internals ─────────────────────────────────────────────────────────

async function handle(req: IncomingMessage, res: ServerResponse, app: EdgeServer): Promise<void> {
  const request = toWebRequest(req);
  const response = await app.fetch(request);
  await writeWebResponse(response, res);
}

function toWebRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? `${DEFAULT_HOSTNAME}:${DEFAULT_PORT}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const method = req.method ?? "GET";

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  // GET/HEAD have no request body per the HTTP spec.
  const hasBody = method !== "GET" && method !== "HEAD";
  if (!hasBody) {
    return new Request(url, { method, headers });
  }

  // Stream the body from Node's IncomingMessage into a Web ReadableStream.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      req.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      req.on("end", () => controller.close());
      req.on("error", (err) => controller.error(err));
    },
  });

  return new Request(url, {
    method,
    headers,
    body,
    // `duplex: "half"` is required whenever a streaming body is attached
    // (Node 18+ with undici enforces this).
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
    res.end();
  } catch (err) {
    reader.cancel().catch(() => {});
    throw err;
  }
}

function writeError(res: ServerResponse, err: unknown): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  res.statusCode = 500;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    `<html><body style="font-family:monospace;padding:2rem;background:#1a1a2e;color:#e94560">` +
      `<h1>500 — Internal Server Error</h1>` +
      `<pre style="background:#16213e;padding:1rem;border-radius:8px;overflow-x:auto;color:#eee">${escapeHtml(message)}</pre>` +
      `</body></html>`,
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
