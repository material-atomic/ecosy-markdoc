import { clone } from "@ecosy/core/utilities";
import type { RepositoryInfo, RuntimeAccessor } from "./common";
import type { ConfigurationLike } from "./configuration";

export class Repository {
  constructor(private readonly info: RepositoryInfo) {}

  get repo() {
    return this.info.repo.replace(/^github\.com:/, "");
  }

  get branch() {
    return this.info.branch;
  }

  get dir() {
    return this.info.dir;
  }

  parse(repo: string) {
    const match = repo.match(/^(?:github\.com:)?([^/]+)\/([^@]+)(?:@(.+))?$/);
    if (!match) return null;

    const [, username, repository, branch] = match;
    return {
      username,
      repository,
      branch,
    };
  }
}

export const Repo: {
  target: typeof Repository;
  get: (accessor: RuntimeAccessor) => readonly [RepositoryInfo];
} = {
  target: Repository,
  get: (accessor) => {
    const config = accessor.get<ConfigurationLike>("configuration");
    return [clone(config.options)] as const;
  },
};
