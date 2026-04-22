/**
 * Minimal contract for a resolved container.
 * Both Teleportability and any future container that exposes
 * `get<T>(key)` satisfy this — Anchoribility can adopt it later.
 */
interface ResolvableContainer {
  get<T = unknown>(key: string | symbol): T;
}

// ─── Resolver stack ─────────────────────────────────────────────────
//
// During Injectable construction, `resolve(key)` provides on-demand,
// order-independent, cycle-safe dependency resolution. Inject needs to
// route through it instead of hitting the container's `.get()` directly
// (which reads from `__instances` — not yet committed mid-construction).
//
// A **stack** is used instead of a single variable because Injectable
// scopes can nest: e.g. `Fetchable extends Injectable({ http: Http })`
// constructs its own Injectable scope while the outer Runtimable scope
// is still constructing. Each scope pushes its own resolver/hasKey pair
// on entry and pops on exit.
//
// Inject walks the stack from top (innermost) to bottom (outermost),
// checking `hasKey` before calling `resolve` to avoid throwing on keys
// that belong to a different scope.

interface ActiveScope {
  hasKey(key: string): boolean;
  resolve(key: string): unknown;
}

const scopeStack: ActiveScope[] = [];

/**
 * Push an Injectable's resolve scope onto the stack.
 * Called by Injectable's constructor before the resolve loop.
 */
export function pushScope(scope: ActiveScope): void {
  scopeStack.push(scope);
}

/**
 * Pop the current Injectable's resolve scope from the stack.
 * Called by Injectable's constructor in the `finally` block.
 */
export function popScope(): void {
  scopeStack.pop();
}

/**
 * `createInject(getContainer)` — returns a lazy `Inject` function
 * that resolves dependencies from a container on demand.
 *
 * ### Why lazy
 *
 * The container getter is a function, not a direct reference.
 * Nothing is resolved at module definition time — `Inject` only
 * calls `getContainer().get(key)` when actually invoked (typically
 * inside a constructor via default parameter values).
 *
 * ```ts
 * // Module level — no resolution happens here
 * const Inject = createInject(() => MarkdocTeleport);
 *
 * class MyService {
 *   constructor(
 *     // Resolution happens here, when `new MyService()` is called
 *     private readonly config = Inject<ConfigurationLike>("configuration"),
 *   ) {}
 * }
 * ```
 *
 * ### Construction-time routing
 *
 * When called during Injectable construction, `Inject` walks the
 * resolver stack to find the scope that owns the requested key.
 * This ensures:
 *   - **Order-independent resolution**: dependencies not yet resolved
 *     are resolved on demand, regardless of declaration order.
 *   - **Cycle detection**: circular dependencies are caught with a
 *     clear error message instead of silently returning `undefined`.
 *   - **Nested scopes**: inner Injectables (e.g. Fetchable) push/pop
 *     their own scope without clobbering the outer Runtimable scope.
 *
 * Outside of construction (stack empty), `Inject` falls back to the
 * container's `get()` which reads from the committed instance map.
 *
 * @param getContainer - A factory returning the container. Called on each `Inject()`.
 * @returns An `Inject<T>(key)` function bound to that container getter.
 */
export function createInject(getContainer: () => ResolvableContainer) {
  return function Inject<T = unknown>(key: string | symbol): T {
    const k = String(key);

    // Walk stack from top (innermost scope) to bottom (outermost).
    // The first scope that owns this key wins.
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].hasKey(k)) {
        return scopeStack[i].resolve(k) as T;
      }
    }

    // Outside construction — read from committed container.
    return getContainer().get<T>(key);
  };
}
