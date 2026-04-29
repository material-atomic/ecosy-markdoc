/**
 * ✅ Correct: `beginRequest` guard plugin.
 *
 * Fixed-window in-memory rate limiter. Gate non-OPTIONS requests per IP
 * before the router matches any URL. Returning a `Response` short-circuits
 * the rest of the pipeline.
 */
import {
  Plugin,
  type PluginConstructor,
  type PluginRegistry,
  type MarkdocRequest,
  type MarkdocResponse,
} from "@ecosy/markdoc";

export interface RateLimitOptions {
  /** Requests allowed per window (default 60). */
  limit?: number;
  /** Window size in ms (default 60_000). */
  windowMs?: number;
  /** Header carrying the client IP (defaults to `x-forwarded-for`). */
  ipHeader?: string;
}

export function RateLimit(options: RateLimitOptions = {}): PluginConstructor {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const ipHeader = options.ipHeader ?? "x-forwarded-for";

  const hits = new Map<string, { count: number; resetAt: number }>();

  return class RateLimitPlugin extends Plugin {
    // Must be global — per-request instances would reset the counter map.
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {}; // Purely cross-cutting — no URLs contributed.
    }

    beginRequest(req: MarkdocRequest, _res: MarkdocResponse): Response | null {
      // Never rate-limit preflight — CORS needs a free path.
      if (req.method === "OPTIONS") return null;

      const ip = req.header(ipHeader)?.split(",")[0]?.trim() ?? "anon";
      const now = Date.now();
      const entry = hits.get(ip);

      if (!entry || entry.resetAt <= now) {
        hits.set(ip, { count: 1, resetAt: now + windowMs });
        return null;
      }

      entry.count += 1;
      if (entry.count > limit) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(entry.resetAt),
          },
        });
      }

      return null;
    }
  };
}
