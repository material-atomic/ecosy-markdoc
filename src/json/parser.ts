 
import { tokenize, TokenType, type Token } from "./tokenizer";

// ─── AST Node Types ──────────────────────────────────────────────

/** Base for all AST nodes. */
interface NodeBase {
  type: string;
}

/** Root node: `$` */
export interface RootNode extends NodeBase {
  type: "root";
}

/** Property access: `.key` or `['key']` */
export interface PropertyNode extends NodeBase {
  type: "property";
  name: string;
}

/** Numeric index: `[0]` */
export interface IndexNode extends NodeBase {
  type: "index";
  value: number;
}

/** Wildcard: `.*` or `[*]` */
export interface WildcardNode extends NodeBase {
  type: "wildcard";
}

/** Recursive descent: `..key` or `..*` */
export interface RecursiveNode extends NodeBase {
  type: "recursive";
  target: PathNode;
}

/** Array slice: `[start:end:step]` */
export interface SliceNode extends NodeBase {
  type: "slice";
  start: number | null;
  end: number | null;
  step: number | null;
}

/** Union: `[key1,key2]` or `[0,1,2]` */
export interface UnionNode extends NodeBase {
  type: "union";
  items: Array<string | number>;
}

/** Filter expression: `[?(@.price < 10)]` */
export interface FilterNode extends NodeBase {
  type: "filter";
  expression: FilterExpression;
}

/** Comparison inside a filter. */
export interface ComparisonExpression {
  type: "comparison";
  left: FilterExpression;
  operator: string;
  right: FilterExpression;
}

/** Logical AND/OR inside a filter. */
export interface LogicalExpression {
  type: "logical";
  operator: "&&" | "||";
  left: FilterExpression;
  right: FilterExpression;
}

/** A path reference inside a filter (e.g. `@.price`). */
export interface PathExpression {
  type: "path";
  nodes: PathNode[];
}

/** A literal value inside a filter. */
export interface LiteralExpression {
  type: "literal";
  value: string | number | boolean | null;
}

/** Union of all filter sub-expressions. */
export type FilterExpression =
  | ComparisonExpression
  | LogicalExpression
  | PathExpression
  | LiteralExpression;

/** Union of all top-level path nodes. */
export type PathNode =
  | RootNode
  | PropertyNode
  | IndexNode
  | WildcardNode
  | RecursiveNode
  | SliceNode
  | UnionNode
  | FilterNode;

// ─── Parser ──────────────────────────────────────────────────────

/**
 * Parses a tokenized JSONPath expression into an AST (array of {@link PathNode}s).
 *
 * @param tokens - Token stream from {@link tokenize}.
 * @returns An array of path nodes representing the JSONPath.
 */
export function parse(tokens: Token[]): PathNode[] {
  const nodes: PathNode[] = [];
  let i = 0;

  function peek(): Token | undefined {
    return tokens[i];
  }

  function advance(): Token {
    return tokens[i++];
  }

  function expect(type: TokenType): Token {
    const tok = advance();
    if (!tok || tok.type !== type) {
      throw new Error(
        `[JSONPath] Expected ${type}, got ${tok ? `${tok.type}(${tok.value})` : "EOF"}`,
      );
    }
    return tok;
  }

  function parseFilterExpression(): FilterExpression {
    let left = parseFilterAtom();

    while (peek()?.type === TokenType.Operator) {
      const op = peek()!.value;
      if (op === "&&" || op === "||") {
        advance();
        const right = parseFilterAtom();
        left = { type: "logical", operator: op, left, right };
      } else {
        advance();
        const right = parseFilterAtom();
        left = { type: "comparison", left, operator: op, right };
      }
    }

    return left;
  }

  function parseFilterAtom(): FilterExpression {
    const tok = peek();
    if (!tok) throw new Error("[JSONPath] Unexpected end of filter expression");

    // Parenthesized sub-expression
    if (tok.type === TokenType.ParenOpen) {
      advance();
      const expr = parseFilterExpression();
      expect(TokenType.ParenClose);
      return expr;
    }

    // Path: @.foo.bar or $.foo
    if (tok.type === TokenType.At || tok.type === TokenType.Root) {
      const pathNodes: PathNode[] = [];
      if (tok.type === TokenType.At) {
        advance();
      } else {
        advance();
        pathNodes.push({ type: "root" });
      }

      while (peek()?.type === TokenType.Dot || peek()?.type === TokenType.BracketOpen) {
        if (peek()!.type === TokenType.Dot) {
          advance();
          const next = peek();
          if (next?.type === TokenType.Identifier) {
            pathNodes.push({ type: "property", name: advance().value });
          } else if (next?.type === TokenType.Wildcard) {
            advance();
            pathNodes.push({ type: "wildcard" });
          }
        } else if (peek()!.type === TokenType.BracketOpen) {
          advance();
          const next = peek();
          if (next?.type === TokenType.String) {
            pathNodes.push({ type: "property", name: advance().value });
          } else if (next?.type === TokenType.Number) {
            pathNodes.push({ type: "index", value: parseInt(advance().value, 10) });
          }
          expect(TokenType.BracketClose);
        }
      }

      return { type: "path", nodes: pathNodes };
    }

    // String literal
    if (tok.type === TokenType.String) {
      advance();
      return { type: "literal", value: tok.value };
    }

    // Number literal
    if (tok.type === TokenType.Number) {
      advance();
      const num = Number(tok.value);
      return { type: "literal", value: num };
    }

    // Boolean / null identifiers
    if (tok.type === TokenType.Identifier) {
      advance();
      if (tok.value === "true") return { type: "literal", value: true };
      if (tok.value === "false") return { type: "literal", value: false };
      if (tok.value === "null") return { type: "literal", value: null };
      throw new Error(`[JSONPath] Unknown identifier '${tok.value}' in filter`);
    }

    throw new Error(`[JSONPath] Unexpected token '${tok.value}' in filter`);
  }

  function parseBracket(): PathNode {
    const first = peek();

    // [?(...)] filter
    if (first?.type === TokenType.Question) {
      advance();
      expect(TokenType.ParenOpen);
      const expression = parseFilterExpression();
      expect(TokenType.ParenClose);
      expect(TokenType.BracketClose);
      return { type: "filter", expression };
    }

    // [*] wildcard
    if (first?.type === TokenType.Wildcard) {
      advance();
      expect(TokenType.BracketClose);
      return { type: "wildcard" };
    }

    // Collect items for index, slice, or union
    const items: Array<{ type: "number" | "string"; value: string }> = [];
    let hasColon = false;

    while (peek() && peek()!.type !== TokenType.BracketClose) {
      const tok = peek()!;
      if (tok.type === TokenType.Number) {
        items.push({ type: "number", value: advance().value });
      } else if (tok.type === TokenType.String) {
        items.push({ type: "string", value: advance().value });
      } else if (tok.type === TokenType.Colon) {
        hasColon = true;
        items.push({ type: "number", value: "" }); // placeholder
        advance();
      } else if (tok.type === TokenType.Comma) {
        advance();
      } else {
        throw new Error(`[JSONPath] Unexpected token '${tok.value}' in bracket`);
      }
    }
    expect(TokenType.BracketClose);

    // Slice: [start:end:step]
    if (hasColon) {
      const parts = items.map((it) => (it.value === "" ? null : parseInt(it.value, 10)));
      return {
        type: "slice",
        start: parts[0] ?? null,
        end: parts[1] ?? null,
        step: parts[2] ?? null,
      };
    }

    // Union: [0,1] or ['a','b']
    if (items.length > 1) {
      return {
        type: "union",
        items: items.map((it) => (it.type === "number" ? parseInt(it.value, 10) : it.value)),
      };
    }

    // Single index or property
    const single = items[0];
    if (single.type === "number") {
      return { type: "index", value: parseInt(single.value, 10) };
    }
    return { type: "property", name: single.value };
  }

  // Main parse loop
  while (i < tokens.length) {
    const tok = peek()!;

    if (tok.type === TokenType.Root) {
      advance();
      nodes.push({ type: "root" });
    } else if (tok.type === TokenType.DotDot) {
      advance();
      const next = peek();
      if (next?.type === TokenType.Wildcard) {
        advance();
        nodes.push({ type: "recursive", target: { type: "wildcard" } });
      } else if (next?.type === TokenType.Identifier) {
        nodes.push({ type: "recursive", target: { type: "property", name: advance().value } });
      } else if (next?.type === TokenType.BracketOpen) {
        advance();
        const bracketNode = parseBracket();
        nodes.push({ type: "recursive", target: bracketNode });
      } else {
        throw new Error("[JSONPath] Expected identifier, wildcard, or bracket after '..'");
      }
    } else if (tok.type === TokenType.Dot) {
      advance();
      const next = peek();
      if (next?.type === TokenType.Wildcard) {
        advance();
        nodes.push({ type: "wildcard" });
      } else if (next?.type === TokenType.Identifier) {
        nodes.push({ type: "property", name: advance().value });
      } else {
        throw new Error(`[JSONPath] Expected property name after '.', got ${next?.value ?? "EOF"}`);
      }
    } else if (tok.type === TokenType.BracketOpen) {
      advance();
      nodes.push(parseBracket());
    } else if (tok.type === TokenType.Identifier) {
      nodes.push({ type: "property", name: advance().value });
    } else {
      throw new Error(`[JSONPath] Unexpected token '${tok.value}'`);
    }
  }

  return nodes;
}

/**
 * Parses a JSONPath expression string into an AST.
 *
 * @param expression - A JSONPath expression (e.g. `$.store.book[*].author`).
 * @returns An array of {@link PathNode}s.
 */
export function parseExpression(expression: string): PathNode[] {
  return parse(tokenize(expression));
}
