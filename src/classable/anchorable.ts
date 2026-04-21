import type { Placeholder } from "./placeholder";
import type { ClassStatic } from "./types";

/**
 * Minimal structural contract for a mooring point (Anchor).
 * An Anchor accepts state pushes via `inject` and decides what to do
 * with them — store, validate, fan out, ignore. The Anchorable layer
 * trusts the Anchor and does not validate state itself.
 *
 * The `State` parameter lets concrete anchors narrow the accepted
 * payload. It defaults to `unknown` so an untyped usage stays sound
 * (a caller of an unparameterized `AnchorLike` cannot assume any
 * structure and must narrow before use).
 */
export interface AnchorLike<State = unknown> {
  inject(state: State): void;
}

/**
 * Static-side contract for the class returned by {@link Anchorable}.
 * `inject` propagates both `Instance` and `State` so chained calls
 * preserve type information instead of collapsing back to defaults.
 */
export type AnchorableLike<
  Instance extends Placeholder = Placeholder,
  State = unknown,
> = ClassStatic<{
  inject(state: State): AnchorableLike<Instance, State>;
}, Instance>;

/**
 * Anchorable: a stateless portal that routes state into an Anchor.
 *
 * Every call to `Anchorable(Anchor)` produces a **new** class — the chain
 * carries no memory. `inject()` is fluent sugar over a pure side-effect
 * (`Anchor.inject(state)`), not a builder in the classical sense.
 *
 * This is deliberate: the Anchor owns all state, the portal owns nothing.
 * Read APIs, caching, and validation all belong to the Anchor, not here.
 */
export function Anchorable<
  Instance extends Placeholder = Placeholder,
  State = unknown,
>(Anchor: AnchorLike<State>): AnchorableLike<Instance, State> {
  const AnchorPortal = class AnchorPortal {
    static inject(state: State) {
      // Route the payload down to the mooring point.
      Anchor.inject(state);
      // Return a fresh factory so callers can keep chaining.
      return Anchorable<Instance, State>(Anchor);
    }
  };

  // Give the class an identity that survives into stack traces / devtools,
  // so deep chains don't all render as "AnchorPortal" and become unreadable.
  const anchorName =
    (Anchor as { name?: string }).name ??
    Anchor.constructor?.name ??
    "anonymous";
  Object.defineProperty(AnchorPortal, "name", {
    value: `AnchorPortal(${anchorName})`,
    configurable: true,
  });

  return AnchorPortal as AnchorableLike<Instance, State>;
}
