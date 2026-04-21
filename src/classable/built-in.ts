/**
 * Core built-in types and utilities inlined from `@ecosy/core`.
 *
 * These are copied here to keep `@ecosy/classable` zero-dependency,
 * eliminating the need for `@ecosy/core` as a peer dependency.
 *
 * @module
 */

/** A plain object with string/symbol/number keys and unknown values. */
export type LiteralObject<Keys extends PropertyKey = PropertyKey> =
  | Record<Keys, unknown>
  | { [K in Keys]: unknown }
  | object;

/** A single-key object mapping `Key` to `Value`. */
export type AtomicObject<Key extends PropertyKey = PropertyKey, Value = unknown> = {
  [K in Key]: Value;
};

/** A value that may be either synchronous or wrapped in a `Promise`. */
export type Promisable<Value> = Value | Promise<Value>;

/**
 * Type-safe check for own property existence on an object.
 *
 * @param obj - The object to check.
 * @param key - The property key to look for.
 * @returns `true` if the object has the specified own property.
 */
export function hasOwnProperty<Obj, Key extends PropertyKey, As = unknown>(
  obj: Obj,
  key: Key,
): obj is Obj & Record<Key, As> {
  if (!obj) {
    return false;
  }

  if (typeof obj !== "object" && typeof obj !== "function") {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  return (
    Object.prototype.hasOwnProperty.call(obj, key) || key in (obj as Record<PropertyKey, unknown>)
  );
}
