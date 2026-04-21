import { LiteralObject, Serialize } from "@ecosy/core";
import { DocumentationInfo, RepositoryInfo, RuntimeAccessor } from "./common";
import { ConfigurationLike } from "./configuration";
import { Repository } from "./repo";

export type DispatchURLOptions = LiteralObject & RepositoryInfo & DocumentationInfo;

export interface DocumentationLike {
  readonly provider: string;
  getContentUrl<Params extends LiteralObject>(params?: Params): string;
}

export function Documentation(options: DocumentationInfo) {
  class DocumentationNode {
    static readonly DEFAULT_PROVIDER = "https://cdn.jsdelivr.net/gh";
    readonly provider = options.provider || DocumentationNode.DEFAULT_PROVIDER;
  
    constructor(private readonly repo: Repository) {}

    getContentUrl<Params extends LiteralObject>(params: Params = {} as Params) {
      let branch = this.repo.branch ?? (params as RepositoryInfo).branch;
      let dir = this.repo.dir ?? (params as RepositoryInfo).dir;

      if (branch && !branch.includes("@")) {
        branch = `@${branch}`;
      }

      if (dir && !dir.startsWith("/")) {
        dir = `/${dir}`;
      }

      const finalParams = Object.assign({}, {
        provider: this.provider,
        repo: `${this.repo.repo}`,
      }, params, { branch, dir });

      return Serialize.interpolate(`{provider}/{repo}{branch}{dir}`, finalParams);
    }
  }

  return {
    target: DocumentationNode,
    get: (accessor: RuntimeAccessor) => {
      return [accessor.get<Repository>("repo")] as const;
    }
  };
}
