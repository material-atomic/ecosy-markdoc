/**
 * ✅ Correct: Plugin contributing inline components.
 *
 * `ThemeOverlay` ships two inline components (`callout`, `note`) and wires
 * them into the engine via `PluginRegistry.components`. Plugin-provided
 * components override file-based ones of the same name — this is how a
 * theme package can re-style shared widgets without touching the content
 * repository.
 */
import { Plugin, type PluginConstructor, type PluginRegistry } from "@ecosy/markdoc";

export interface ThemeOverlayOptions {
  accent?: string;
}

export function ThemeOverlay(options: ThemeOverlayOptions = {}): PluginConstructor {
  const accent = options.accent ?? "#38bdf8";

  return class ThemeOverlayPlugin extends Plugin {
    static readonly __global = true;

    getRegistry(): PluginRegistry {
      return {
        components: {
          callout: `
            <aside class="callout" style="--accent:${accent}">
              <strong>{{ title }}</strong>
              <div>{{ body }}</div>
            </aside>
          `,
          note: `
            <div class="note">
              <em>Note:</em> {{ body }}
            </div>
          `,
        },
      };
    }
  };
}
