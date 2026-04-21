import type { AnchorableLike} from "./anchorable";
import { Anchorable, type AnchorLike } from "./anchorable";

/**
 * Optional shape: Anchors that can release their own resources
 * (connections, listeners, caches) on dispose.
 */
interface DisposableAnchor {
  onDispose?(): void | Promise<void>;
}

export interface AnchoribilityOptions<A extends AnchorLike> {
  Anchor: A;
  /**
   * Key under which the Anchor is registered on `target`.
   *
   * **Collision warning:** the default `target` is `globalThis`, which is a
   * shared namespace across the entire runtime. A plain `string` key is
   * trivially collidable. Prefer a module-scoped `symbol` (or
   * `Symbol.for("pkg:anchor-name")`) for anything that might run alongside
   * other Anchoribility-using packages.
   */
  key: string | symbol;
  /**
   * Storage target for the Anchor registry. Defaults to `globalThis`.
   * Pass a user-owned object for scoped (non-global) state — useful for
   * multi-tenant setups or test isolation.
   */
  target?: Record<string | symbol, unknown>;
}

export type AnchoribilityLike<A extends AnchorLike> = AnchorableLike & {
  Anchor: A;
  dispose(): void;
};

function getTarget<A extends AnchorLike>(options: AnchoribilityOptions<A>) {
  return (options.target ??
    (typeof globalThis !== "undefined" ? globalThis : {})) as Record<
    string | symbol,
    unknown
  >;
}

/**
 * Resolves the Anchor registered at `options.key`. Implements
 * **first-write-wins**: the first `Anchoribility()` call to touch a key
 * installs the Anchor; subsequent calls with the same key but a different
 * Anchor reuse the original and silently ignore the new one. This is
 * intentional (singleton-per-key), but debug-hostile if unexpected.
 */
function getAnchor<A extends AnchorLike>(options: AnchoribilityOptions<A>) {
  const { key, Anchor } = options;
  const target = getTarget(options);

  if (!target[key]) {
    target[key] = Anchor;
  }

  return target[key] as A;
}

/**
 * Tears down the Anchor registered at `options.key`.
 *
 * Two semantics differences from the prior implementation:
 *  1. Calls `onDispose()` on the Anchor before removal, keeping lifecycle
 *     consistency with the rest of the system (`InjectableOnDispose`,
 *     `disposeInjects`). Anchors holding resources (connections, listeners,
 *     caches) get a chance to clean up instead of leaking.
 *  2. Uses `delete` rather than `= undefined`. `in` checks and key
 *     enumeration now correctly reflect that the slot is gone — matters on
 *     `globalThis` where namespace hygiene is not optional.
 *
 * Errors from `onDispose` are logged but not rethrown, so a failing anchor
 * does not leave the registry half-cleaned.
 */
function dispose<A extends AnchorLike>(options: AnchoribilityOptions<A>) {
  const { key } = options;
  const target = getTarget(options);
  const anchor = target[key] as (A & DisposableAnchor) | undefined;

  if (anchor) {
    if (typeof anchor.onDispose === "function") {
      try {
        anchor.onDispose();
      } catch (error) {
         
        console.warn(
          `[Anchoribility] Anchor dispose failed for key "${String(key)}":`,
          error,
        );
      }
    }
    delete target[key];
  }
}

/**
 * Binds an {@link Anchorable} portal to a global (or user-provided) storage
 * target keyed by `options.key`.
 *
 * **Design notes worth knowing:**
 * - **First-write-wins:** only the first Anchor registered at a given key
 *   sticks. Later `Anchoribility()` calls with the same key return the
 *   pre-existing Anchor and silently ignore the new one. See {@link getAnchor}.
 * - **Class identity is unstable:** every `.inject()` call returns a freshly
 *   generated class. Do not use identity comparisons (`===`) or reference-based
 *   caching against these classes.
 * - **Global by default:** the default `target` is `globalThis`. Prefer
 *   `symbol` keys to avoid collision across packages in the same process.
 */
export function Anchoribility<A extends AnchorLike>(
  options: AnchoribilityOptions<A>,
): AnchoribilityLike<A> {
  const Anchor = getAnchor(options);

  return class AnchoribilityPortal extends Anchorable(Anchor) {
    static override inject(state: unknown) {
      super.inject(state);
      return Anchoribility(options);
    }

    static get Anchor() {
      return Anchor;
    }

    static dispose() {
      dispose(options);
    }
  };
}
