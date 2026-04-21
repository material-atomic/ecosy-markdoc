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
 * Mirrors the inference discipline of `InjectedInstances` in the
 * Injectable layer: one projection, per-token, no `any` on the output.
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
 * Used to type `Executor.run`'s `fn` parameter so that developers get
 * per-position `this.db`-style inference on each argument.
 */
export type ResolvedInstances<Tokens extends Readonlyable<any[]>> = {
  [K in keyof Tokens]: ResolvedInstance<Tokens[K]>;
};

/**
 * Resolves a classable to its identity key.
 *
 * Uses `classable.getTarget` so factories and plain classes map to the
 * same key when they point at the same target — consistent with the
 * identity law used elsewhere in the package (`instanceof || constructor ===`).
 */
function identityKey(dep: unknown): unknown {
  if (typeof dep === "string" || typeof dep === "symbol") return dep;
  return classable.getTarget(dep as Classable<unknown, unknown[], string, unknown>);
}

/**
 * Request-scoped dependency resolver.
 *
 * **Design shift from the earlier `container`-backed version:**
 * `Executor` no longer delegates globals to a separate `ClassableContainer`
 * sitting on `globalThis`. Globals are memoized inside `Executor` itself
 * via a static Map keyed by class target. This keeps a single source of
 * truth for instance identity (the class's own `__instances` registry +
 * Executor's global cache), and avoids duplicating the role that
 * {@link Anchorable} / {@link Anchoribility} are the right long-term home
 * for.
 *
 * **Lifetimes:**
 * - `__global: true`  → cached in `Executor.globals`, reused across runs.
 * - Everything else (explicit `__transient` *or* unbranded) → fresh per
 *   `run()` / `lifecycle()` call, held only in a scoped Map for the
 *   duration of that call, then dropped. `__transient` is a declarative
 *   brand for authors' intent; the runtime check is negative (`!__global`),
 *   so explicit `Transient()` and a plain class behave identically here.
 *   This is deliberate — anything not whitelisted as a singleton is
 *   assumed to be request-scoped.
 *
 * **Identity is per-realm.** Cache lookup uses `classable.getTarget`,
 * which compares class references. A class loaded from two different
 * bundles / workers / iframes produces two distinct targets and therefore
 * two separate global slots. Cross-realm singleton behavior requires an
 * explicit {@link Anchoribility} channel with a stable symbol key —
 * `Executor.globals` is process-and-realm local by design.
 *
 * **Intentional non-goals:**
 * - No HMR persistence. The earlier container stored globals on
 *   `globalThis` to survive bundler reloads; that concern now belongs to
 *   an explicit {@link Anchoribility} channel the caller opts into.
 * - No DI container API (`get` / `set` / `has`). Callers compose
 *   dependencies through `run()` / `lifecycle()`; there is no external
 *   registry to mutate.
 * - No automatic `onDispose` for transient instances. They fall out of
 *   scope on return and become GC-eligible; classes holding native
 *   resources (connections, file handles, streams) should be managed
 *   explicitly by the caller or promoted to `__global` with a disposal
 *   anchor. A dedicated dispose hook at this layer is a deliberate
 *   future extension, not an omission.
 */
export class Executor {
  /**
   * Process-wide cache for `__global` classes. Keyed by the resolved
   * target class (via `classable.getTarget`) so that factory and plain-
   * class references to the same target share one instance.
   *
   * This lives on `Executor` itself, not on `globalThis`. If HMR-resilient
   * or cross-realm singletons are needed, wire a {@link Anchoribility}
   * channel instead — the brand stays the same, only the backing store
   * changes.
   */
  private static readonly globals = new Map<unknown, unknown>();

  /**
   * Removes an entry from the global cache. Intended for test teardown
   * and hot-swap scenarios — not part of the request-handling flow.
   */
  static evict(dep: unknown): boolean {
    return Executor.globals.delete(identityKey(dep));
  }

  /**
   * Clears the entire global cache. Test-only.
   */
  static clearGlobals(): void {
    Executor.globals.clear();
  }

  /**
   * Resolves dependencies, executes a function, and disposes transient
   * instances.
   *
   * Resolution rules per dep:
   * 1. `__global` → look up in `Executor.globals`, create+cache on miss.
   * 2. Otherwise → create fresh, hold in this run's scoped Map, drop on return.
   *
   * Within a single `run()`, the scoped Map deduplicates so a transient
   * class requested twice in the same `deps` list resolves to one instance.
   *
   * @example
   * ```ts
   * await Executor.run(
   *   (db, logger) => db.query("SELECT 1", logger),
   *   [DatabasePool, RequestLogger],
   * );
   * // DatabasePool (__global) cached; RequestLogger (__transient) discarded after.
   * ```
   */
  static async run<
    const Tokens extends Readonlyable<readonly ExecutorDep[]>,
    ReturnType,
    Runtime = never,
  >(
    fn: (...args: ResolvedInstances<Tokens>) => Promisable<ReturnType>,
    deps: Tokens,
    ...runtimeArgs: [Runtime] extends [never] ? [] : [runtime: Runtime]
  ): Promise<ReturnType> {
    const runtime = runtimeArgs[0];
    const scoped = new Map<unknown, unknown>();

    const resolvedArgs = (await Promise.all(
      (deps as unknown as readonly ExecutorDep[]).map((dep) =>
        Executor.resolveDep(dep, scoped, runtime),
      ),
    )) as ResolvedInstances<Tokens>;

    // Execute. Scoped transient Map falls out of scope on return, making
    // those instances eligible for GC without any explicit dispose.
    return await fn(...resolvedArgs);
  }

  /**
   * Runs a class through its full lifecycle pipeline — guards → pipes →
   * (interceptors ∘ handler) → filters → error filters — with the same
   * scope rules as {@link run}.
   *
   * The target is expected to expose either `run()` or `execute()`. All
   * lifecycle hook classes are resolved under the same `scoped` Map, so a
   * transient shared between, say, a guard and a pipe is instantiated once
   * per call.
   */
  static async lifecycle<Runtime = never>(
    TargetClass: ClassType<unknown, any> & { descriptor?: LifecycleDescriptor },
    args: unknown[],
    ...runtimeArgs: [Runtime] extends [never] ? [] : [runtime: Runtime]
  ): Promise<unknown> {
    const runtime = runtimeArgs[0];
    const scoped = new Map<unknown, unknown>();
    const resolve = (dep: ExecutorDep) => Executor.resolveDep(dep, scoped, runtime);

    const descriptor: LifecycleDescriptor = TargetClass.descriptor ?? {
      guards: [],
      pipes: [],
      interceptors: [],
      filters: [],
    };

    try {
      // 1. GUARDS — tuyến đầu, fail-fast.
      for (const guardDep of descriptor.guards ?? []) {
        const guard = (await resolve(guardDep as ExecutorDep)) as {
          canActivate(ctx: unknown): Promisable<boolean>;
        };
        const ok = await guard.canActivate(runtime);
        if (!ok) {
          const name =
            classable.getDescriptor(guardDep as Classable<unknown, unknown[], string, unknown>)
              .target || "Anonymous";
          throw new Error(`Forbidden: Guard ${name} rejected the request`);
        }
      }

      // 2. PIPES — biến đổi input. Convention: chỉ áp vào `args[0]`, các
      //    argument sau pass-through. Phản ánh mental model "payload +
      //    metadata" của hầu hết controller/handler. Nếu cần transform
      //    full tuple hoặc mapping theo index, cần mở rộng PipeLike
      //    contract — không âm thầm đổi nghĩa ở đây.
      const transformedArgs = [...args];
      if (transformedArgs.length > 0) {
        for (const pipeDep of descriptor.pipes ?? []) {
          const pipe = (await resolve(pipeDep as ExecutorDep)) as {
            transform(value: unknown, ctx: unknown): Promisable<unknown>;
          };
          transformedArgs[0] = await pipe.transform(transformedArgs[0], runtime);
        }
      }

      // 3. TARGET — resolve và locate handler method.
      const instance = (await resolve(TargetClass as ExecutorDep)) as Record<string, unknown>;
      const method = (instance.run ?? instance.execute) as
        | ((...callArgs: unknown[]) => unknown)
        | undefined;
      if (typeof method !== "function") {
        const name =
          classable.getDescriptor(TargetClass as Classable<unknown, unknown[], string, unknown>)
            .target || "Anonymous";
        throw new Error(`[Executor] Class ${name} missing run() or execute() method`);
      }

      // 4. INTERCEPTORS ∘ HANDLER — củ hành, wrap từ trong ra ngoài.
      const core = async () => method.apply(instance, transformedArgs);
      const interceptors = descriptor.interceptors ?? [];
      let next: () => Promise<unknown> = core;
      for (let i = interceptors.length - 1; i >= 0; i--) {
        const currentNext = next;
        const interceptor = (await resolve(interceptors[i] as ExecutorDep)) as {
          intercept(ctx: unknown, next: () => Promise<unknown>): Promisable<unknown>;
        };
        next = async () => interceptor.intercept(runtime, currentNext) as Promise<unknown>;
      }
      let result: unknown = await next();

      // 5. FILTERS.transform — biến đổi kết quả thành công.
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
      // 6. FILTERS.catch — dành cho lỗi.
      //
      // Semantic: **last-filter-wins**. Nhiều filter được chạy tuần tự,
      // mỗi filter nhận kết quả của filter trước và có thể trả về một
      // giá trị error hoàn toàn khác. Filter cuối cùng trong danh sách
      // quyết định error cuối cùng được throw. Không có short-circuit
      // và không có "chain of responsibility" — nếu một filter muốn
      // dừng propagation, nó phải ném ra luôn từ `catch()` của nó.
      //
      // Không bắt lỗi riêng của chính `filter.catch()` — đó là lỗi thật
      // trong code của user, phải nổi lên để debug thấy được.
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

  /**
   * Resolves a single dep honoring `__global` / `__transient` brands.
   * Shared by `run()` and `lifecycle()` so both follow identical rules.
   */
  private static async resolveDep(
    dep: ExecutorDep,
    scoped: Map<unknown, unknown>,
    runtime: unknown,
  ): Promise<unknown> {
    const target = classable.getTarget(
      dep as Classable<unknown, unknown[], string, unknown>,
    ) as Record<string, unknown>;
    const key = identityKey(dep);

    // `classable.create`'s statically-typed overloads don't line up with
    // an erased `ExecutorDep` union, but the runtime is safe — the method
    // inspects the dep shape at call time. Cast once, locally, to skip the
    // overload resolution drama without spreading `any` around.
    const createErased = classable.create as (
      dep: ExecutorDep,
      runtime: unknown,
    ) => unknown;

    // GLOBAL — process-wide cache on Executor itself.
    if (target.__global === true) {
      if (Executor.globals.has(key)) {
        return Executor.globals.get(key);
      }
      const instanceOrPromise = createErased(dep, runtime);
      Executor.globals.set(key, instanceOrPromise);
      // On async failure, evict so the next call retries rather than
      // cementing a rejected Promise as "the global".
      if (instanceOrPromise instanceof Promise) {
        instanceOrPromise.catch(() => {
          // Only evict if the stored value is still the same failing Promise —
          // avoids racing with a successful retry that already populated the slot.
          if (Executor.globals.get(key) === instanceOrPromise) {
            Executor.globals.delete(key);
          }
        });
      }
      return await instanceOrPromise;
    }

    // TRANSIENT / unbranded — scoped to this call only.
    if (scoped.has(key)) return scoped.get(key);
    const instanceOrPromise = createErased(dep, runtime);
    scoped.set(key, instanceOrPromise);
    return await instanceOrPromise;
  }
}
