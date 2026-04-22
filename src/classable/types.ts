/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AtomicObject, LiteralObject, Promisable } from "./built-in";

/**
 * Accepts both `T` and `Readonly<T>`.
 * Useful for constructor argument types that may or may not be `as const`.
 */
export type Readonlyable<T> = T extends Readonly<infer U> ? U | Readonly<U> : T | Readonly<T>;

/**
 * A concrete class constructor.
 *
 * @typeParam Instance - The type of object the constructor produces.
 * @typeParam Args - Constructor parameter types.
 */
export type ClassType<Instance = unknown, Args extends Readonlyable<any[]> = []> = new (
  ...args: Args
) => Instance;

/** Shorthand for a class with any constructor arguments. */
export type AnyClass<T> = ClassType<T, any[]>;

/** A class constructor that takes no arguments. */
export type AtomicClass<InstanceType> = new () => InstanceType;

/**
 * An abstract class constructor (cannot be instantiated directly).
 *
 * @typeParam InstanceType - The type of object subclasses produce.
 * @typeParam Args - Constructor parameter types.
 */
export type AbstractClassType<InstanceType, Args extends Readonlyable<any[]> = []> = abstract new (
  ...args: Args
) => InstanceType;

/** Shorthand for an abstract class with any constructor arguments. */
export type AnyAbstractClass<T> = AbstractClassType<T, any[]>;

/** Union of concrete and abstract class constructors. */
export type AnyConstructor = ClassType<any, any[]> | AbstractClassType<any, any[]>;

/**
 * A class constructor intersected with additional static members.
 *
 * @typeParam Static - Static members to merge onto the constructor.
 * @typeParam Instance - The instance type produced by the constructor.
 * @typeParam Args - Constructor parameter types.
 */
export type ClassStatic<
  Static extends LiteralObject = LiteralObject,
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
> = ClassType<Instance, Args> & Static;

/**
 * A factory descriptor that pairs a class with a resolver function.
 * The resolver provides constructor arguments (sync or async)
 * and an optional named static getter.
 *
 * @typeParam Instance - The type of object the factory produces.
 * @typeParam Args - Constructor/getter argument types.
 * @typeParam Getter - Optional static method name on the target class.
 * @typeParam Runtime - Optional runtime context passed to `get()`.
 */
export interface ClassFactory<
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> {
  /** The target class (may include a static getter method). */
  target: ClassStatic<Partial<AtomicObject<Getter, ClassType<Instance, Args>>>, Instance, Args>;
  /** Resolves constructor/getter arguments. May be sync or async. */
  get?: (...args: Runtime extends never ? [] : [runtime: Runtime]) => Promisable<Args>;
  /** Optional static method name to call instead of `new`. */
  getter?: Getter;
}

/**
 * Synchronous variant of {@link ClassFactory}.
 * The `get()` resolver returns arguments synchronously.
 */
export interface ClassFactorySync<
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> {
  /** The target class. */
  target: ClassStatic<Partial<AtomicObject<Getter, ClassType<Instance, Args>>>, Instance, Args>;
  /** Synchronously resolves constructor/getter arguments. */
  get?: (...args: Runtime extends never ? [] : [runtime: Runtime]) => Args;
  /** Optional static method name to call instead of `new`. */
  getter?: Getter;
}

/**
 * Asynchronous variant of {@link ClassFactory}.
 * The `get()` resolver returns a Promise of arguments.
 */
export interface ClassFactoryAsync<
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> {
  /** The target class. */
  target: ClassStatic<Partial<AtomicObject<Getter, ClassType<Instance, Args>>>, Instance, Args>;
  /** Asynchronously resolves constructor/getter arguments. */
  get?: (...args: Runtime extends never ? [] : [runtime: Runtime]) => Promise<Args>;
  /** Optional static method name to call instead of `new`. */
  getter?: Getter;
}

/**
 * The core axiom of the Classable type system.
 *
 * A `Classable` is either a plain class constructor (with optional static members)
 * or a {@link ClassFactory} descriptor. This is the universal abstraction from
 * which all other Classable patterns (DI, lifecycle, container, executor) derive.
 */
export type Classable<
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> =
  | ClassStatic<Partial<AtomicObject<Getter, ClassType<Instance, Args>>>, Instance, Args>
  | ClassFactory<Instance, Args, Getter, Runtime>;

/** Synchronous-only variant of {@link Classable}. */
export type ClassableSync<
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> =
  | ClassStatic<Partial<AtomicObject<Getter, ClassType<Instance, Args>>>, Instance, Args>
  | ClassFactorySync<Instance, Args, Getter, Runtime>;

/** Asynchronous-only variant of {@link Classable}. */
export type ClassableAsync<
  Instance = unknown,
  Args extends Readonlyable<any[]> = [],
  Getter extends string = string,
  Runtime = never,
> =
  | ClassStatic<Partial<AtomicObject<Getter, ClassType<Instance, Args>>>, Instance, Args>
  | ClassFactoryAsync<Instance, Args, Getter, Runtime>;

/**
 * Extracts the underlying target class from a {@link Classable}.
 * Works for both plain constructors and factory descriptors.
 *
 * Constraint is structural (`{ target } | constructor`) rather than
 * `Classable<…, any>` to avoid contravariance on the `get` parameter
 * when `Runtime` differs between definition and call site.
 */
export type ClassableTarget<
  Cls extends { target: new (...args: any[]) => any; [k: string]: any } | (new (...args: any[]) => any),
  Getter extends string = string,
> = Cls extends {
  target: ClassStatic<any, infer Target, any>;
  get?: (...args: any[]) => Promisable<[...infer Args]>;
}
  ? ClassStatic<Partial<AtomicObject<Getter, ClassType<Target, Readonlyable<Args>>>>, Target, Readonlyable<Args>>
  : Cls extends new (...args: infer Args) => infer Target
    ? ClassStatic<Partial<AtomicObject<Getter, ClassType<Target, Readonlyable<Args>>>>, Target, Readonlyable<Args>>
    : never;
