/* eslint-disable @typescript-eslint/no-explicit-any */
import { tokenize } from "./tokenizer";
import { parse, parseExpression, type PathNode } from "./parser";
import { evaluate, type JSONPathMatch } from "./evaluator";

/**
 * A compiled JSONPath expression that can be evaluated against any JSON document.
 *
 * Supports the standard JSONPath specification:
 * - `$` — Root object
 * - `.key` / `['key']` — Property access
 * - `[0]` / `[-1]` — Index (supports negative)
 * - `.*` / `[*]` — Wildcard (all children)
 * - `..key` — Recursive descent
 * - `[0:5]` / `[::2]` — Array slicing `[start:end:step]`
 * - `[0,1,2]` / `['a','b']` — Union
 * - `[?(@.price < 10)]` — Filter expressions with comparison and logical operators
 *
 * @example
 * ```ts
 * const jp = new JSONPath("$.store.book[*].author");
 * const authors = jp.query(data);
 * // ["Nigel Rees", "Evelyn Waugh", ...]
 *
 * // Or use the static shorthand
 * const titles = JSONPath.query(data, "$.store.book[?(@.price < 10)].title");
 * ```
 */
export class JSONPath {
  /** The original expression string. */
  readonly expression: string;

  /** The compiled AST. */
  protected readonly ast: PathNode[];

  /**
   * Creates a compiled JSONPath expression.
   *
   * @param expression - A JSONPath expression string.
   */
  constructor(expression: string) {
    this.expression = expression;
    this.ast = parseExpression(expression);
  }

  /**
   * Evaluates this expression against a JSON document.
   *
   * @param data - The JSON document to query.
   * @returns An array of matching values.
   */
  query<T = any>(data: any): T[] {
    return evaluate(this.ast, data).map((m) => m.value);
  }

  /**
   * Evaluates this expression and returns detailed match results
   * including the normalized path to each match.
   *
   * @param data - The JSON document to query.
   * @returns An array of {@link JSONPathMatch} objects.
   */
  matches(data: any): JSONPathMatch[] {
    return evaluate(this.ast, data);
  }

  /**
   * Returns the first matching value, or `undefined` if no match.
   *
   * @param data - The JSON document to query.
   */
  first<T = any>(data: any): T | undefined {
    const results = evaluate(this.ast, data);
    return results.length > 0 ? results[0].value : undefined;
  }

  /**
   * Returns the last matching value, or `undefined` if no match.
   *
   * @param data - The JSON document to query.
   */
  last<T = any>(data: any): T | undefined {
    const results = evaluate(this.ast, data);
    return results.length > 0 ? results[results.length - 1].value : undefined;
  }

  /**
   * Checks whether any value in the document matches this expression.
   *
   * @param data - The JSON document to query.
   */
  exists(data: any): boolean {
    return evaluate(this.ast, data).length > 0;
  }

  /**
   * Returns the number of matches.
   *
   * @param data - The JSON document to query.
   */
  count(data: any): number {
    return evaluate(this.ast, data).length;
  }

  /**
   * Returns the normalized paths of all matches.
   *
   * @param data - The JSON document to query.
   * @returns An array of path strings (e.g. `["$['store']['book'][0]['author']"]`).
   */
  paths(data: any): string[] {
    return evaluate(this.ast, data).map((m) => m.path);
  }

  /**
   * Applies a mapping function to all matching values.
   *
   * @param data - The JSON document to query.
   * @param fn - A function to apply to each matched value.
   */
  map<T = any, R = any>(data: any, fn: (value: T, path: string, index: number) => R): R[] {
    return evaluate(this.ast, data).map((m, i) => fn(m.value, m.path, i));
  }

  /**
   * Iterates over all matches, calling `fn` for each.
   *
   * @param data - The JSON document to query.
   * @param fn - Callback invoked with each matched value and path.
   */
  forEach(data: any, fn: (value: any, path: string, index: number) => void): void {
    evaluate(this.ast, data).forEach((m, i) => fn(m.value, m.path, i));
  }

  /**
   * Returns the compiled AST for inspection or serialization.
   */
  toAST(): ReadonlyArray<PathNode> {
    return this.ast;
  }

  /** Returns the original expression string. */
  toString(): string {
    return this.expression;
  }

  // ─── Static API ────────────────────────────────────────────────

  /**
   * Shorthand: query a document with an expression in one call.
   *
   * @param data - The JSON document to query.
   * @param expression - A JSONPath expression string.
   * @returns An array of matching values.
   *
   * @example
   * ```ts
   * JSONPath.query(data, "$.store.book[*].author");
   * ```
   */
  static query<T = any>(data: any, expression: string): T[] {
    return new JSONPath(expression).query<T>(data);
  }

  /**
   * Shorthand: get the first matching value.
   *
   * @param data - The JSON document to query.
   * @param expression - A JSONPath expression string.
   */
  static first<T = any>(data: any, expression: string): T | undefined {
    return new JSONPath(expression).first<T>(data);
  }

  /**
   * Shorthand: check if any value matches.
   *
   * @param data - The JSON document to query.
   * @param expression - A JSONPath expression string.
   */
  static exists(data: any, expression: string): boolean {
    return new JSONPath(expression).exists(data);
  }

  /**
   * Shorthand: tokenize an expression without evaluating.
   *
   * @param expression - A JSONPath expression string.
   */
  static tokenize(expression: string) {
    return tokenize(expression);
  }

  /**
   * Shorthand: parse an expression into an AST without evaluating.
   *
   * @param expression - A JSONPath expression string.
   */
  static parse(expression: string) {
    return parse(tokenize(expression));
  }
}
