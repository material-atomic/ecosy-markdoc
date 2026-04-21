import {
  Injectable,
  type InjectableBuidlerLike,
  type InjectedInstances,
  type InjectMap,
} from "./injectable";
import type { StaticExtended } from "./placeholder";

/**
 * Optional shape: classes that can release resources on dispose.
 */
interface DisposableTeleport {
  onDispose?(): void | Promise<void>;
}

export interface TeleportabilityOptions<Injects extends InjectMap = {}> {
  injects: Injects;
  key: string | symbol;
  target?: Record<string | symbol, unknown>;
}

export type TeleportabilityLike<Injects extends InjectMap = {}> =
  StaticExtended<InjectableBuidlerLike, InjectedInstances<Injects>> & {
    /**
     * Push additional or replacement injects into the runtime.
     * Mutates the same `injects` object that `Injectable()` closed over,
     * so calls before `new Runtime()` are visible to the constructor's
     * `Object.keys(injects)` loop.
     *
     * Overwrites existing keys. Designed for late-binding config, HMR
     * re-registration, or incremental composition.
     */
    inject(state: Partial<Injects>): void;
    dispose(): void;
    readonly injects: Readonly<InjectMap>;

    /**
     * Lazily-constructed Runtime instance.
     * First access triggers `new Runtime()` which resolves all injects.
     * Subsequent accesses return the cached instance.
     * `dispose()` clears the cache so next access re-constructs.
     */
    readonly instance: InjectedInstances<Injects>;

    /**
     * Shortcut: get a specific resolved inject by key.
     * Accepts both declared keys (autocomplete) and late-bound keys
     * pushed via `inject()` after creation.
     */
    get<T = unknown>(key: keyof Injects | (string & {})): T;
  };

// ─── Internal registry ───────────────────────────────────────────────
// Maps each registered key to the mutable injects object that the
// Injectable closure reads from. `inject()` writes here;
// the Injectable constructor reads from the same reference.
const injectsRegistry = new Map<string | symbol, InjectMap>();

function getTarget<Injects extends InjectMap>(
  options: TeleportabilityOptions<Injects>,
) {
  return (options.target ??
    (typeof globalThis !== "undefined" ? globalThis : {})) as Record<
    string | symbol,
    unknown
  >;
}

/**
 * Resolves the Runtime class registered at `options.key`.
 * First-write-wins: only the first call installs the Runtime.
 *
 * Key difference from the old Teleportable-based approach:
 * the runtime IS an `Injectable(mutableInjects)`. All injects live in
 * one Injectable scope, so `InjectedAccessor` resolves cross-dependencies
 * between sibling injects automatically — no manual service locator needed.
 *
 * The `injects` object is a **mutable shallow copy** stored in
 * `injectsRegistry`. Later `inject(state)` calls mutate the same object,
 * so the Injectable constructor (which closes over it) sees updated
 * tokens when it eventually runs.
 */
function getRuntime<Injects extends InjectMap>(
  options: TeleportabilityOptions<Injects>,
) {
  const { key } = options;
  const target = getTarget(options);

  if (!target[key]) {
    // Mutable copy — Injectable closes over this reference.
    // inject() writes to it; constructor reads from it.
    const mutableInjects = { ...options.injects } as Injects;
    injectsRegistry.set(key, mutableInjects);

    // Injectable IS the runtime. When `new Runtime()` is called,
    // all injects are resolved in one scope — accessor handles cross-deps.
    target[key] = Injectable(mutableInjects);
  }

  return target[key] as ReturnType<typeof Injectable<Injects>>;
}

/**
 * Merges `state` into the mutable injects object for the given key.
 * Because the Injectable constructor reads from the same object
 * reference, tokens pushed here before instantiation are visible
 * to the constructor's resolution loop.
 */
function injectState<Injects extends InjectMap>(
  key: string | symbol,
  state: Partial<Injects>,
) {
  const mutable = injectsRegistry.get(key);
  if (mutable) {
    Object.assign(mutable, state);
  }
}

function dispose<Injects extends InjectMap>(
  options: TeleportabilityOptions<Injects>,
) {
  const { key } = options;
  const target = getTarget(options);
  const runtime = target[key] as DisposableTeleport | undefined;

  if (runtime) {
    if (typeof runtime.onDispose === "function") {
      try {
        runtime.onDispose();
      } catch (error) {
        console.warn(
          `[Teleportability] Runtime dispose failed for key "${String(key)}":`,
          error,
        );
      }
    }
    delete target[key];
  }

  injectsRegistry.delete(key);
}

export function Teleportability<Injects extends InjectMap = {}>(
  options: TeleportabilityOptions<Injects>,
): TeleportabilityLike<Injects> {
  const Runtime = getRuntime(options);

  // Access Injectable's static __instances Map via type cast.
  // Injectable populates this Map during construction (resolve loop).
  const InjectableRuntime = Runtime as unknown as {
    __instances: Map<string, unknown>;
    new (): InjectedInstances<Injects>;
  };

  /**
   * Ensures the Runtime has been constructed at least once.
   * Injectable stores all resolved instances in static `__instances`,
   * so after this call, `InjectableRuntime.__instances.get(key)` works.
   */
  function ensureConstructed(): void {
    if (InjectableRuntime.__instances.size === 0) {
      new InjectableRuntime();
    }
  }

  const RuntimeCtor = Runtime as unknown as new () => object;
  class TeleportabilityPortal extends RuntimeCtor {
    static inject(state: Partial<Injects>) {
      injectState<Injects>(options.key, state);
    }

    static dispose() {
      // Clear Injectable's static registry — next get() re-constructs.
      InjectableRuntime.__instances.clear();
      dispose(options);
    }

    static get injects(): Readonly<InjectMap> {
      return injectsRegistry.get(options.key) ?? {};
    }

    /**
     * Lazily-constructed Runtime instance.
     * First access triggers `new Runtime()`, populating `__instances`.
     */
    static get instance(): InjectedInstances<Injects> {
      ensureConstructed();
      // Build a frozen snapshot from __instances for property access.
      const obj = {} as Record<string, unknown>;
      for (const [k, v] of InjectableRuntime.__instances) {
        obj[k] = v;
      }
      return obj as InjectedInstances<Injects>;
    }

    /**
     * Get a specific resolved inject by key.
     * Reads directly from Injectable's static `__instances` Map —
     * no separate cache needed, since Injectable already maintains it.
     */
    static get<T = unknown>(key: keyof Injects | (string & {})): T {
      ensureConstructed();
      return InjectableRuntime.__instances.get(key as string) as T;
    }
  }

  return TeleportabilityPortal as unknown as TeleportabilityLike<Injects>;
}
