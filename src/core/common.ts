import type { InjectClassable, InjectedAccessor } from "@ecosy/classable/injectable";
import type { MarkdownParser } from "./parser";
import type { PluginableLike } from "./plugin";
import type { RequestLifecycleOptions } from "./request-lifecycle";

export interface RepositoryInfo {
  repo: string;
  branch?: string;
  dir?: string;
}

export interface DocumentationInfo {
  /**
   * Base URL the runtime fetches content from.
   *
   * @default "https://cdn.jsdelivr.net/gh"
   */
  provider?: string;

  /**
   * Template string used to assemble the full content URL from
   * `{provider}`, `{repo}`, `{branch}`, `{dir}`, `{path}` placeholders
   * (and anything else you pass into `getContentUrl(params)`).
   *
   * Leave this undefined to keep the default jsDelivr shape. Override
   * when you point `provider` at a service that needs a different
   * path structure — e.g. a raw GitHub CDN, a proxying worker, or a
   * company-internal artifact host.
   *
   * @default "{provider}/{repo}{branch}{dir}{path}"
   *
   * @example
   * // raw.githubusercontent.com doesn't use `@` for the branch ref,
   * // it uses `/` and omits the prefix segment:
   * //   https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
   * interpolate: "{provider}/{repo}/{branch}{dir}{path}"
   */
  interpolate?: string;
}

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
