/**
 * ✅ Correct: Plugin that streams an upstream body through.
 *
 * Exposes `/proxy?url=...` and forwards the target's response body as a
 * `ReadableStream<Uint8Array>` — no buffering in the runtime. Useful for
 * proxying large assets or incrementally-generated content (LLM token
 * streams, server-sent events, progressive JSON) without pinning memory
 * on edge runtimes.
 *
 * Contract: `MarkdocResponse.stream(body, contentType?)` accepts the
 * stream directly. The runtime passes it through to the platform
 * `Response`; the browser receives bytes as they arrive.
 *
 * Caveat: once the first byte has left the process, the status line is
 * on the wire — a mid-stream error can only drop the connection, not
 * produce a 5xx page. Validate inputs (URL shape, upstream reachability)
 * before calling `.stream()`.
 */
import {
  Plugin,
  type PluginConstructor,
  type PluginRegistry,
  type MarkdocRequest,
  type MarkdocResponse,
} from "@ecosy/markdoc";

export interface StreamProxyOptions {
  /** Allowlist of hostnames that may be proxied. Everything else → 403. */
  allowedHosts: string[];
}

export function StreamProxy(options: StreamProxyOptions): PluginConstructor {
  const allowed = new Set(options.allowedHosts);

  return class StreamProxyPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        urls: {
          "/proxy": { method: "GET", summary: "Stream an upstream URL", tags: ["proxy"] },
        },
      };
    }

    async fetch(req: MarkdocRequest, res: MarkdocResponse): Promise<MarkdocResponse> {
      const rawUrl = req.query("url");
      if (!rawUrl) return res.status(400).json({ error: "missing `url` query" });

      let target: URL;
      try {
        target = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: "invalid url" });
      }

      if (!allowed.has(target.hostname)) {
        return res.status(403).json({ error: "host not allowed" });
      }

      // Pre-flight — fail fast before we start streaming. Once `.stream()`
      // has returned the body, the status line is locked in.
      const upstream = await fetch(target);
      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({
          error: "upstream failed",
          status: upstream.status,
        });
      }

      const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
      return res.status(upstream.status).stream(upstream.body, contentType);
    }
  };
}
