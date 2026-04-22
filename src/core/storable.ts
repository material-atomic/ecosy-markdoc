import { LiteralObject, PartialLiteral, Subscriber } from "@ecosy/core";
import { JSONQuery } from "../json/json-query";

/**
 * Base store state — all custom states must extend this.
 * Consumers pass their own shape via the generic parameter
 * of `Storable<S>()` to get type-safe `getState()` / `setState()`.
 */
export type StoreState<S extends LiteralObject = LiteralObject> = S;

export function Storable<S extends LiteralObject = LiteralObject>() {
  return class Store extends Subscriber<S> {
    private stateSubscriber: (() => void) | null = null;
    private JSONQuery = new JSONQuery();

    private queryListener = new Set<() => void>();

    constructor(initialState: S | PartialLiteral<S>) {
      super(initialState);

      this.stateSubscriber = this.onStateChange(() => {
        this.updateQuery();
      });
      this.updateQuery();
    }

  private updateQuery() {
    const next = this.getState();
    if (this.shallow.isEqual(next, this.JSONQuery.get())) return;
    this.JSONQuery.set(next);
    this.queryListener.forEach(listener => listener());
  }

    onQueryChange(listener: () => void) {
      this.queryListener.add(listener);
      return () => this.queryListener.delete(listener);
    }

    reset() {
      this.stateSubscriber?.();
    }
  }
}
