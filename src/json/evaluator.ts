import type {
  PathNode,
  FilterExpression,
  ComparisonExpression,
  LogicalExpression,
  PathExpression,
  LiteralExpression,
} from "./parser";

export interface JSONPathMatch {
  value: any;
  path: string;
}

/**
 * Evaluates an AST against a JSON document and returns all matching values.
 * V8 Optimized: Uses ES6 Generators (yield*) to achieve zero-memory intermediate allocation!
 */
export function evaluate(nodes: PathNode[], data: any): JSONPathMatch[] {
  // Điểm vào (Entry point) - Chuyển đổi Generator về mảng cuối cùng
  return Array.from(evaluateNodes(nodes, [{ value: data, path: "$" }], data));
}

// ========================================================
// 1. VI TỐI ƯU MEMORY (MICRO-OPTIMIZATION BẰNG GENERATORS)
// ========================================================
function* evaluateNodes(
  nodes: PathNode[],
  initial: Iterable<JSONPathMatch>,
  root: any
): IterableIterator<JSONPathMatch> {
  let currentMatches: Iterable<JSONPathMatch> = initial;

  for (const node of nodes) {
    if (node.type === "root") {
      currentMatches = [{ value: root, path: "$" }];
      continue;
    }
    // Nối các Generators lại với nhau như một đường ống nước (Pipeline)
    currentMatches = chainNodes(node, currentMatches, root);
  }

  yield* currentMatches;
}

function* chainNodes(node: PathNode, matches: Iterable<JSONPathMatch>, root: any): IterableIterator<JSONPathMatch> {
  for (const match of matches) {
    yield* applyNode(node, match.value, match.path, root); // Không tạo array trung gian!
  }
}

function* applyNode(node: PathNode, current: any, path: string, root: any): IterableIterator<JSONPathMatch> {
  if (current === null || current === undefined) return;

  switch (node.type) {
    case "root":
      yield { value: root, path: "$" };
      break;

    case "property":
      if (typeof current === "object" && node.name in current) {
        yield { value: current[node.name], path: `${path}['${node.name}']` };
      }
      break;

    case "index":
      if (Array.isArray(current)) {
        const idx = node.value < 0 ? current.length + node.value : node.value;
        if (idx >= 0 && idx < current.length) {
          yield { value: current[idx], path: `${path}[${idx}]` };
        }
      }
      break;

    case "wildcard":
      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          yield { value: current[i], path: `${path}[${i}]` };
        }
      } else if (typeof current === "object" && current !== null) {
        for (const k of Object.keys(current)) {
          yield { value: current[k], path: `${path}['${k}']` };
        }
      }
      break;

    case "recursive":
      yield* descendAndApply(current, path, node.target, root);
      break;

    // ========================================================
    // 2. VÁ LỖI CẮT MẢNG LÙI (NEGATIVE SLICE BUG FIX)
    // ========================================================
    case "slice": {
      if (!Array.isArray(current)) return;
      const len = current.length;
      const step = node.step ?? 1;
      if (step === 0) return; // Bảo vệ vòng lặp vô hạn

      if (step > 0) {
        const start = resolveSliceIndex(node.start, 0, len);
        const end = resolveSliceIndex(node.end, len, len);
        for (let idx = start; idx < end; idx += step) {
          yield { value: current[idx], path: `${path}[${idx}]` };
        }
      } else {
        // Vá lỗi: Nếu đi lùi, start phải bắt đầu từ cuối (len - 1), end phải lùi về -1
        const start = resolveSliceIndex(node.start, len - 1, len);
        const end = resolveSliceIndex(node.end, -1, len);
        for (let idx = start; idx > end; idx += step) {
          yield { value: current[idx], path: `${path}[${idx}]` };
        }
      }
      break;
    }

    case "union":
      for (const item of node.items) {
        if (typeof item === "number" && Array.isArray(current)) {
          const idx = item < 0 ? current.length + item : item;
          if (idx >= 0 && idx < current.length) {
            yield { value: current[idx], path: `${path}[${idx}]` };
          }
        } else if (typeof item === "string" && typeof current === "object" && current !== null) {
          if (item in current) {
            yield { value: current[item], path: `${path}['${item}']` };
          }
        }
      }
      break;

    case "filter":
      if (!Array.isArray(current)) return;
      for (let idx = 0; idx < current.length; idx++) {
        if (evaluateFilter(node.expression, current[idx], root)) {
          yield { value: current[idx], path: `${path}[${idx}]` };
        }
      }
      break;
  }
}

function resolveSliceIndex(value: number | null, fallback: number, len: number): number {
  if (value === null) return fallback;
  if (value < 0) return Math.max(-1, len + value); // Cập nhật: Cho phép -1 làm mốc chặn cho vòng lặp lùi
  return Math.min(value, len);
}

function* descendAndApply(current: any, path: string, target: PathNode, root: any): IterableIterator<JSONPathMatch> {
  yield* applyNode(target, current, path, root);

  if (Array.isArray(current)) {
    for (let i = 0; i < current.length; i++) {
      yield* descendAndApply(current[i], `${path}[${i}]`, target, root);
    }
  } else if (typeof current === "object" && current !== null) {
    for (const key of Object.keys(current)) {
      yield* descendAndApply(current[key], `${path}['${key}']`, target, root);
    }
  }
}

function evaluateFilter(expr: FilterExpression, current: any, root: any): boolean {
  switch (expr.type) {
    case "path": {
      const vals = resolvePath(expr, current, root);
      return vals.length > 0 && vals.some(v => v !== false && v !== null && v !== undefined);
    }
    case "literal":
      return Boolean(expr.value);

    case "comparison":
      return evaluateComparison(expr, current, root);

    case "logical":
      return evaluateLogical(expr, current, root);

    default:
      return false;
  }
}

function resolvePath(expr: PathExpression, current: any, root: any): any[] {
  // ⚡ Ma thuật ở đây: Gọi ngược lại hệ thống Generator `evaluateNodes` 
  // Để nó tự động xử lý mượt mà cả [*] (wildcard) và .. (recursive) bên trong Filter!
  const matches = Array.from(evaluateNodes(expr.nodes, [{ value: current, path: "@" }], root));
  return matches.map(m => m.value);
}

function resolveFilterValue(expr: FilterExpression, current: any, root: any): any[] {
  switch (expr.type) {
    case "path":
      return resolvePath(expr, current, root); // Trả về mảng các kết quả (do có thể chứa wildcard)
    case "literal":
      return [(expr as LiteralExpression).value];
    default:
      return [];
  }
}

function evaluateComparison(expr: ComparisonExpression, current: any, root: any): boolean {
  const leftValues = resolveFilterValue(expr.left, current, root);
  const rightValues = resolveFilterValue(expr.right, current, root);

  // So sánh chéo (Cross-product): Chỉ cần BẤT KỲ 1 kết quả nào ở vế trái 
  // khớp với vế phải là thỏa mãn điều kiện Filter!
  for (const l of leftValues) {
    for (const r of rightValues) {
      let match = false;
      switch (expr.operator) {
        case "==": match = l == r; break;
        case "!=": match = l != r; break;
        case "===": match = l === r; break;
        case "!==": match = l !== r; break;
        case "<": match = l < r; break;
        case "<=": match = l <= r; break;
        case ">": match = l > r; break;
        case ">=": match = l >= r; break;
      }
      if (match) return true; 
    }
  }
  return false;
}

function evaluateLogical(expr: LogicalExpression, current: any, root: any): boolean {
  const left = evaluateFilter(expr.left, current, root);
  if (expr.operator === "&&") return left && evaluateFilter(expr.right, current, root);
  if (expr.operator === "||") return left || evaluateFilter(expr.right, current, root);
  return false;
}
