/**
 * ❌ Wrong: Common manifest mistakes.
 */
import { Plugin, type PluginConstructor, type PluginRegistry } from "@ecosy/markdoc";

// --- Mistake 1: Hardcoded content URLs bypass manifest + documentation ---

export function BadDirectFetch(): PluginConstructor {
  return class BadDirectFetchPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return { urls: { "/raw": { method: "GET" } } };
    }

    async fetch() {
      // ❌ Wrong — breaks when provider, branch, dir, or CDN change.
      //    Always use `Documentation.getContentUrl()` + `Manifest.resolve()`.
      const res = await fetch("https://cdn.jsdelivr.net/gh/owner/docs@main/content/index.md");
      return new Response(await res.text());
    }
  };
}

// --- Mistake 2: Mutating the manifest cache directly ---

export function BadManifestMutation(): PluginConstructor {
  return class BadManifestMutationPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {};
    }

    async beginRequest() {
      // ❌ Wrong — internal `manifests`/`urls` maps are not part of the API.
      //    To invalidate, call `this.manifest.reload()`.
      // (this.manifest as any).manifests.clear();
      return null;
    }
  };
}

// --- Mistake 3: Manifest keys with file extensions ---

// ❌ Wrong — manifest keys are URL paths. No `.md`, no trailing slash.
const badManifest = {
  pages: {
    "/about.md": { file: "about.md" }, // key shouldn't have extension
    "/guides/": { file: "guides/index.md" }, // key shouldn't have trailing slash
  },
};
void badManifest;

// --- Mistake 4: Assuming a filesystem layout ---

// ❌ Wrong — the manifest is the source of truth. A `.md` file present in
//    the repo but *not* in the manifest will return 404. Always keep the
//    manifest in sync when adding/removing content.

// --- Mistake 5: Calling `reload()` synchronously expecting it to block ---

export function BadReloadWait(): PluginConstructor {
  return class BadReloadWaitPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return { urls: { "/reload": { method: "POST" } } };
    }

    // Inject manifest if you need it — omitted here to keep the example short.
    // async fetch(_req, res) {
    //   await this.manifest.reload();
    //   // ❌ Wrong expectation — `reload()` clears the cache but does NOT
    //   //    refetch immediately. Next request triggers the fetch.
    //   const pages = await this.manifest.list(); // may still be stale for one tick
    //   return res.json({ pages });
    // }
    async fetch() {
      return new Response("see comment");
    }
  };
}
