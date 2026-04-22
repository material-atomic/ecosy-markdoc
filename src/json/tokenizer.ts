 

/** Token types produced by the JSONPath lexer. */
export enum TokenType {
  Root = "ROOT",
  Dot = "DOT",
  DotDot = "DOT_DOT",
  Wildcard = "WILDCARD",
  BracketOpen = "BRACKET_OPEN",
  BracketClose = "BRACKET_CLOSE",
  Number = "NUMBER",
  String = "STRING",
  Colon = "COLON",
  Comma = "COMMA",
  Question = "QUESTION",
  ParenOpen = "PAREN_OPEN",
  ParenClose = "PAREN_CLOSE",
  At = "AT",
  Operator = "OPERATOR",
  Identifier = "IDENTIFIER",
}

/** A single token from the JSONPath lexer. */
export interface Token {
  type: TokenType;
  value: string;
}

/**
 * Tokenizes a JSONPath expression into a stream of {@link Token}s.
 *
 * @param expression - A JSONPath expression string (e.g. `$.store.book[0].title`).
 * @returns An array of tokens.
 */
export function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    if (ch === "$") {
      tokens.push({ type: TokenType.Root, value: "$" });
      i++;
    } else if (ch === "@") {
      tokens.push({ type: TokenType.At, value: "@" });
      i++;
    } else if (ch === ".") {
      if (expression[i + 1] === ".") {
        tokens.push({ type: TokenType.DotDot, value: ".." });
        i += 2;
      } else {
        tokens.push({ type: TokenType.Dot, value: "." });
        i++;
      }
    } else if (ch === "*") {
      tokens.push({ type: TokenType.Wildcard, value: "*" });
      i++;
    } else if (ch === "[") {
      tokens.push({ type: TokenType.BracketOpen, value: "[" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: TokenType.BracketClose, value: "]" });
      i++;
    } else if (ch === ":") {
      tokens.push({ type: TokenType.Colon, value: ":" });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: TokenType.Comma, value: "," });
      i++;
    } else if (ch === "?") {
      tokens.push({ type: TokenType.Question, value: "?" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: TokenType.ParenOpen, value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: TokenType.ParenClose, value: ")" });
      i++;
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      let str = "";
      i++;
      while (i < expression.length && expression[i] !== quote) {
        if (expression[i] === "\\") {
          i++;
          str += expression[i] ?? "";
        } else {
          str += expression[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: TokenType.String, value: str });
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let num = ch;
      i++;
      while (i < expression.length && expression[i] >= "0" && expression[i] <= "9") {
        num += expression[i];
        i++;
      }
      tokens.push({ type: TokenType.Number, value: num });
    } else if (
      ch === "=" ||
      ch === "!" ||
      ch === "<" ||
      ch === ">"
    ) {
      let op = ch;
      i++;
      if (i < expression.length && expression[i] === "=") {
        op += "=";
        i++;
      }
      tokens.push({ type: TokenType.Operator, value: op });
    } else if (ch === "&" && expression[i + 1] === "&") {
      tokens.push({ type: TokenType.Operator, value: "&&" });
      i += 2;
    } else if (ch === "|" && expression[i + 1] === "|") {
      tokens.push({ type: TokenType.Operator, value: "||" });
      i += 2;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = ch;
      i++;
      while (i < expression.length && /[a-zA-Z0-9_]/.test(expression[i])) {
        ident += expression[i];
        i++;
      }
      tokens.push({ type: TokenType.Identifier, value: ident });
    } else if (/\s/.test(ch)) {
      i++; // skip whitespace
    } else {
      throw new Error(`[JSONPath] Unexpected character '${ch}' at position ${i}`);
    }
  }

  return tokens;
}
