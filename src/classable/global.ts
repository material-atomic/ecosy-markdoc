 
import {
  Injectable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";
import type { ClassType } from "./types";
import type { StaticExtended } from "./placeholder";

/**
 * Branded type that marks a class as a global singleton.
 *
 * Instances tagged with `__global: true` are intended to persist across
 * the application lifetime (including HMR cycles). The actual backing
 * store is provided by the runtime layer — typically an {@link Anchoribility}
 * channel bound to `globalThis` — not by this package's core.
 */
export type GlobalClassable<T> = T & { readonly __global: true };

/** Options for {@link Global}. Mirrors the inject pattern of {@link Lifecycle}. */
export type GlobalOptions<Injects extends InjectMap = {}> = {
  injects?: Injects;
};

/** Static members exposed on a Global-branded class. */
export interface GlobalStatic {
  readonly __global: true;
}

/**
 * Marks a class as a global singleton with optional dependency injection.
 *
 * Follows the same `extends` pattern as {@link Injectable} and {@link Lifecycle}.
 * The resulting class carries the `__global` brand so that the runtime
 * layer (executor / anchor channel) can distinguish singleton-scoped
 * dependencies from transient ones.
 *
 * **Advisory marker, not enforced behavior.** `__global: true` is a static
 * brand read by the runtime layer. If nothing inspects the flag, there is
 * no automatic singleton behavior —
 * the class will instantiate like any other {@link Injectable}. The brand
 * is a *protocol* between class definition and container, not a self-
 * enforcing lifecycle.
 *
 * **Mutually exclusive with {@link Transient}.** A class cannot be both
 * global and transient; the factory guards against accidental double-
 * branding at construction time.
 *
 * @param options - Optional inject map for dependency resolution.
 * @returns A class constructor branded with `__global: true`.
 *
 * @example
 * ```ts
 * // Simple global singleton
 * class DatabasePool extends Global() {
 *   // ...
 * }
 *
 * // Global with injected dependencies
 * class AuthService extends Global({ injects: { db: DatabasePool } }) {
 *   // this.db is auto-resolved
 * }
 * ```
 */
export function Global<Injects extends InjectMap = {}>(
  options: GlobalOptions<Injects> = {},
) {
  const { injects = {} } = options;

  const Builder = Injectable<Injects>(injects as Injects);

  // Defensive: reject accidental double-branding. See Transient for the
  // symmetric check and rationale.
  if ((Builder as unknown as { __transient?: boolean }).__transient) {
    throw new Error(
      "[Global] Cannot apply Global to a class already branded as Transient. " +
        "`__global` and `__transient` are mutually exclusive scopes.",
    );
  }

  const GlobalBuilder = Builder as ClassType<object> & InjectableBuidlerLike;

  type GlobalBuilderClass = typeof Builder;
  type GlobalClass = GlobalBuilderClass extends StaticExtended<infer StaticBuilder, infer Instance>
    ? StaticExtended<StaticBuilder & GlobalStatic & InjectableBuidlerLike, Instance>
    : StaticExtended<GlobalStatic & InjectableBuidlerLike, InjectedInstances<Injects>>;

  return class GlobalImpl extends GlobalBuilder {
    static readonly __global = true as const;
  } as GlobalClass;
}
