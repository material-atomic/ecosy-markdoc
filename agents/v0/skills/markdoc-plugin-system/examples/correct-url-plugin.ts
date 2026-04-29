/**
 * ✅ Correct: URL-only plugin.
 *
 * Exposes `/healthz` for uptime probes. No lifecycle hooks; the registry
 * declares the route and `fetch` handles the request.
 */
import { Plugin, type PluginConstructor, type PluginRegistry } from "@ecosy/markdoc";

export interface HealthzOptions {
  /** Extra fields appended to the response body. */
  meta?: Record<string, string>;
}

export function Healthz(options: HealthzOptions = {}): PluginConstructor {
  const meta = { ...(options.meta ?? {}) };

  return class HealthzPlugin extends Plugin {
    // Stateless — cache a single instance across all requests.
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        urls: {
          "/healthz": {
            summary: "Liveness probe",
            method: "GET",
            tags: ["ops"],
          },
        },
      };
    }

    async fetch(_req: unknown, res: {
      json: (payload: unknown) => unknown;
    }) {
      return res.json({ ok: true, ts: Date.now(), ...meta });
    }
  };
}
