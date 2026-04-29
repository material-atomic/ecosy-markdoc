/**
 * ❌ Wrong: Common engine mistakes.
 */
import { Plugin, type PluginConstructor, type PluginRegistry } from "@ecosy/markdoc";

// --- Mistake 1: Trusting tag attributes to be safe HTML ---

export function UnsafeEmbed(): PluginConstructor {
  return class UnsafeEmbedPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        components: {
          // ❌ Wrong — `url` goes verbatim into an attribute context. If a
          //    markdown author supplies `url="javascript:alert(1)"` or
          //    injects quotes, you get XSS.
          embed: `<iframe src="{{ url }}" allow="autoplay" />`,
        },
      };
    }
  };
}

// --- Mistake 2: Assuming placeholders will resolve to empty string when missing ---

export function AssumesEmpty(): PluginConstructor {
  return class AssumesEmptyPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        components: {
          // ❌ Wrong — if `title` is absent, the output contains the literal
          //    `{{ title }}`. Either provide a default in the tag, or branch
          //    in a pre-processing step; the engine intentionally does not
          //    coerce missing keys to "".
          profile: `<div><h3>{{ title }}</h3>{{ body }}</div>`,
        },
      };
    }
  };
}

// --- Mistake 3: Using `<script>` in component templates ---

export function ScriptInjection(): PluginConstructor {
  return class ScriptInjectionPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        components: {
          // ❌ Wrong — templates are rendered as-is. Arbitrary scripts run
          //    on every page that uses this component. If you need client
          //    JS, ship it as a layout `<script src=...>` include, not
          //    inline through a tag.
          tracker: `
            <script>window.__tracker = () => fetch('/ingest', { method: 'POST' });</script>
          `,
        },
      };
    }
  };
}

// --- Mistake 4: Expecting `reload()` to rebuild instantly ---

// ❌ Wrong expectation — `engine.reload()` clears the cache. Components are
//    refetched lazily on the next tag that uses them. Do not rely on
//    `reload()` being synchronous or causing an immediate refetch.

// --- Mistake 5: Bypassing the engine to render tags manually ---

// ❌ Wrong — constructing tag HTML yourself skips plugin component
//    overrides, escaping, and template caching. Always route tag rendering
//    through the injected `EngineLike` (`await this.engine.render(tags)`).
