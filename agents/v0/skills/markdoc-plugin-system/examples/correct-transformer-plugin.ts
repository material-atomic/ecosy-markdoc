/**
 * ✅ Correct: `endRequest` transformer plugin.
 *
 * Appends security headers (CSP, HSTS, X-Content-Type-Options, …) to every
 * response. Chained with other `endRequest` plugins — registration order
 * determines the order of transforms.
 */
import {
  Plugin,
  type PluginConstructor,
  type PluginRegistry,
  type MarkdocRequest,
  type MarkdocResponse,
} from "@ecosy/markdoc";

export interface SecurityHeadersOptions {
  /** Value of the `Content-Security-Policy` header. Omit to skip. */
  csp?: string;
  /** `Strict-Transport-Security` max-age in seconds (default 31536000). */
  hstsMaxAge?: number;
  /** Custom additional headers. */
  extra?: Record<string, string>;
}

export function SecurityHeaders(options: SecurityHeadersOptions = {}): PluginConstructor {
  const hstsMaxAge = options.hstsMaxAge ?? 31_536_000;
  const extra = options.extra ?? {};

  return class SecurityHeadersPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {};
    }

    endRequest(_req: MarkdocRequest, _res: MarkdocResponse, response: Response): Response {
      const headers = new Headers(response.headers);

      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Frame-Options", "DENY");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Strict-Transport-Security", `max-age=${hstsMaxAge}; includeSubDomains`);

      if (options.csp) headers.set("Content-Security-Policy", options.csp);

      for (const [k, v] of Object.entries(extra)) {
        headers.set(k, v);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  };
}
