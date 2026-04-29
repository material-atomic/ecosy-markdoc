import { JSONQuery } from "@ecosy/json/json-query";
import type { LiteralObject, PartialLiteral } from "@ecosy/core";
import { Subscriber } from "@ecosy/core";

/**
 * Base store state — all custom states must extend this.
 * Consumers pass their own shape via the generic parameter
 * of `Storable<S>()` to get type-safe `getState()` / `setState()`.
 */
export type StoreState<S extends LiteralObject = LiteralObject> = S;

/**
 * Public shape of a Storable instance — `Subscriber<S>` surface plus
 * the query-change hook and reset. Private internals (JSONQuery cache,
 * subscriber handles) are intentionally excluded so `.d.ts` emit is clean.
 */
export type StorableInstance<S extends LiteralObject> = Subscriber<S> & {
  onQueryChange(listener: () => void): () => void;
  reset(): void;
};

/**
 * Constructor shape of the class returned by `Storable<S>()`.
 * Annotating factory return type prevents TS4094 on downstream classes
 * (`MarkdocRequest`, `RequestContext`, `ServerNode`) that extend
 * `Injectable({ store: { target: Storable<...>() } })`.
 */
export interface StorableConstructor<S extends LiteralObject> {
  new (initialState: S | PartialLiteral<S>): StorableInstance<S>;
}

export function Storable<S extends LiteralObject = LiteralObject>(): StorableConstructor<S> {
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
      this.queryListener.forEach((listener) => listener());
    }

    onQueryChange(listener: () => void) {
      this.queryListener.add(listener);
      return () => this.queryListener.delete(listener);
    }

    reset() {
      this.stateSubscriber?.();
    }
  };
}
