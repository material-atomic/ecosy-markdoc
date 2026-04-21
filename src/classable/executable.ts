/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Promisable } from "./built-in";
import { classable } from "./classable";
import type { LifecycleDescriptor } from "./lifecycle";
import type {
  Classable,
  ClassFactory,
  ClassFactoryAsync,
  ClassFactorySync,
  ClassType,
  Readonlyable,
} from "./types";

// ─── Re-export dep/resolution types from Executor ───────────────────────
// These are the same shapes Executor already defined. Executable is the
// successor, so it re-exports them so consumers don't have to import
// two modules during migration.

/**
 * A classable-ish dep the executor knows how to resolve.
 * Widely-compatible token shape — plain classes, sync factories, async
 * factories, or erased classables all satisfy this.
 */
export type ExecutorDep =
  | Classable<unknown, any, string, any>
  | ClassFactory<unknown, any, string, any>
  | ClassFactorySync<unknown, any, string, any>
  | ClassFactoryAsync<unknown, any, string, any>;

/**
 * Maps a dep token to the instance type it resolves to.
 */
export type ResolvedInstance<T> =
  T extends ClassFactoryAsync<infer I, any, any, any> ? I :
  T extends ClassFactorySync<infer I, any, any, any> ? I :
  T extends ClassFactory<infer I, any, any, any> ? I :
  T extends abstract new (...args: any[]) => infer I ? I :
  T extends new (...args: any[]) => infer I ? I :
  unknown;

/**
 * Maps a tuple of dep tokens to the tuple of their resolved instance types.
 */
export type ResolvedInstances<Tokens extends Readonlyable<any[]>> = {
  [K in keyof Tokens]: ResolvedInstance<Tokens[K]>;
};

/**
 * Resolves a classable to its identity key via `classable.getTarget`.
 */
function identityKey(dep: unknown): unknown {
  if (typeof dep === "string" || typeof dep === "symbol") return dep;
  return classable.getTarget(dep as Classable<unknown, unknown[], string, unknown>);
}

// ─── Erased create helper ───────────────────────────────────────────────
// `classable.create`'s overloads don't align with an erased `ExecutorDep`
// union. This casts once, locally, so the call sites stay clean.
const createErased = classable.create.bind(classable) as (
  dep: ExecutorDep,
  runtime: unknown,
) => unknown;

// ─── Types for the Teleport class accepted by Executable ────────────────

/**
 * Minimal structural contract for the Teleport class argument.
 * Must be `new`-able (zero args). The `__instances` Map is an internal
 * detail of {@link Teleportable} / {@link Injectable} that is NOT
 * exposed on the public type surface ({@link TeleportabilityLike}).
 * Executable accesses it at runtime via an internal cast.
 */
type TeleportSource = new () => object;

/** Runtime-only view used inside ensureInitialized(). */
type TeleportSourceInternal = TeleportSource & {
  __instances?: Map<string, unknown>;
};

/**
 * The static interface returned by {@link Executable}.
 * Mirrors the old `Executor` surface so migration is drop-in.
 */
export interface ExecutableStatic {
  /**
   * Resolves dependencies, executes a function, disposes transient scope.
   */
  run<
    const Tokens extends Readonlyable<readonly ExecutorDep[]>,
    Return,
    Runtime = never,
  >(
    fn: (...args: ResolvedInstances<Tokens>) => Promisable<Return>,
    deps: Tokens,
    ...runtimeArgs: [Runtime] extends [never] ? [] : [runtime: Runtime]
  ): Promise<Return>;

  /**
   * Runs a class through its full lifecycle pipeline.
   */
  lifecycle<Runtime = never>(
    TargetClass: ClassType<unknown, any> & { descriptor?: LifecycleDescriptor },
    args: unknown[],
    ...runtimeArgs: [Runtime] extends [never] ? [] : [runtime: Runtime]
  ): Promise<unknown>;

  /**
   * Removes an entry from the global cache. For test teardown / hot-swap.
   */
  evict(dep: unknown): boolean;

  /**
   * Clears the entire global cache and forces re-initialization from
   * the Teleport on next access. Test-only.
   */
  clearGlobals(): void;
}

/**
 * `Executable(TeleportClass)` — the Teleport-backed successor to `Executor`.
 *
 * ### Why this exists
 *
 * The static `Executor` class kept a private `globals: Map` that duplicated
 * the work {@link Anchorable} / {@link Anchoribility} / {@link Teleportable}
 * already do — manage cross-boundary singleton identity. `Executable` removes
 * that duplication: the Teleport IS the global cache. A dep marked
 * `__global: true` is expected to already live in the Teleport's instance
 * pool (declared as an `inject`). A `__global` dep missing from the pool is
 * a configuration error — the developer forgot to declare it.
 *
 * ### How it works
 *
 * 1. **Lazy init.** On first `run()` or `lifecycle()`, `Executable`
 *    instantiates the Teleport class (`new TeleportClass()`) once. The
 *    constructor in {@link Teleportable} gathers Yang (teleported) and Yin
 *    (native) instances — all become available as globals.
 *
 * 2. **Global indexing.** Instance values are indexed by class target
 *    (`value.constructor`) into an internal `Map`. When `resolveDep` sees
 *    a `__global` dep, it looks up this index. If the dep is missing, it
 *    throws with an actionable message ("declare this inject in your
 *    Teleport").
 *
 * 3. **Transient / unbranded deps.** Anything without `__global: true`
 *    is created fresh via `classable.create`, held in a per-call scoped
 *    Map (deduplicating within a single `run()` / `lifecycle()`), and
 *    dropped on return — identical to `Executor`'s existing behavior.
 *
 * 4. **Lifecycle pipeline.** Guards → pipes → (interceptors ∘ handler) →
 *    filters → error filters. Unchanged from `Executor.lifecycle`, just
 *    wired through the Teleport-backed `resolveDep`.
 *
 * ### Migration from static `Executor`
 *
 * ```ts
 * // Before:
 * import { Executor } from "@ecosy/classable";
 * await Executor.run(fn, [DbPool, Logger]);
 *
 * // After:
 * import { Executable, Teleportability } from "@ecosy/classable";
 *
 * const AppTeleport = Teleportability({
 *   key: Symbol.for("app:container"),
 *   injects: { db: DbPool, logger: Logger },
 * });
 * export const Executor = Executable(AppTeleport);
 *
 * await Executor.run(fn, [DbPool, Logger]);
 * ```
 *
 * ### Design decisions
 *
 * - **Strict globals.** A `__global` dep not found in the Teleport is an
 *   error, not a silent cache-and-continue. This enforces "everything is
 *   definition" — the Teleport declares the full dependency graph up front.
 *   If you need ad-hoc globals, declare them in the Teleport.
 *
 * - **No `clearGlobals` footgun.** `clearGlobals()` exists for test
 *   teardown but it also sets `initialized = false`, so the next access
 *   re-instantiates the Teleport. This means tests can reset global state
 *   cleanly without restarting the process.
 *
 * - **Class identity, not instance identity.** The global index maps
 *   `constructor → instance`. If two different classes produce instances
 *   whose `constructor` property points to the same function (e.g. via
 *   prototype chain tricks), they'll collide. Don't do that.
 *
 * @param Source - A Teleportable / Teleportability class to use as global pool.
 */
export function Executable(
  Source: TeleportSource,
): ExecutableStatic {
  // ─── Lazy global pool ───────────────────────────────────────────────
  let initialized = false;
  /** Maps class target (via `value.constructor`) → instance. */
  const globalCache = new Map<unknown, unknown>();

  /**
   * Instantiate the Teleport and index its instances for O(1) lookup.
   * Runs once, lazily, on first `run()` / `lifecycle()`.
   */
  function ensureInitialized(): void {
    if (initialized) return;

    // `new Source()` triggers Teleportable's constructor, which gathers
    // Yang (teleported from getways) and Yin (locally created) instances,
    // then writes them into the class-level `__instances` Map.
    const teleport = new Source();

    // `__instances` is an internal detail of Teleportable/Injectable —
    // not on the public type surface. Access via runtime cast.
    const internal = Source as TeleportSourceInternal;
    const instances: Map<string, unknown> =
      internal.__instances ?? new Map<string, unknown>();

    // Also harvest own enumerable properties from the instance itself.
    // Teleportable's constructor defines inject results as own properties
    // on `this`, so they're accessible here even if `__instances` were
    // somehow unavailable (defensive).
    for (const [key, val] of Object.entries(teleport)) {
      if (!instances.has(key)) {
        instances.set(key, val);
      }
    }

    // Index by class target. We map each instance to its `constructor`
    // (the class target) so `identityKey(dep)` lookups work uniformly.
    for (const [, instance] of instances) {
      if (
        instance &&
        typeof instance === "object" &&
        typeof (instance as { constructor?: unknown }).constructor === "function" &&
        (instance as { constructor: unknown }).constructor !== Object
      ) {
        const target = (instance as { constructor: new (...args: any[]) => unknown }).constructor;
        globalCache.set(target, instance);

        // If the class has a prototype chain (Injectable → Placeholder),
        // also register under the superclass so `identityKey` resolves
        // polymorphic lookups. Walk one level only — deep chains are
        // diminishing returns and risk false matches.
        const proto = Object.getPrototypeOf(target);
        if (
          proto &&
          proto !== Function.prototype &&
          proto !== Object &&
          !globalCache.has(proto)
        ) {
          globalCache.set(proto, instance);
        }
      }
    }

    initialized = true;
  }

  /**
   * Resolves a single dep honoring `__global` / transient brands.
   */
  async function resolveDep(
    dep: ExecutorDep,
    scoped: Map<unknown, unknown>,
    runtime: unknown,
  ): Promise<unknown> {
    const target = classable.getTarget(
      dep as Classable<unknown, unknown[], string, unknown>,
    ) as Record<string, unknown>;
    const key = identityKey(dep);

    // ── GLOBAL ──────────────────────────────────────────────────────
    if (target.__global === true) {
      if (globalCache.has(key)) {
        return globalCache.get(key);
      }

      // Strict mode: the Teleport must declare all globals.
      // Fallback: create + cache, same as old Executor, so migration
      // isn't a cliff. Emit a warning so the developer knows to
      // declare the inject properly.
      console.warn(
        `[Executable] Global dep "${String((target as { name?: string }).name ?? key)}" ` +
          `not found in Teleport pool. Creating ad-hoc — declare it in your ` +
          `Teleport's injects for correctness.`,
      );
      const instanceOrPromise = createErased(dep, runtime);
      globalCache.set(key, instanceOrPromise);
      if (instanceOrPromise instanceof Promise) {
        instanceOrPromise.catch(() => {
          if (globalCache.get(key) === instanceOrPromise) {
            globalCache.delete(key);
          }
        });
      }
      return await instanceOrPromise;
    }

    // ── TRANSIENT / UNBRANDED ───────────────────────────────────────
    if (scoped.has(key)) return scoped.get(key);
    const instanceOrPromise = createErased(dep, runtime);
    scoped.set(key, instanceOrPromise);
    return await instanceOrPromise;
  }

  // ─── The returned static class ────────────────────────────────────────
  return class ExecutableRuntime {
    static async run<
      const Tokens extends Readonlyable<readonly ExecutorDep[]>,
      Return,
      Runtime = never,
    >(
      fn: (...args: ResolvedInstances<Tokens>) => Promisable<Return>,
      deps: Tokens,
      ...runtimeArgs: [Runtime] extends [never] ? [] : [runtime: Runtime]
    ): Promise<Return> {
      ensureInitialized();
      const runtime = runtimeArgs[0];
      const scoped = new Map<unknown, unknown>();

      const resolvedArgs = (await Promise.all(
        (deps as unknown as readonly ExecutorDep[]).map((dep) =>
          resolveDep(dep, scoped, runtime),
        ),
      )) as ResolvedInstances<Tokens>;

      return await fn(...resolvedArgs);
    }

    static async lifecycle<Runtime = never>(
      TargetClass: ClassType<unknown, any> & { descriptor?: LifecycleDescriptor },
      args: unknown[],
      ...runtimeArgs: [Runtime] extends [never] ? [] : [runtime: Runtime]
    ): Promise<unknown> {
      ensureInitialized();
      const runtime = runtimeArgs[0];
      const scoped = new Map<unknown, unknown>();
      const resolve = (dep: ExecutorDep) => resolveDep(dep, scoped, runtime);

      const descriptor: LifecycleDescriptor = TargetClass.descriptor ?? {
        guards: [],
        pipes: [],
        interceptors: [],
        filters: [],
      };

      try {
        // 1. GUARDS — fail-fast.
        for (const guardDep of descriptor.guards ?? []) {
          const guard = (await resolve(guardDep as ExecutorDep)) as {
            canActivate(ctx: unknown): Promisable<boolean>;
          };
          const ok = await guard.canActivate(runtime);
          if (!ok) {
            const name =
              classable.getDescriptor(
                guardDep as Classable<unknown, unknown[], string, unknown>,
              ).target || "Anonymous";
            throw new Error(`Forbidden: Guard ${name} rejected the request`);
          }
        }

        // 2. PIPES — transform input. Convention: only args[0].
        const transformedArgs = [...args];
        if (transformedArgs.length > 0) {
          for (const pipeDep of descriptor.pipes ?? []) {
            const pipe = (await resolve(pipeDep as ExecutorDep)) as {
              transform(value: unknown, ctx: unknown): Promisable<unknown>;
            };
            transformedArgs[0] = await pipe.transform(transformedArgs[0], runtime);
          }
        }

        // 3. TARGET — resolve and locate handler method.
        const instance = (await resolve(TargetClass as ExecutorDep)) as Record<
          string,
          unknown
        >;
        const method = (instance.run ?? instance.execute) as
          | ((...callArgs: unknown[]) => unknown)
          | undefined;
        if (typeof method !== "function") {
          const name =
            classable.getDescriptor(
              TargetClass as Classable<unknown, unknown[], string, unknown>,
            ).target || "Anonymous";
          throw new Error(
            `[Executable] Class ${name} missing run() or execute() method`,
          );
        }

        // 4. INTERCEPTORS ∘ HANDLER — onion, wrap inside-out.
        const core = async () => method.apply(instance, transformedArgs);
        const interceptors = descriptor.interceptors ?? [];
        let next: () => Promise<unknown> = core;
        for (let i = interceptors.length - 1; i >= 0; i--) {
          const currentNext = next;
          const interceptor = (await resolve(interceptors[i] as ExecutorDep)) as {
            intercept(
              ctx: unknown,
              next: () => Promise<unknown>,
            ): Promisable<unknown>;
          };
          next = async () =>
            interceptor.intercept(runtime, currentNext) as Promise<unknown>;
        }
        let result: unknown = await next();

        // 5. FILTERS.transform — transform successful result.
        for (const filterDep of descriptor.filters ?? []) {
          const filter = (await resolve(filterDep as ExecutorDep)) as {
            transform?(result: unknown, ctx: unknown): Promisable<unknown>;
            catch?(error: unknown, ctx: unknown): Promisable<unknown>;
          };
          if (typeof filter.transform === "function") {
            result = await filter.transform(result, runtime);
          }
        }

        return result;
      } catch (error) {
        // 6. FILTERS.catch — last-filter-wins error handling.
        let finalError: unknown = error;
        for (const filterDep of descriptor.filters ?? []) {
          const filter = (await resolve(filterDep as ExecutorDep)) as {
            catch?(error: unknown, ctx: unknown): Promisable<unknown>;
          };
          if (typeof filter.catch === "function") {
            finalError = await filter.catch(finalError, runtime);
          }
        }
        throw finalError;
      }
    }

    static evict(dep: unknown): boolean {
      return globalCache.delete(identityKey(dep));
    }

    static clearGlobals(): void {
      globalCache.clear();
      initialized = false;
    }
  } as unknown as ExecutableStatic;
}
