/**
 * ✅ Correct: Replace the default Engine with a custom renderer.
 *
 * `engine` is the only core key that can be overridden via `imports`. The
 * replacement must honor the `EngineLike` contract (render, reload, component
 * registration). Most apps won't need this — the built-in Engine is
 * sufficient. Reach for this when you need a different templating semantic
 * (e.g. MDX + React SSR) or a different cache story.
 */
import markdoc from "@ecosy/markdoc";
import type { EngineLike, MarkdocTag } from "@ecosy/markdoc";

class CustomEngine implements EngineLike {
  private components = new Map<string, string>();

  async reload(): Promise<void> {
    this.components.clear();
    // …re-fetch component templates from wherever…
  }

  register(name: string, template: string): void {
    this.components.set(name, template);
  }

  async renderTag(tag: MarkdocTag): Promise<string> {
    const template = this.components.get(tag.name);
    if (!template) return "";
    // …custom interpolation strategy…
    return template.replace("{{body}}", String(tag.body ?? ""));
  }

  async render(tags: MarkdocTag[]): Promise<string> {
    const parts: string[] = [];
    for (const tag of tags) parts.push(await this.renderTag(tag));
    return parts.join("");
  }
}

export default markdoc({
  repo: "owner/docs",

  imports: {
    // `engine` replaces the built-in EngineNode. Must match EngineLike.
    engine: CustomEngine,
  },
});
