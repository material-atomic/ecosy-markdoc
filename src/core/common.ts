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

import type { PluginableLike } from "./plugin";
import type { RequestLifecycleOptions } from "./request-lifecycle";

export interface MarkdocConfigurations extends DocumentationInfo, RepositoryInfo {
  strict?: boolean;
  revalidate?: number;
  plugins?: PluginableLike[];
  lifecycle?: RequestLifecycleOptions;
}

export type InjectedName =
  | "configuration"
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
