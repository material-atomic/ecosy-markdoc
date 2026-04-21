import { clone } from "@ecosy/core";
import { RepositoryInfo, RuntimeAccessor } from "./common";
import { ConfigurationLike } from "./configuration";

export class Repository {
  constructor(private readonly info: RepositoryInfo) {}

  get repo() {
    return this.info.repo;
  }

  get branch() {
    return this.info.branch;
  }

  get dir() {
    return this.info.dir;
  }

  parse(repo: string) {
    const match = repo.match(/^(?:github:)?([^\/]+)\/([^@]+)(?:@(.+))?$/);
    if (!match) return null;

    const [, username, repository, branch] = match;
    return {
      username,
      repository,
      branch,
    };
  }
}

export const Repo = {
  target: Repository,
  get: (accessor: RuntimeAccessor) => {
    const config = accessor.get<ConfigurationLike>("configuration");
    return [clone(config.options)];
  },
};


