import { Inject } from "./executor";
import { Serialize } from "@ecosy/core/serialize";
import type { Repository } from "./repo";
import type { DocumentationInfo, RepositoryInfo } from "./common";
import type { LiteralObject } from "@ecosy/core/types";

export type DispatchURLOptions = LiteralObject & RepositoryInfo & DocumentationInfo;

/**
 * Partial update payload for `DocumentationLike.configure()`.
 * Only fields present on the object are applied — others are left
 * untouched. An empty-string / `null` value resets that particular
 * field to its hard-coded default (jsDelivr shape).
 */
export interface DocumentationConfigureOptions {
  provider?: string | null;
  interpolate?: string | null;
}

export interface DocumentationLike {
  readonly provider: string;
  readonly interpolate: string;
  getContentUrl<Params extends LiteralObject>(params?: Params): string;

  /**
   * Live-update `provider` and/or `interpolate` without restarting the
   * runtime. Dev tools such as the Markdash dashboard call this to flip
   * between the default CDN (jsDelivr, cached ~24h) and a zero-cache
   * alternative (raw.githubusercontent) while iterating on content.
   *
   * Pages cached in `Pagable` are **not** cleared by this call — callers
   * that want the next request to hit the new source should invalidate
   * the page cache themselves (`pagable.clear()`).
   */
  configure(options: DocumentationConfigureOptions): void;

  /**
   * Restore `provider` and `interpolate` to the values captured at
   * construction time — which are the values read from the original
   * `markdoc(config)` call. If the config set neither, this falls back
   * to `DEFAULT_PROVIDER` / `DEFAULT_INTERPOLATE`.
   */
  reset(): void;
}

export interface DocumentationConstructor {
  readonly DEFAULT_PROVIDER: string;
  readonly DEFAULT_INTERPOLATE: string;
  new (): DocumentationLike;
}

export function Documentation(options: DocumentationInfo): DocumentationConstructor {
  class DocumentationNode implements DocumentationLike {
    static readonly DEFAULT_PROVIDER = "https://cdn.jsdelivr.net/gh";
    static readonly DEFAULT_INTERPOLATE = "{provider}/{repo}{branch}{dir}{path}";

    // Snapshot the construction-time values so `reset()` can restore
    // whatever the consumer actually configured — not a hard-coded
    // jsDelivr default (which would erase any custom provider set in
    // `markdoc({ provider: ... })`).
    private readonly initialProvider = options.provider || DocumentationNode.DEFAULT_PROVIDER;
    private readonly initialInterpolate =
      options.interpolate || DocumentationNode.DEFAULT_INTERPOLATE;

    private _provider: string = this.initialProvider;
    private _interpolate: string = this.initialInterpolate;

    constructor(private readonly repo = Inject<Repository>("repo")) {}

    get provider(): string {
      return this._provider;
    }

    get interpolate(): string {
      return this._interpolate;
    }

    configure(opts: DocumentationConfigureOptions): void {
      // `undefined` — no change. Explicit empty / null — reset that field
      // to the hard-coded default.
      if (opts.provider !== undefined) {
        this._provider = opts.provider || DocumentationNode.DEFAULT_PROVIDER;
      }
      if (opts.interpolate !== undefined) {
        this._interpolate = opts.interpolate || DocumentationNode.DEFAULT_INTERPOLATE;
      }
    }

    reset(): void {
      this._provider = this.initialProvider;
      this._interpolate = this.initialInterpolate;
    }

    getContentUrl<Params extends LiteralObject>(params: Params = {} as Params) {
      let branch = this.repo.branch ?? (params as RepositoryInfo).branch;
      let dir = this.repo.dir ?? (params as RepositoryInfo).dir;

      if (branch && !branch.includes("@")) {
        branch = `@${branch}`;
      }

      if (dir && !dir.startsWith("/")) {
        dir = `/${dir}`;
      }

      const finalParams = Object.assign(
        {},
        {
          provider: this._provider,
          repo: `${this.repo.repo}`,
        },
        params,
        { branch, dir },
      );

      let path = (params as { path?: string }).path ?? "";
      if (path && !path.startsWith("/")) {
        path = `/${path}`;
      }

      return Serialize.interpolate(this._interpolate, {
        ...finalParams,
        path,
      });
    }
  }

  return DocumentationNode;
}
