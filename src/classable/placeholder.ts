/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ClassType, Readonlyable } from "./types";

/**
 * Null Object class used as a type-safe default in generic contexts.
 * Provides a static `getInstance` factory for consistency with the
 * {@link InstanceByStatic} pattern.
 */
export class Placeholder {
  /** Returns a new Placeholder instance. */
  static getInstance() {
    return new Placeholder();
  }
}

/**
 * A frozen, pre-built {@link ClassFactory} for {@link Placeholder}.
 * Useful as a default value where a `Classable` is required but
 * no real class is available yet.
 */
export const placeholder = Object.freeze({
  target: Placeholder,
  get: () => [] as const,
  getter: "getInstance",
});

/**
 * Intersection of {@link Placeholder} with an extension type.
 * Used to type `this` in classes that extend a generated base.
 */
export type ThisExtended<Extend> = Placeholder & Extend;

/**
 * A class constructor whose static side is extended with additional members.
 *
 * @typeParam Extend - Static members to merge onto the class.
 * @typeParam InstanceType - The instance type produced by the constructor.
 * @typeParam Args - Constructor argument types.
 */
export type StaticExtended<
  Extend,
  InstanceType = unknown,
  Args extends Readonlyable<any[]> = [],
> = ClassType<InstanceType, [...Args]> & Extend;

/**
 * Describes a class with a named static factory method and a runtime selector.
 *
 * The `selector` function chooses which factory method to call and with
 * what arguments, optionally based on a runtime context.
 *
 * @typeParam InstanceType - The type of instance the factory produces.
 * @typeParam Method - The name of the static factory method.
 * @typeParam Args - Arguments passed to the factory method.
 * @typeParam Runtime - Optional runtime context type.
 */
export type InstanceByStatic<
  InstanceType,
  Method extends string = "factory",
  Args extends Readonlyable<any[]> = [],
  Runtime = never,
> = {
  /** The class with a static factory method `[Method]`. */
  target: StaticExtended<
    {
      [K in Method]: (...args: Args) => InstanceType;
    },
    InstanceType,
    any[]
  >;
  /** Selects the factory method and its arguments at runtime. */
  selector: (...args: Runtime extends never ? [] : [runtime: Runtime]) => {
    method: Method;
    args: Args;
  };
};

/**
 * A frozen, pre-built {@link InstanceByStatic} for {@link Placeholder}.
 * Defaults to calling `Placeholder.getInstance()` with no arguments.
 */
export const placeholderInstance = Object.freeze({
  target: Placeholder,
  selector: () => ({ method: "getInstance", args: [] as [] }),
});

// NOTE: The canonical `ClassableSelector` lives in `./classable` and is the
// one re-exported from the package root. An earlier 3-param variant used to
// live here; it has been removed to avoid name-collision drift between
// direct imports of this module and package-level imports. If you need the
// selector type, import it from `./classable` (or the package root).
