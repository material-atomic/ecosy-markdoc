/* eslint-disable @typescript-eslint/no-explicit-any */
import { hasOwnProperty } from "./built-in";
import {
  type InstanceByStatic,
  placeholder,
  Placeholder,
  placeholderInstance,
} from "./placeholder";
import type {
  AnyAbstractClass,
  AnyClass,
  Classable,
  ClassableTarget,
  ClassFactory,
  ClassFactoryAsync,
  ClassFactorySync,
  ClassStatic,
  ClassType,
  Readonlyable,
} from "./types";
import type { AtomicObject } from "./built-in";

/**
 * A function that selects a {@link Classable} and its constructor arguments
 * from a list of candidates, optionally based on a runtime context.
 *
 * **Async compatibility note:** the return type permits a `Promise` for
 * forward compatibility, but `Injectable`'s synchronous resolver currently
 * rejects Promise-returning selectors at construction time. Treat async
 * selectors as type-level-allowed but runtime-restricted until a dedicated
 * async container/executor consumes them.
 *
 * @typeParam InstanceType - The instance type to produce.
 * @typeParam Args - Constructor arguments for the selected classable.
 * @typeParam Getter - Static method name on the target class.
 * @typeParam Runtime - Optional runtime context type.
 */
export type ClassableSelector<
  InstanceType,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> = (
  ...args: Runtime extends never
    ? Array<Classable<any, any[], string, Runtime>>
    : [runtime: Runtime, ...Array<Classable<any, any[], string, Runtime>>]
) =>
  | [Classable<InstanceType, Args, Getter, Runtime>, Args]
  | Promise<[Classable<InstanceType, Args, Getter, Runtime>, Args]>;

/**
 * The core API of the Classable type system.
 *
 * Provides the single projection function (`create`) that transforms
 * a `Classable<T>` into an instance `T`, along with type guards,
 * factory utilities, and introspection helpers.
 *
 * This is the axiom from which the entire Classable ecosystem derives.
 */
class ClassableAPI {
  /** The {@link Placeholder} class (Null Object). */
  readonly Placeholder = Placeholder;
  /** A pre-built frozen factory for {@link Placeholder}. */
  readonly placeholder = placeholder;
  /** A pre-built frozen {@link InstanceByStatic} for {@link Placeholder}. */
  readonly placeholderInstance = placeholderInstance;

  /**
   * Type guard: checks if `fn` is a concrete class constructor.
   * Uses `Function.prototype.toString()` to detect the `class` keyword.
   *
   * @param fn - The value to check.
   */
  is(fn: unknown): fn is AnyClass<any> {
    return typeof fn === "function" && /^class\s/.test(Function.prototype.toString.call(fn));
  }

  /**
   * Type guard: checks if `fn` is an abstract class constructor.
   *
   * @param fn - The value to check.
   */
  isAbstract(fn: unknown): fn is AnyAbstractClass<any> {
    return (
      typeof fn === "function" && /^abstract\s+class\s/.test(Function.prototype.toString.call(fn))
    );
  }

  /**
   * Type guard: checks if `obj` is a {@link ClassFactory} descriptor
   * (has a `target` class and a `get` resolver function).
   *
   * @param obj - The value to check.
   */
  isFactory<
    InstanceType,
    Args extends Readonlyable<any[]> = [],
    Getter extends string = string,
    Runtime = never,
  >(obj: unknown): obj is ClassFactory<InstanceType, Args, Getter, Runtime> {
    return (
      hasOwnProperty(obj, "target") &&
      this.is(obj.target) &&
      hasOwnProperty(obj, "get") &&
      typeof obj.get === "function"
    );
  }

  /**
   * Normalizes a class constructor or existing factory into a {@link ClassFactory}.
   * If the input is already a factory, it is returned as-is.
   *
   * @param cls - A class constructor or factory to normalize.
   * @returns A {@link ClassFactory} descriptor.
   */
  toFactory<
    InstanceType,
    Args extends Readonlyable<any[]> = [],
    Getter extends string = string,
    Runtime = never,
  >(
    cls: ClassStatic<
      Partial<AtomicObject<Getter, ClassType<InstanceType, Args>>>,
      InstanceType,
      Args
    >,
  ): ClassFactory<InstanceType, Args, Getter, Runtime> {
    if (this.isFactory<InstanceType, Args, Getter, Runtime>(cls)) {
      return cls;
    }

    return {
      target: cls,
      get: () => [] as unknown as Args,
    };
  }

  /**
   * Extracts the underlying target class from a {@link Classable}.
   * If the input is a factory, returns `factory.target`;
   * otherwise returns the class itself.
   *
   * @param cls - A classable (class or factory).
   * @returns The resolved target class.
   */
  getTarget<
    Instance = never,
    Getter extends string = string,
    Cls extends { target: new (...args: any[]) => any; [k: string]: any } | (new (...args: any[]) => any) =
      { target: new (...args: any[]) => any; [k: string]: any } | (new (...args: any[]) => any),
  >(cls: Cls): [Instance] extends [never]
    ? ClassableTarget<Cls, Getter> extends infer R extends (new (...args: any[]) => any)
      ? R
      : ClassType<any, any[]>
    : ClassType<Instance, any[]> {
    if (typeof cls === "object" && cls !== null && "target" in cls) {
      return (cls as any).target;
    }

    return cls as any;
  }

  /**
   * Creates a new {@link ClassFactory} from a classable, replacing the resolver.
   * Preserves the original target class.
   *
   * @param base - The classable to derive from.
   * @param resolve - The new resolver function.
   * @param getter - Optional static method name override.
   * @returns A new {@link ClassFactory} with the updated resolver.
   */
  withFactory<
    InstanceType,
    Args extends Readonlyable<any[]> = [],
    Getter extends string = string,
    Runtime = never,
  >(
    base: Classable<InstanceType, Args, Getter, Runtime>,
    resolve: ClassFactory<InstanceType, Args, Getter, Runtime>["get"],
    getter?: Getter,
  ): ClassFactory<InstanceType, Args, Getter, Runtime> {
    const normalized = classable.isFactory<InstanceType, Args, Getter, Runtime>(base)
      ? base
      : (classable.toFactory(base as ClassType<InstanceType, [...Args]>) as unknown as ClassFactory<
          InstanceType,
          Args,
          Getter,
          Runtime
        >);
    return {
      target: normalized.target,
      get: resolve,
      getter,
    };
  }

  /**
   * Applies a wrapper function to the target class of a classable.
   * If the input is a factory, the wrapper is applied to `factory.target`
   * while preserving `get` and `getter`.
   *
   * @param cls - The classable to wrap.
   * @param wrapper - A function that receives the target class and returns a new one.
   * @returns A new classable with the wrapped target.
   */
  wrap<
    InstanceType,
    Args extends Readonlyable<any[]> = [],
    Getter extends string = string,
    Runtime = never,
  >(
    cls: Classable<InstanceType, Args, Getter, Runtime>,
    wrapper: (
      target: ClassType<InstanceType, Args>,
    ) => ClassStatic<
      Partial<AtomicObject<Getter, ClassType<InstanceType, Args>>>,
      InstanceType,
      Args
    >,
  ): Classable<InstanceType, Args, Getter, Runtime> {
    if (classable.isFactory<InstanceType, Args, Getter, Runtime>(cls)) {
      return {
        target: wrapper(cls.target),
        get: cls.get,
        getter: cls.getter,
      };
    }

    return wrapper(cls);
  }

  /**
   * Returns a human-readable descriptor for debugging/logging.
   *
   * @param cls - The classable to describe.
   * @returns An object with `type` ("class" | "resolver") and `target` (class name).
   */
  getDescriptor(cls: Classable<any, any[], string, any>) {
    if (classable.isFactory<any, any[], any>(cls)) {
      return {
        type: "resolver",
        target: cls.target.name,
      };
    }

    return {
      type: "class",
      target: cls.name,
    };
  }

  /**
   * Creates an instance via an {@link InstanceByStatic} descriptor.
   * Calls the named static factory method with arguments resolved by the selector.
   *
   * @param def - The static factory descriptor.
   * @param runtime - Optional runtime context.
   * @returns The created instance.
   */
  from<
    InstanceType,
    Method extends string = "factory",
    Args extends Readonlyable<any[]> = [],
    Runtime = never,
  >(def: InstanceByStatic<InstanceType, Method, Args, Runtime>, runtime?: Runtime): InstanceType {
    const { target: StaticClass, selector } = def;
    const { method, args } = selector(
      ...((runtime === undefined ? [] : [runtime]) as Runtime extends never
        ? []
        : [runtime: Runtime]),
    );
    return StaticClass[method](...(args as unknown as [...Args]));
  }

  /**
   * Creates a bound selector function from a {@link ClassableSelector}.
   * The returned function can be called with classable candidates
   * (and optional runtime) to select and resolve a classable.
   *
   * @param find - The selector function to bind.
   * @returns A bound selector.
   */
  select<
    InstanceType,
    Args extends Readonlyable<any[]> = [],
    Getter extends string = string,
    Runtime = never,
  >(find: ClassableSelector<InstanceType, Args, Getter, Runtime>) {
    return (
      ...args: Runtime extends never
        ? [...classes: Array<Classable<any, any[], string, Runtime>>]
        : [runtime: Runtime, ...classes: Array<Classable<any, any[], string, Runtime>>]
    ) => {
      return find(...args) as ReturnType<ClassableSelector<InstanceType, Args, Getter, Runtime>>;
    };
  }

  /**
   * The single projection function — transforms a `Classable<T>` into `T`.
   *
   * Handles all variants:
   * - **Plain class**: `new cls()`
   * - **Sync factory**: resolves args via `get()`, then `new target(...args)` or `target[getter](...args)`
   * - **Async factory**: resolves args via `get()`, returns a Promise
   * - **Static getter**: calls `target[getter](...args)` instead of `new`
   *
   * @param cls - A class constructor, factory descriptor, or classable.
   * @param runtime - Optional runtime context passed to the factory resolver.
   * @returns The created instance (or Promise for async factories).
   */
  create<InstanceType>(cls: ClassType<InstanceType, []>): InstanceType;
  create<InstanceType, Args extends Readonlyable<any[]>, Getter extends string, Runtime>(
    cls: ClassFactorySync<InstanceType, Args, Getter, Runtime>,
    ...args: Runtime extends never ? [] : [runtime: Runtime]
  ): InstanceType;
  create<InstanceType, Args extends Readonlyable<any[]>, Getter extends string, Runtime>(
    cls: ClassFactoryAsync<InstanceType, Args, Getter, Runtime>,
    ...args: Runtime extends never ? [] : [runtime: Runtime]
  ): Promise<InstanceType>;
  create<
    InstanceType,
    Args extends Readonlyable<any[]> = [],
    Getter extends string = string,
    Runtime = never,
  >(
    cls: ClassType<InstanceType, Args> | Classable<InstanceType, Args, Getter, Runtime>,
    runtime?: Runtime,
  ): InstanceType {
    if (classable.isFactory<InstanceType, Args, Getter, Runtime>(cls)) {
      const args = (cls.get?.(
        ...((runtime === undefined ? [] : [runtime]) as Runtime extends never
          ? []
          : [runtime: Runtime]),
      ) ?? []) as Args;

      if (args instanceof Promise) {
        return args.then((resolvedArgs) => {
          if (cls.getter) {
            return (cls.target[cls.getter] as unknown as (...args: Args) => any)!(...resolvedArgs);
          } else {
            return new cls.target(...resolvedArgs);
          }
        }) as InstanceType;
      }

      if (cls.getter) {
        return (cls.target[cls.getter] as unknown as (...args: Args) => any)!(
          ...(args as Args),
        ) as InstanceType;
      }

      return new cls.target(...args);
    }

    return new cls(...([] as unknown as Args));
  }
}

/**
 * The singleton Classable API instance.
 * This is the primary entry point for all classable operations.
 *
 * @example
 * ```ts
 * import { classable } from "@ecosy/classable";
 *
 * // Type guard
 * classable.is(MyClass);       // true
 * classable.isFactory(factory); // true
 *
 * // Create instances
 * const instance = classable.create(MyClass);
 * const fromFactory = classable.create(myFactory);
 * ```
 */
export const classable = new ClassableAPI();
