 
import {
  Injectable,
  type InjectClassable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";

export type { InjectClassable };
import type { ClassType } from "./types";
import type { StaticExtended } from "./placeholder";

/**
 * Minimal interface for a request guard.
 * Guards decide whether a request should proceed based on the context.
 *
 * @typeParam Ctx - The request context type.
 */
export interface GuardLike<Ctx = unknown> {
  /** Returns `true` to allow the request, `false` to deny. */
  canActivate(context: Ctx): boolean | Promise<boolean>;
}

/**
 * Minimal interface for a result transformer and error handler.
 *
 * @typeParam Ctx - The request context type.
 * @typeParam ErrorType - The error type for `catch`.
 */
export interface FilterLike<Ctx = unknown, ErrorType = unknown> {
  /** Transforms the result before it is returned to the caller. */
  transform?(result: unknown, context: Ctx): unknown | Promise<unknown>;
  /** Catches and handles errors thrown during execution. */
  catch?(error: ErrorType, context: Ctx): unknown | Promise<unknown>;
}

/**
 * Minimal interface for a value transformation pipe.
 *
 * @typeParam Ctx - The request context type.
 * @typeParam Value - The value type being transformed.
 */
export interface PipeLike<Ctx = unknown, Value = unknown> {
  /** Transforms a value before it reaches the handler. */
  transform(value: Value, context: Ctx): Value | Promise<Value>;
}

/**
 * Minimal interface for a request interceptor.
 * Interceptors wrap the execution pipeline for cross-cutting concerns
 * (logging, caching, timing, etc.).
 *
 * @typeParam Ctx - The request context type.
 */
export interface InterceptorLike<Ctx = unknown> {
  /** Wraps the downstream handler. Call `next()` to proceed. */
  intercept(context: Ctx, next: () => Promise<unknown>): unknown | Promise<unknown>;
}

/**
 * Describes the lifecycle hooks attached to a class.
 * Each hook is an array of classable-resolvable entries.
 */
export interface LifecycleDescriptor {
  /** Guards evaluated before execution. */
  readonly guards: InjectClassable<GuardLike>[];
  /** Filters applied to results and errors. */
  readonly filters: InjectClassable<FilterLike>[];
  /** Interceptors wrapping the execution pipeline. */
  readonly interceptors: InjectClassable<InterceptorLike>[];
  /** Pipes transforming input values. */
  readonly pipes: InjectClassable<PipeLike>[];
}

/**
 * Utility type: a class constructor whose static side
 * exposes a `descriptor` of the given shape.
 */
export type WithDescriptor<
  Descriptor extends LifecycleDescriptor,
  Instance = unknown,
> = StaticExtended<{ descriptor: Descriptor }, Instance>;

/**
 * Options for the {@link Lifecycle} class builder.
 * Combines lifecycle hooks with optional dependency injection.
 */
export type LifecycleOptions<
  Descriptor extends LifecycleDescriptor = LifecycleDescriptor,
  Injects extends InjectMap = {},
> = Partial<Descriptor> & {
  /** Optional inject map (forwarded to {@link Injectable}). */
  injects?: Injects;
};

/** Static members exposed on a Lifecycle-branded class. */
export interface LifecycleStatic<Descriptor extends LifecycleDescriptor> {
  /** The deduplicated lifecycle descriptor. */
  readonly descriptor: Descriptor;
}

/**
 * Creates a class with lifecycle hooks and optional dependency injection.
 *
 * Extends {@link Injectable} and attaches a static `descriptor` containing
 * deduplicated arrays of guards, filters, interceptors, and pipes.
 *
 * @param options - Lifecycle hooks and optional inject map.
 * @returns A class constructor with `descriptor` on the static side
 *          and injected instances on the instance side.
 *
 * @example
 * ```ts
 * class UserController extends Lifecycle({
 *   guards: [AuthGuard],
 *   pipes: [ValidationPipe],
 *   injects: { db: DatabasePool },
 * }) {
 *   // this.db is auto-resolved
 * }
 *
 * UserController.descriptor.guards; // [AuthGuard]
 * ```
 */
export function Lifecycle<
  Descriptor extends LifecycleDescriptor = LifecycleDescriptor,
  Injects extends InjectMap = {},
>(options: LifecycleOptions<Descriptor, Injects>) {
  const { injects = {}, ...descriptor } = options;

  const Builder = Injectable<Injects>(injects as Injects);
  const LifecycleBuilder = Builder as ClassType<object> & InjectableBuidlerLike;

  type LifecycleBuilderClass = typeof Builder;
  type LifecycleClass =
    LifecycleBuilderClass extends StaticExtended<infer StaticBuilder, infer Instance>
      ? StaticExtended<
          StaticBuilder & LifecycleStatic<Descriptor> & InjectableBuidlerLike,
          Instance
        >
      : StaticExtended<
          LifecycleStatic<Descriptor> & InjectableBuidlerLike,
          InjectedInstances<Injects>
        >;

  return class LifecycleImpl extends LifecycleBuilder {
    /**
     * Deduplicated, frozen lifecycle descriptor.
     *
     * **Immutability:** Both the outer descriptor object and each hook array
     * are frozen. `readonly` alone is a TS-only signal — the `Object.freeze`
     * wrapper enforces the contract at runtime, so neither the arrays nor
     * the descriptor shape can be mutated after class definition.
     *
     * **Deduplication:** Hook arrays are deduped via `Set` using **reference
     * equality**. Two entries wrapping the same target class (e.g. two
     * distinct inline factory objects pointing at the same `AuthGuard`) are
     * considered distinct unless they share the same reference. Semantic
     * dedup (by `classable.getTarget`) is intentionally not performed — it
     * would require defining precedence rules and would cost ordering
     * guarantees. If that becomes a real pain point, revisit.
     */
    static readonly descriptor = Object.freeze({
      ...descriptor,
      guards: Object.freeze([...new Set(descriptor.guards ?? [])]),
      filters: Object.freeze([...new Set(descriptor.filters ?? [])]),
      interceptors: Object.freeze([...new Set(descriptor.interceptors ?? [])]),
      pipes: Object.freeze([...new Set(descriptor.pipes ?? [])]),
    }) as Descriptor;
  } as LifecycleClass;
}
