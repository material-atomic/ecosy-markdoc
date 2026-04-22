export interface RepositoryInfo {
  repo: string;
  branch?: string;
  dir?: string;
}

export interface DocumentationInfo {
  /**
   * @default "https://cdn.jsdelivr.net/gh"
   */
  provider?: string;
}

import type { InjectClassable, InjectedAccessor } from "../classable/injectable";
import type { MarkdownParser } from "./parser";
import type { PluginableLike } from "./plugin";
import type { RequestLifecycleOptions } from "./request-lifecycle";

/**
 * User-provided classable imports.
 * Keys are injection names, values are classable descriptors
 * (class constructor or factory with `target` + `get`).
 */
export type MarkdocImports = Record<string, InjectClassable<unknown, InjectedAccessor>>;

export interface MarkdocConfigurations extends DocumentationInfo, RepositoryInfo {
  strict?: boolean;
  revalidate?: number;
  plugins?: PluginableLike[];
  lifecycle?: RequestLifecycleOptions;
  /**
   * Custom markdown-to-HTML parser.
   * Receives raw markdown body (after frontmatter extraction) and
   * the parsed frontmatter metadata.
   * Defaults to the built-in lightweight parser.
   *
   * @example
   * // Use marked
   * import { marked } from "marked";
   * parser: (md) => marked.parse(md)
   *
   * // Use markdown-it
   * import MarkdownIt from "markdown-it";
   * const mdi = new MarkdownIt();
   * parser: (md) => mdi.render(md)
   */
  parser?: MarkdownParser;

  /**
   * Custom classable imports injected into the runtime DI container.
   * Allows extending the runtime with additional services accessible
   * via `Inject<T>("name")` in classables.
   *
   * Reserved runtime keys are automatically excluded:
   * `configuration`, `fetchable`, `repo`, `documentation`,
   * `manifest`, `pagable`, `pluginable`, `server`.
   *
   * @example
   * imports: {
   *   analytics: AnalyticsService,
   *   search: {
   *     target: SearchIndex,
   *     get: (accessor) => [accessor.get("fetchable")],
   *   },
   * }
   */
  imports?: MarkdocImports;
}

export type InjectedName =
  | "configuration"
  | "engine"
  | "fetchable"
  | "repo"
  | "documentation"
  | "manifest"
  | "pagable"
  | "pluginable"
  | "server";

export interface RuntimeAccessor {
  get<LikelyType>(name: InjectedName): LikelyType;
}
