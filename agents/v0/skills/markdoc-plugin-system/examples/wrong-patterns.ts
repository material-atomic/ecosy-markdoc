/**
 * ❌ Wrong: Common plugin mistakes.
 *
 * Each block is a standalone counter-example — do not combine them.
 */
import {
  Plugin,
  type PluginConstructor,
  type PluginRegistry,
  type MarkdocRequest,
  type MarkdocResponse,
} from "@ecosy/markdoc";

// --- Mistake 1: Returning a plain object from the factory ---

export function BadHandler() {
  // ❌ Wrong — Pluginable expects a classable, not an object.
  //    The runtime calls `new Target(ctx, store)` on whatever you return.
  return {
    fetch(_req: unknown, _res: unknown) {
      return { ok: true };
    },
  };
}

// --- Mistake 2: Missing factory wrapper ---

// ❌ Wrong — exporting a bare `class` couples consumers to the class name.
//    The published API should always be a factory `MyPlugin(options)` that
//    returns a `PluginConstructor`.
export class BarePlugin extends Plugin {
  getRegistry(): PluginRegistry {
    return {};
  }
}

// --- Mistake 3: Stateful class without `__global` ---

export function LeakyCounter(): PluginConstructor {
  // Missing `static __global = true` — Pluginable creates a fresh instance
  // per request, so `count` resets every time. Lives one request.
  return class LeakyPlugin extends Plugin {
    private count = 0;

    getRegistry(): PluginRegistry {
      return { urls: { "/count": { method: "GET" } } };
    }

    async fetch(_req: MarkdocRequest, res: MarkdocResponse) {
      this.count += 1;
      return res.json({ count: this.count }); // Always 1.
    }
  };
}

// --- Mistake 4: Validation inside `fetch` instead of `beginRequest` ---

export function MixedAuth(): PluginConstructor {
  return class MixedAuthPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return { urls: { "/api/me": { method: "GET" } } };
    }

    async fetch(req: MarkdocRequest, res: MarkdocResponse) {
      // ❌ Wrong — the same check belongs in `beginRequest` so it covers
      //    all plugin routes and pages, not just this one.
      const token = req.cookie("session");
      if (!token) return res.status(401).text("unauth");

      return res.json({ user: "me" });
    }
  };
}

// --- Mistake 5: Mutating the response directly instead of returning a new one ---

export function BadSecurity(): PluginConstructor {
  return class BadSecurityPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {};
    }

    endRequest(_req: MarkdocRequest, _res: MarkdocResponse, response: Response): Response {
      // ❌ Wrong — `response.headers` is read-only on some runtimes.
      //    Build a new `Response` with a cloned Headers instead.
      try {
        response.headers.set("X-Frame-Options", "DENY");
      } catch {
        /* silently fails on immutable responses */
      }
      return response;
    }
  };
}

// --- Mistake 6: `new`-ing runtime dependencies ---

export function BadManifestConsumer(): PluginConstructor {
  return class BadConsumerPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return { urls: { "/api/pages": { method: "GET" } } };
    }

    async fetch(_req: MarkdocRequest, res: MarkdocResponse) {
      // ❌ Wrong — do not construct core classables yourself. Inject them
      //    via constructor default parameters:
      //      constructor(ctx, store, private manifest = Inject<ManifestLike>("manifest")) { super(ctx, store); }
      //
      // const manifest = new Manifest();
      // const pages = await manifest.list();
      return res.json({ error: "see comment above" });
    }
  };
}
