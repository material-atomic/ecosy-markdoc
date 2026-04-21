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

export interface MarkdocConfigurations extends DocumentationInfo, RepositoryInfo {
  strict?: boolean;
  revalidate?: number;
}

export type InjectedName =
  | "configuration"
  | "fetchable"
  | "repo"
  | "documentation"
  | "manifest"
  | "server";

export interface RuntimeAccessor {
  get<LikelyType>(name: InjectedName): LikelyType;
}
