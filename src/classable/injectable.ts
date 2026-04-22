import { classable } from "./classable";
import { pushScope, popScope } from "./inject";
import type { StaticExtended } from "./placeholder";
import type {
  AnyClass,
  AnyConstructor,
  Classable,
  ClassType,
} from "./types";

/**
 * ============================================================================
 * WARNING / TODO — Execution-phase re-entry protection
 * ============================================================================
 * Cycle detection is enforced at KEY LEVEL via `resolvingStack` + `resolvingSet`
 * within a single construction. This covers re-entry that flows through
 * `accessor.get(...)` (the accessor delegates to the same `resolve` closure,
 * so `resolvingSet` traps the cycle).
 *
 * It does NOT cover two production-grade edge cases:
 *
 *   (a) Side-effect bypass: a constructor touches a sibling injection through
 *       a channel other than `accessor.get` (global singleton, event bus,
 *       externally-captured closure). The cycle detector never sees it.
 *
 *   (b) Nested cross-instance construction: during `new X()`, a side-effect
 *       triggers another `new X()` of the same generated class. Both calls
 *       race on the class-level `__instances` registry — each builds its own
 *       `next` Map and overwrites the other on commit.
 *
 * Neither is urgent; both require disciplined user code to trigger. If either
 * surfaces as a real bug, the fix is a class-level construction lock
 * (e.g. `static __constructing: boolean`, or a reentrancy queue) rather than
 * more key-level bookkeeping.
 * ============================================================================
 */

/**
 * A classable entry in an inject map.
 * Either a zero-arg class constructor or a synchronous {@link ClassFactorySync}
 * whose `get()` receives an {@link InjectedAccessor}.
 *
 * @typeParam T - The instance type to inject.
 * @typeParam Injected - The accessor type passed to factory resolvers.
 */
export type InjectClassable<T, Injected = unknown> =
  | ClassType<T, []>
  | InjectFactory<T, Injected>;

/**
 * A factory descriptor for Injectable.
 * Separate from {@link ClassFactorySync} to avoid rest-param union issues
 * (`any[] | readonly any[]` in `new (...args)` breaks contravariance).
 *
 * `get()` may return mutable or readonly arrays (`as const` friendly).
 * `target` accepts any constructor — variance is erased via `any[]`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface InjectFactory<T, Injected> {
  target: new (...args: any[]) => T;
  get?: (runtime: Injected) => readonly any[] | any[];
}

/**
 * Read-only accessor for resolved inject instances.
 * Passed to factory resolvers so they can reference sibling injections.
 *
 * When a `resolver` is provided, `get()` will lazily resolve dependencies
 * on demand rather than requiring a specific declaration order.
 *
 * Exposed so user-written factory resolvers can annotate their selector
 * parameter with a concrete type (`get: (a: InjectedAccessor) => [...]`)
 * instead of relying on the positional inference from `ClassFactorySync`.
 */
export class InjectedAccessor {
  constructor(
    private readonly instances: Map<string, unknown>,
    private readonly resolver?: (key: string) => unknown,
  ) {}

  /**
   * Retrieves an injected instance by key.
   * If the key hasn't been resolved yet and a lazy resolver is available,
   * triggers on-demand resolution (which also detects circular dependencies).
   * Throws if the key does not exist in the inject map.
   *
   * @param key - The injection key (matches the inject map property name).
   */
  get<T = unknown>(key: string): T {
    if (!this.instances.has(key) && this.resolver) {
      return this.resolver(key) as T;
    }
    if (!this.instances.has(key)) {
      throw new Error(`[Injectable] Injection "${key}" does not exist`);
    }
    return this.instances.get(key) as T;
  }

  /** Checks whether an injection exists for the given key. */
  has(key: string) {
    return this.instances.has(key);
  }
}

/**
 * A record mapping injection keys to their {@link InjectClassable} descriptors.
 * Each value is either a class or a factory whose resolver receives
 * an {@link InjectedAccessor}.
 *
 * The value constraint uses `unknown` (not `any`) so writing into the
 * map without a specific instance type widens safely. Concrete inject
 * maps (e.g. `{ db: DatabasePool }`) still keep per-key instance types
 * because `InjectedInstances<Injects>` infers them from the concrete
 * `InjectClassable<Instance>` at each key.
 */
export type InjectMap = {
  [k: string]: InjectClassable<unknown, InjectedAccessor>;
};

/**
 * Lifecycle hook for post-construction initialization.
 * If an injected instance implements `onInit`, it will be called
 * after all injections are resolved.
 */
export interface InjectableOnInit {
  /** Called after construction. May return a Promise for async init. */
  onInit?(): void | Promise<void>;
}

/**
 * Strips the index signature from `T`, keeping only explicitly declared keys.
 * Used internally to clean up mapped types from {@link InjectMap}.
 */
type RemoveIndexSignature<T> = {
  [K in keyof T as {} extends Record<K, unknown> ? never : K]: T[K];
};

/**
 * Maps an {@link InjectMap} to its resolved instance types.
 * The result includes {@link InjectableOnInit} for lifecycle support.
 */
export type InjectedInstances<Injects extends InjectMap> = InjectableOnInit &
  RemoveIndexSignature<{
    [K in keyof Injects]: Injects[K] extends { target: new (...args: any[]) => infer Instance; get?: (...args: any[]) => any }
      ? Instance
      : Injects[K] extends new (...args: any[]) => infer Instance
        ? Instance
        : never;
  }>;

/**
 * Static interface exposed on classes returned by {@link Injectable}.
 * Provides utility methods for lifecycle management.
 */
export interface InjectableBuidlerLike {
  /** Type guard: checks if an object implements {@link InjectableOnInit}. */
  isInitializable(obj: unknown): obj is InjectableOnInit;
  /** Awaits all `onInit()` hooks of the target's injected instances. */
  waitForInjects<Target extends InjectableBuilder>(target: Target): Promise<void>;
  /** Awaits all `onDispose()` hooks of the target's injected instances. */
  disposeInjects<Target extends InjectableBuilder>(target: Target): Promise<void>;
}

/**
 * Abstract base for Injectable-generated classes.
 *
 * The instance registry (`__instances`) is declared as an abstract static here,
 * and must be concretely defined on each class returned by {@link Injectable}.
 *
 * Why static, and why at the child layer?
 * - Instance-level storage makes each `new` start empty — no reconciliation
 *   possible, anti-pattern for a container-like abstraction.
 * - Static-at-Builder would make every Injectable-generated class share one
 *   Map (cross-contamination between unrelated Injectables).
 * - Static-at-Child (per-`Injectable()`-call) gives each unique InjectMap its
 *   own isolated state, while allowing multiple `new` of the same class to
 *   share it — enabling per-key reconciliation via `getTarget + instanceof`.
 */
class InjectableBuilder implements InjectableOnInit {
  /**
   * Abstract static: each Injectable-generated subclass provides its own Map.
   * TypeScript `declare` ensures descendants must initialize it at their layer.
   */
  declare static __instances: Map<string, unknown>;

  /** Optional lifecycle hook, called after construction. */
  onInit?(): void | Promise<void>;

  /** Type guard: checks if an object has an `onInit` method. */
  static isInitializable(obj: unknown): obj is InjectableOnInit {
    return (
      typeof obj === "object" &&
      obj !== null &&
      Object.prototype.hasOwnProperty.call(obj, "onInit") &&
      typeof (obj as Record<"onInit", unknown>).onInit === "function"
    );
  }

  /**
   * Awaits all `onInit()` hooks of the target's injected instances,
   * **in dependency (topological) order**.
   *
   * `__instances` is populated during DFS post-order resolution (dependencies
   * are `set()` into the Map before dependents), so iterating the Map's
   * natural insertion order yields a valid topological sequence.
   *
   * Each hook is awaited sequentially — a dependent will never start
   * initializing before its dependencies finish.
   */
  static async waitForInjects<Target extends InjectableBuilder>(target: Target) {
    const ChildClass = target.constructor as typeof InjectableBuilder;
    for (const instance of ChildClass.__instances.values()) {
      if (this.isInitializable(instance)) {
        const result = instance.onInit?.();
        if (result instanceof Promise) {
          await result;
        }
      }
    }
  }

  /**
   * Awaits all `onDispose()` hooks of the target's injected instances,
   * **in reverse dependency order**.
   *
   * Dependents are disposed before their dependencies, so a dependency
   * is never torn down while something still relies on it.
   */
  static async disposeInjects<Target extends InjectableBuilder>(target: Target) {
    const ChildClass = target.constructor as typeof InjectableBuilder;
    const entries = [...ChildClass.__instances.values()].reverse();
    for (const instance of entries) {
      const hook = (instance as InjectableOnDispose | null)?.onDispose;
      if (typeof hook === "function") {
        const result = hook.call(instance);
        if (result instanceof Promise) {
          await result;
        }
      }
    }
  }
}

export interface InjectableOnDispose {
  onDispose?(): void | Promise<void>;
}

/**
 * Creates a class with auto-resolved dependency injection.
 *
 * Each key in the inject map becomes a property on instances of the
 * returned class. Dependencies are resolved synchronously at construction
 * time via `classable.create()` or factory resolvers.
 *
 * @param injects - A map of injection keys to their classable descriptors.
 * @returns A class constructor with injected properties and static lifecycle utilities.
 *
 * @example
 * ```ts
 * class UserService extends Injectable({
 *   db: DatabasePool,
 *   cache: {
 *     target: RedisCache,
 *     get: (accessor) => [accessor.get("db")] as const,
 *   },
 * }) {
 *   getUser(id: string) {
 *     return this.db.query(`SELECT * FROM users WHERE id = ?`, [id]);
 *   }
 * }
 * ```
 */
export function Injectable<Injects extends InjectMap>(injects: Injects) {
  return class InjectableImpl extends InjectableBuilder {
    /**
     * Per-class instance registry. Defined at the CHILD layer so each
     * `Injectable()` call produces its own isolated static Map.
     *
     * Because `Injectable()` defines a fresh class on every call, each
     * unique inject map owns its own `__instances`. Multiple `new X()`
     * of the same generated class share this Map, enabling per-key
     * reconciliation across re-constructions (HMR, re-mount, etc.).
     */
    static __instances: Map<string, unknown> = new Map<string, unknown>();

    /**
     * The inject definitions this class was created with.
     * Exposed for introspection/debugging (e.g. `inspect()`).
     */
    static __injects: Readonly<Injects> = injects;

    /**
     * Class-level construction lock. Guards against nested cross-instance
     * re-entry: if during `new X()` a side-effect triggers another `new X()`
     * of the same generated class, the second call would race on the shared
     * `__instances` registry and overwrite the first on commit.
     *
     * Declaring this synchronous boundary explicitly turns the race into a
     * loud failure (clear error) instead of a silent state clobber.
     *
     * JS is single-threaded and constructors are sync, so a boolean lock
     * is sufficient — no queue, no mutex primitives needed. The trade-off
     * (no parallel construction of the same class) is a non-issue in the
     * actual runtime model.
     */
    static __constructing: boolean = false;

    constructor() {
      super();

      const Cls = new.target as typeof InjectableImpl;

      if (Cls.__constructing) {
        throw new Error(
          "[Injectable] Re-entrant construction detected: a side-effect inside " +
            "the constructor triggered another `new` of the same class before the " +
            "first construction completed. This races on the class-level registry " +
            "and would silently clobber state. Move side-effects to `onInit()`.",
        );
      }
      Cls.__constructing = true;

      // Everything below runs under the construction lock. The `finally` at
      // the bottom releases the lock regardless of outcome (happy path, cycle
      // detection throw, factory error, etc.) so the class never permanently
      // deadlocks after a failed construction.
      try {

      const previous = Cls.__instances;
      const next = new Map<string, unknown>();

      /** Previous entries already reused — prevents double-consumption during rename matching. */
      const consumedPrev = new Set<string>();

      /** Keys currently being resolved — used for circular dependency detection. */
      const resolvingStack: string[] = [];
      const resolvingSet = new Set<string>();

      /**
       * Attempts to reuse a previously-built instance whose runtime class
       * matches the new target definition. Identity is established via
       * `classable.getTarget()` + `instanceof`, so string keys are not
       * load-bearing — only the underlying class matters.
       *
       * Strategy:
       *  1. Same-key match: prefer the instance previously stored at this key.
       *  2. Cross-key match: otherwise scan remaining previous entries for any
       *     whose constructor matches — this handles the "key rename" scenario
       *     where a developer refactors `foo` → `fooService` without wanting
       *     the DB/cache/etc. underneath to be rebuilt.
       */
      const tryReconcile = (
        key: string,
        TargetDef: AnyConstructor | undefined,
      ): unknown | undefined => {
        if (!TargetDef) return undefined;

        const matches = (candidate: unknown): boolean =>
          candidate instanceof (TargetDef as AnyClass<unknown>) ||
          (candidate as { constructor?: unknown } | null)?.constructor === TargetDef;

        if (previous.has(key) && !consumedPrev.has(key)) {
          const candidate = previous.get(key);
          if (matches(candidate)) {
            consumedPrev.add(key);
            return candidate;
          }
        }

        for (const [prevKey, candidate] of previous) {
          if (consumedPrev.has(prevKey)) continue;
          if (matches(candidate)) {
            consumedPrev.add(prevKey);
            return candidate;
          }
        }

        return undefined;
      };

      /**
       * Lazily resolves an injection by key.
       * - If already resolved in this construction, returns the cached instance.
       * - If currently resolving (in the stack), throws a circular dependency error.
       * - Otherwise, tries reconciliation against previous `__instances`,
       *   then falls back to fresh construction.
       */
      const resolve = (key: string): unknown => {
        if (next.has(key)) {
          return next.get(key);
        }

        if (resolvingSet.has(key)) {
          const cycleStart = resolvingStack.indexOf(key);
          const cycle = [...resolvingStack.slice(cycleStart), key].join(" -> ");
          throw new Error(`[Injectable] Circular dependency detected: ${cycle}`);
        }

        if (!Object.prototype.hasOwnProperty.call(injects, key)) {
          throw new Error(`[Injectable] Injection "${key}" does not exist`);
        }

        resolvingStack.push(key);
        resolvingSet.add(key);

        const value = injects[key];
        const TargetDef = classable.getTarget(
          value as Classable<unknown, unknown[], string, unknown>,
        ) as unknown as AnyConstructor | undefined;

        // Try to reuse a compatible instance from the previous generation.
        let instance: unknown = tryReconcile(key, TargetDef);

        if (instance === undefined) {
          if (classable.isFactory<unknown, unknown[], string, InjectedAccessor>(value)) {
            const args = value.get?.(lazyAccessor) ?? [];

            if (args instanceof Promise) {
              throw new Error(`[Injectable] Async selector not supported for "${key}"`);
            }

            instance = new value.target(...(args as unknown[]));
          } else if (classable.is(value)) {
            instance = classable.create(value as ClassType<unknown, []>);
          }
        }

        resolvingStack.pop();
        resolvingSet.delete(key);

        // `configurable: true` allows tests and mocking layers to replace the
        // resolved instance via `Object.defineProperty` without the property
        // becoming a sealed dead-end.
        Object.defineProperty(this, key, {
          value: instance,
          enumerable: true,
          configurable: true,
        });

        next.set(key, instance);

        return instance;
      };

      /**
       * Lazy accessor used during construction.
       * When a factory calls `accessor.get("B")`, it triggers on-demand
       * resolution of B regardless of declaration order.
       */
      const lazyAccessor = new InjectedAccessor(next, resolve);

      // Bridge Inject default params → Injectable's resolve().
      // During this loop, any `Inject(key)` call from a constructor
      // routes through this scope's `resolve` for proper lazy + cycle-safe
      // resolution. Stack-based so nested Injectables don't clobber each other.
      pushScope({
        hasKey: (k) => Object.prototype.hasOwnProperty.call(injects, k),
        resolve,
      });

      // Resolve all declared injections (order-independent thanks to lazy resolution).
      for (const key of Object.keys(injects)) {
        resolve(key);
      }

      // Best-effort cleanup of orphans — entries in `previous` that were not
      // reconciled into `next`. Calling `onDispose` synchronously here avoids
      // silent memory leaks when developers forget to invoke `disposeInjects`
      // before reconstruction. Promise results are intentionally ignored:
      // the constructor cannot await, and partial async cleanup is still
      // better than none.
      for (const [prevKey, orphan] of previous) {
        if (consumedPrev.has(prevKey)) continue;
        if (orphan && typeof (orphan as InjectableOnDispose).onDispose === "function") {
          try {
            (orphan as InjectableOnDispose).onDispose?.();
          } catch (error) {
            // Swallow so one orphan's failure does not block others or the
            // constructor itself — but surface via `console.warn` so the
            // error stays debuggable instead of vanishing silently.
             
            console.warn(
              `[Injectable] Orphan dispose failed for key "${prevKey}":`,
              error,
            );
          }
        }
      }

      // Replace the class-level registry with the newly reconciled map.
      Cls.__instances = next;

      } finally {
        // Pop this scope so nested Injectables don't leak their resolver.
        popScope();

        // Release the construction lock in `finally` so a throw anywhere
        // above (cycle detection, factory error, orphan loop) still unblocks
        // the class for future construction attempts.
        Cls.__constructing = false;
      }
    }
  } as StaticExtended<InjectableBuidlerLike, InjectedInstances<Injects>>;
}
