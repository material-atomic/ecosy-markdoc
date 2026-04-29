import { Plugin, type PluginConstructor, type PluginRegistry } from "../core/plugin";
import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Allowed origins. Three forms:
 *
 * - `"*"` — any origin. Browsers ignore `Access-Control-Allow-Credentials`
 *    with `*` origin. Set `credentials: false` (default) when using `*`.
 * - `string[]` — exact-match allowlist.
 * - `(origin, req) => boolean` — dynamic predicate.
 */
export type CorsOrigin = "*" | string[] | ((origin: string, req: MarkdocRequest) => boolean);

export interface CorsOptions {
  /**
   * Allowed origin(s). Required.
   *
   * @example "*"                                       // any origin
   * @example ["https://app.example.com"]               // exact allowlist
   * @example (origin) => origin.endsWith(".trusted.io") // predicate
   */
  origin: CorsOrigin;

  /**
   * HTTP methods allowed on the resource.
   * @default ["GET","HEAD","POST","PUT","DELETE","PATCH","OPTIONS"]
   */
  methods?: string[];

  /**
   * Request headers allowed in preflight. When omitted, the plugin reflects
   * `Access-Control-Request-Headers` from the preflight request.
   */
  headers?: string[];

  /**
   * Response headers the browser is allowed to expose to client-side JS.
   */
  exposeHeaders?: string[];

  /**
   * Whether cookies / HTTP auth / TLS certificates are allowed.
   *
   * When `true`, `origin` must not be `"*"` — browsers reject the combination.
   * @default false
   */
  credentials?: boolean;

  /**
   * Preflight cache duration in seconds.
   * @default 86400 (24 hours)
   */
  maxAge?: number;
}

// ─── Plugin factory ──────────────────────────────────────────────────

const DEFAULT_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"];
const DEFAULT_MAX_AGE = 86400;

/**
 * CORS plugin — handles preflight requests and injects CORS headers on
 * regular responses.
 *
 * Split across two lifecycle hooks:
 *
 * - `beginRequest` answers preflight `OPTIONS` with a 204 + CORS headers,
 *   short-circuiting before the router sees the request.
 * - `endRequest` appends `Access-Control-Allow-*` headers to regular
 *   responses that carry an `Origin` header.
 *
 * @example Allow any origin (no credentials)
 * ```ts
 * Cors({ origin: "*" })
 * ```
 *
 * @example Allowlist with cookies
 * ```ts
 * Cors({
 *   origin: ["https://app.example.com", "https://admin.example.com"],
 *   credentials: true,
 *   exposeHeaders: ["X-Total-Count"],
 * })
 * ```
 *
 * @example Dynamic allowlist
 * ```ts
 * Cors({
 *   origin: (origin) => /\.trusted\.io$/.test(origin),
 *   credentials: true,
 * })
 * ```
 */
export function Cors(options: CorsOptions): PluginConstructor {
  const methods = options.methods ?? DEFAULT_METHODS;
  const allowHeaders = options.headers;
  const exposeHeaders = options.exposeHeaders;
  const credentials = !!options.credentials;
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;

  if (credentials && options.origin === "*") {
    throw new Error(
      "Cors: `credentials: true` is incompatible with `origin: '*'`. " +
        "Use an explicit origin or a predicate.",
    );
  }

  function isOriginAllowed(origin: string, req: MarkdocRequest): boolean {
    if (options.origin === "*") return true;
    if (Array.isArray(options.origin)) return options.origin.includes(origin);
    return options.origin(origin, req);
  }

  function resolveAllowedOrigin(origin: string): string {
    return options.origin === "*" && !credentials ? "*" : origin;
  }

  return class CorsPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {};
    }

    beginRequest(req: MarkdocRequest): Response | null {
      // Only preflight (OPTIONS + Origin + Access-Control-Request-Method)
      if (req.method !== "OPTIONS") return null;
      const origin = req.header("origin");
      if (!origin) return null;
      const requestMethod = req.header("access-control-request-method");
      if (!requestMethod) return null;

      // Rejected origin → no CORS headers, browser blocks
      if (!isOriginAllowed(origin, req)) {
        return new Response(null, { status: 204 });
      }

      const requestHeaders = req.header("access-control-request-headers");
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", resolveAllowedOrigin(origin));
      headers.set("Access-Control-Allow-Methods", methods.join(", "));
      headers.set(
        "Access-Control-Allow-Headers",
        allowHeaders?.join(", ") ?? requestHeaders ?? "*",
      );
      headers.set("Access-Control-Max-Age", String(maxAge));
      if (credentials) headers.set("Access-Control-Allow-Credentials", "true");
      headers.append("Vary", "Origin");
      headers.append("Vary", "Access-Control-Request-Method");
      headers.append("Vary", "Access-Control-Request-Headers");

      return new Response(null, { status: 204, headers });
    }

    endRequest(req: MarkdocRequest, _res: MarkdocResponse, response: Response): Response {
      // Skip preflight — already handled in beginRequest
      if (req.method === "OPTIONS") return response;

      const origin = req.header("origin");
      if (!origin) return response; // Same-origin request — no CORS needed

      if (!isOriginAllowed(origin, req)) return response;

      // Clone headers to avoid mutating immutable Response.headers on some runtimes
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", resolveAllowedOrigin(origin));
      if (credentials) headers.set("Access-Control-Allow-Credentials", "true");
      if (exposeHeaders?.length) {
        headers.set("Access-Control-Expose-Headers", exposeHeaders.join(", "));
      }
      headers.append("Vary", "Origin");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  };
}
