 
import {
  Injectable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";
import type { ClassType } from "./types";
import type { StaticExtended } from "./placeholder";

export type TransientClassable<T> = T & { readonly __transient: true };

/** Options for {@link Transient}. Mirrors the inject pattern of {@link Lifecycle}. */
export type TransientOptions<Injects extends InjectMap = {}> = {
  injects?: Injects;
};

/** Static members exposed on a Transient-branded class. */
export interface TransientStatic {
  readonly __transient: true;
}

/**
 * Marks a class as a transient module with optional dependency injection.
 *
 * Unlike {@link Global}, transient classes are intended to be instantiated
 * fresh per execution unit — typically one HTTP request, job, pipeline run,
 * or comparable bounded flow — and allowed to be garbage-collected when the
 * unit ends. The exact boundary is not defined here.
 *
 * **Advisory marker, not enforced behavior.** `__transient: true` is a
 * static brand read by the runtime layer at run time. If the
 * surrounding runtime doesn't inspect the flag, instances will behave
 * indistinguishably from a plain {@link Injectable} — no hidden pooling,
 * no automatic per-request scoping. The brand is a *protocol* between
 * class definition and execution layer, not a self-enforcing lifecycle.
 *
 * **Mutually exclusive with {@link Global}.** A class cannot be both
 * transient and global; the factory guards against accidental double-
 * branding at construction time.
 *
 * @param options - Optional inject map for dependency resolution.
 * @returns A class constructor branded with `__transient: true`.
 *
 * @example
 * ```ts
 * // Simple transient action
 * class MailAction extends Transient() {
 *   // ...
 * }
 *
 * // Transient with auto-injected Global databases
 * class LoginAction extends Transient({ injects: { db: DatabasePool } }) {
 *   // this.db is auto-resolved, while this object itself is short-lived!
 * }
 * ```
 */
export function Transient<Injects extends InjectMap = {}>(options: TransientOptions<Injects> = {}) {
  const { injects = {} } = options;

  const Builder = Injectable<Injects>(injects as Injects);

  // Defensive: reject accidental double-branding. Under normal usage
  // `Injectable({})` returns a clean builder with neither brand, so this
  // only fires if someone has manually grafted `__global` onto an
  // intermediate class. Cheap check, avoids a silent ambiguous class.
  if ((Builder as unknown as { __global?: boolean }).__global) {
    throw new Error(
      "[Transient] Cannot apply Transient to a class already branded as Global. " +
        "`__global` and `__transient` are mutually exclusive scopes.",
    );
  }

  const TransientBuilder = Builder as ClassType<object> & InjectableBuidlerLike;

  type TransientBuilderClass = typeof Builder;
  type TransientClass =
    TransientBuilderClass extends StaticExtended<infer StaticBuilder, infer Instance>
      ? StaticExtended<StaticBuilder & TransientStatic & InjectableBuidlerLike, Instance>
      : StaticExtended<TransientStatic & InjectableBuidlerLike, InjectedInstances<Injects>>;

  return class TransientImpl extends TransientBuilder {
    static readonly __transient = true as const;
  } as TransientClass;
}
