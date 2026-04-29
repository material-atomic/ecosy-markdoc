import { Plugin, type PluginConstructor, type PluginRegistry } from "../core/plugin";
import type { MarkdocRequest } from "../core/request";
import type { MarkdocResponse } from "../core/response";
import { redirect } from "../core/redirect";

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Developer-supplied JWT verification function.
 * Truthy return → request passes. Falsy return or thrown error → unauthorized.
 *
 * `req` is passed so developers can apply fine-grained policies based on
 * request context (IP, User-Agent, path, etc.) in addition to the JWT itself.
 */
export type AuthenVerify = (jwt: string, req: MarkdocRequest) => boolean | Promise<boolean>;

/** Inline login UI render config used when unauthorized. */
export interface AuthenRenderConfig {
  mode: "render";
  /** HTML template string, or a factory that receives the request and returns HTML. */
  template: string | ((req: MarkdocRequest) => string | Promise<string>);
  /** Response `Content-Type` header. Defaults to `"text/html; charset=utf-8"`. */
  contentType?: string;
  /** HTTP status code. Defaults to `401`. */
  status?: number;
}

/** Custom handler for the unauthorized case — full control over the response. */
export type AuthenHandler = (
  req: MarkdocRequest,
  res: MarkdocResponse,
) => Response | Promise<Response>;

export interface AuthenOptions {
  /**
   * Cookie name that carries the JWT.
   * @default "token"
   */
  cookieName?: string;

  /**
   * JWT verification function. A truthy return is treated as authenticated.
   *
   * @example
   * verify: (jwt) => {
   *   try {
   *     const payload = jose.verifyJWT(jwt, SECRET);
   *     return !!payload;
   *   } catch {
   *     return false;
   *   }
   * }
   */
  verify: AuthenVerify;

  /**
   * Behaviour for unauthorized requests:
   *
   * - `string` (URL path) — 302 redirect to that URL
   * - `AuthenRenderConfig` — inline HTML render (default status 401)
   * - `AuthenHandler` — custom function returning a `Response`
   *
   * @example redirect
   * onUnauthorized: "/login"
   *
   * @example render inline
   * onUnauthorized: {
   *   mode: "render",
   *   template: "<html><body><h1>Login required</h1>...</body></html>",
   * }
   *
   * @example custom handler
   * onUnauthorized: async (req, res) => res.status(403).html("Forbidden").toResponse()
   */
  onUnauthorized: string | AuthenRenderConfig | AuthenHandler;

  /**
   * Paths that bypass authentication. Exact match against `req.pathname`.
   * Typically includes `/login`, `/register`, `/healthz`, `/sitemap.xml`, etc.
   */
  publicPaths?: string[];
}

// ─── Plugin factory ──────────────────────────────────────────────────

/**
 * Authen plugin — gates every request behind JWT cookie authentication
 * before the router matches any URL.
 *
 * Two intervention layers:
 *
 * 1. **Pre-request hook** (`beginRequest`): reads the JWT cookie, calls
 *    the developer's `verify(jwt)` function. Truthy → pass. Falsy →
 *    short-circuit with a response determined by `onUnauthorized`.
 *
 * 2. **URL strategy**: developers choose between rendering a login UI
 *    inline (`mode: "render"`) or redirecting to a login page (string URL).
 *
 * @example
 * ```ts
 * import markdoc, { Authen } from "@ecosy/markdoc";
 * import * as jose from "jose";
 *
 * const app = markdoc({
 *   repo: "owner/repo",
 *   plugins: [
 *     Authen({
 *       cookieName: "ecosy_session",
 *       verify: async (jwt) => {
 *         try {
 *           const { payload } = await jose.jwtVerify(jwt, SECRET);
 *           return !!payload.sub;
 *         } catch {
 *           return false;
 *         }
 *       },
 *       onUnauthorized: "/login",
 *       publicPaths: ["/login", "/register", "/healthz"],
 *     }),
 *   ],
 * });
 * ```
 */
export function Authen(options: AuthenOptions): PluginConstructor {
  const cookieName = options.cookieName ?? "token";
  const publicPaths = new Set(options.publicPaths ?? []);

  return class AuthenPlugin extends Plugin {
    // Global plugin — the same instance is reused across requests instead of
    // being re-instantiated per request.
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      // No URLs registered — the plugin is purely cross-cutting via beginRequest.
      // Developers implement their own `/login` endpoint as a separate plugin
      // or as a regular markdown page (added to publicPaths).
      return {};
    }

    /**
     * Hook that runs before routing. Returning a non-null value short-circuits
     * the response; returning null continues normal flow.
     */
    async beginRequest(req: MarkdocRequest, res: MarkdocResponse): Promise<Response | null> {
      // Public paths bypass authentication entirely.
      if (publicPaths.has(req.pathname)) return null;

      const jwt = req.cookie(cookieName);
      if (jwt) {
        try {
          const ok = await options.verify(jwt, req);
          if (ok) return null; // pass
        } catch {
          // Verify throw → treat as unauthorized, fall through
        }
      }

      return this.respondUnauthorized(req, res);
    }

    private async respondUnauthorized(
      req: MarkdocRequest,
      res: MarkdocResponse,
    ): Promise<Response> {
      const handler = options.onUnauthorized;

      // Option 1: string URL → 302 redirect
      if (typeof handler === "string") {
        const location = handler.startsWith("http")
          ? handler
          : new URL(handler, req.mdUrl.origin).toString();
        return redirect(location);
      }

      // Option 2: function → full control
      if (typeof handler === "function") {
        return await handler(req, res);
      }

      // Option 3: render config → inline HTML
      const body =
        typeof handler.template === "function" ? await handler.template(req) : handler.template;

      return new Response(body, {
        status: handler.status ?? 401,
        headers: {
          "Content-Type": handler.contentType ?? "text/html; charset=utf-8",
        },
      });
    }
  };
}
