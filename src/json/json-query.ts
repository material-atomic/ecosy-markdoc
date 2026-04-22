/* eslint-disable @typescript-eslint/no-explicit-any */
import { JSONPath } from "./json-path";

// ==========================================
// BỘ TỪ ĐIỂN MỞ RỘNG (EXTENSIONS REGISTRY)
// ==========================================
export const PIPES: Record<string, (val: any, ...args: any[]) => any> = {
  uppercase: (v) => (v ? String(v).toUpperCase() : ""),
  lowercase: (v) => (v ? String(v).toLowerCase() : ""),
  currency: (v, symbol = "$", locale = "en-US") => 
    (v != null ? Number(v).toLocaleString(locale) + symbol : ""),
  date: (v, locale = "en-US") => 
    (v ? new Date(v).toLocaleDateString(locale) : ""),
  json: (v, spaces = 2) => JSON.stringify(v, null, Number(spaces)),
  default: (v, def) => (v === null || v === undefined || v === "" ? def : v),
  limit: (v, max) => (Array.isArray(v) ? v.slice(0, Number(max)) : v),
  join: (v, separator = ",") => (Array.isArray(v) ? v.join(separator) : v),
};

export const AGGREGATIONS: Record<string, (arr: any[]) => any> = {
  SUM: (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => a + Number(b || 0), 0) : 0),
  COUNT: (arr) => (Array.isArray(arr) ? arr.length : 0),
  AVG: (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length;
  },
  MIN: (arr) => (Array.isArray(arr) && arr.length ? Math.min(...arr.map(Number)) : 0),
  MAX: (arr) => (Array.isArray(arr) && arr.length ? Math.max(...arr.map(Number)) : 0),
};

// ==========================================
// CỖ MÁY EVALUATOR (JSON QUERY PIPELINE)
// ==========================================
export class JSONQuery extends JSONPath {
  private data: any = {};

  constructor(expression: string = "$") {
    super(expression);
  }

  /**
   * Get current data source.
   */
  get(): any {
    return this.data;
  }

  /**
   * Set data source cho instance.
   * Storable gọi method này mỗi khi state thay đổi.
   */
  set(data: any) {
    this.data = data;
  }

  /**
   * Instance evaluate — chạy expression với pipes/aggregations trên data đã set.
   */
  eval(expr: string): any {
    return JSONQuery.evaluate(this.data, expr);
  }

  /**
   * Đăng ký thêm Pipe tùy chỉnh (cho phép Developer mở rộng tại ecosy.config.ts)
   */
  static registerPipe(name: string, fn: (val: any, ...args: any[]) => any) {
    PIPES[name] = fn;
  }

  /**
   * Đăng ký thêm Aggregation tùy chỉnh
   */
  static registerAggregation(name: string, fn: (arr: any[]) => any) {
    AGGREGATIONS[name] = fn;
  }

  /**
   * Điểm vào (Entry point) để xử lý mọi loại Expression
   * @param data Dữ liệu gốc (State / API Response)
   * @param expr Chuỗi truy vấn Ecosy JSONQuery
   */
  static evaluate(data: any, expr: string): any {
    if (!expr) return undefined;
    expr = expr.trim();

    // ==========================================
    // LỚP 1: NỘI SUY CHUỖI (String Interpolation)
    // VD: `Tổng tiền: {SUM($.cart.items[*].price)}`
    // ==========================================
    if (expr.startsWith("`") && expr.endsWith("`")) {
      const innerStr = expr.slice(1, -1);
      // Quét các block {...} nhưng bỏ qua nếu bị escape \{
      return innerStr.replace(/(^|[^\\])\{([^}]+)\}/g, (match, prefix, queryObj) => {
        const val = this.evaluate(data, queryObj);
        const strVal = val !== undefined && val !== null ? String(val) : "";
        return prefix + strVal;
      }).replace(/\\{/g, "{"); // Unescape
    }

    // ==========================================
    // LỚP 2 & 3: FALLBACK (??) VÀ PIPES (|)
    // Phân tách cẩn thận, bỏ qua ký tự trong dấu nháy hoặc ngoặc
    // ==========================================
    const fallbackSegments = this.smartSplit(expr, "??");
    let resolvedValue: any = null;

    for (const fbSegment of fallbackSegments) {
      // Cắt pipe cho từng segment fallback
      const pipeSegments = this.smartSplit(fbSegment, "|");
      const coreExprStr = pipeSegments[0];

      // Đánh giá lõi
      resolvedValue = this.resolveSegment(data, coreExprStr);

      // Nếu lõi có giá trị hợp lệ, áp dụng pipes và thoát vòng lặp fallback
      if (resolvedValue !== null && resolvedValue !== undefined) {
        const pipesToApply = pipeSegments.slice(1);
        resolvedValue = pipesToApply.reduce((acc, pipeStr) => this.applyPipe(acc, pipeStr), resolvedValue);
        break;
      }
    }

    return resolvedValue;
  }

  // ==========================================
  // LỚP 4 & 5: GIẢI QUYẾT TOÁN HỌC, HÀM & JSONPATH LÕI
  // ==========================================
  private static resolveSegment(data: any, segment: string): any {
    segment = segment.trim();

    // 1. Chuỗi tĩnh (Static Strings): 'default.png' hoặc "default.png"
    if (/^['"].*['"]$/.test(segment)) {
      return segment.slice(1, -1);
    }
    
    // 2. Số (Numbers) & Boolean
    if (!isNaN(Number(segment))) return Number(segment);
    if (segment === "true") return true;
    if (segment === "false") return false;
    if (segment === "null") return null;

    // 3. Hàm Tập Hợp: SUM(items[*].price)
    const funcMatch = segment.match(/^([A-Z_]+)\((.*)\)$/);
    if (funcMatch) {
      const funcName = funcMatch[1];
      const innerExpr = funcMatch[2];
      
      // Đệ quy giải quyết tham số bên trong
      const innerValue = this.evaluate(data, innerExpr); 
      
      if (AGGREGATIONS[funcName]) {
        // Đảm bảo truyền mảng vào Aggregation (dù JSONPath thỉnh thoảng trả 1 item)
        const arrValue = Array.isArray(innerValue) ? innerValue : (innerValue != null ? [innerValue] : []);
        return AGGREGATIONS[funcName](arrValue);
      }
    }

    // 4. Lõi JSONPath: Tự động "bọc" (wrap) biến bằng $. nếu cần thiết
    // Để Developer không phải gõ $.user.name, họ chỉ cần gõ user.name
    let jsonPathQuery = segment;

    // Nếu segment bắt đầu bằng một chữ cái (a-z, A-Z) hoặc dấu gạch dưới _,
    // và không phải là các keywords đặc biệt đã bị bắt ở trên,
    // ta mặc định nó là một biến truy cập từ Root Data.
    if (/^[a-zA-Z_]/.test(segment)) {
      jsonPathQuery = `$.${segment}`;
    }

    // Nếu nó đã có sẵn $. hoặc @. hoặc chỉ là $ (do Dev chủ động gõ hoặc do tự thêm ở trên)
    if (jsonPathQuery.startsWith("$.") || jsonPathQuery.startsWith("@.") || jsonPathQuery === "$") {
      try {
        const result = JSONPath.query(data, jsonPathQuery);
        // Chuẩn hóa UI: Nếu JSONPath query trả về đúng 1 phần tử, bóc nó ra cho dễ dùng Pipes.
        return result.length === 1 ? result[0] : (result.length === 0 ? undefined : result);
      } catch (e) {
        // Bắt lỗi an toàn nếu Developer gõ sai cú pháp biến (VD gõ: biến lỗi lầm)
        console.warn(`[JSONQuery] Invalid path query: ${jsonPathQuery}`);
        return undefined;
      }
    }

    return undefined;
  }

  // ==========================================
  // THỰC THI PIPES
  // ==========================================
  private static applyPipe(value: any, pipeExpr: string): any {
    pipeExpr = pipeExpr.trim();
    // Tách tên pipe và các tham số: currency('VND', 'vi-VN')
    const match = pipeExpr.match(/^([a-zA-Z0-9_]+)(?:\((.*)\))?$/);
    if (!match) return value;

    const pipeName = match[1];
    const rawArgsStr = match[2];
    
    // Giải mã tham số của Pipe (nếu có)
    const args = rawArgsStr 
      ? this.smartSplit(rawArgsStr, ",").map(s => this.resolveSegment({}, s)) 
      : [];

    const pipeFunc = PIPES[pipeName];
    if (!pipeFunc) {
      console.warn(`[JSONQuery] Warning: Pipe '${pipeName}' is not registered.`);
      return value;
    }

    return pipeFunc(value, ...args);
  }

  // ==========================================
  // HÀM CẮT CHUỖI THÔNG MINH (CHỐNG CẮT NHẦM TRONG DẤU NHÁY/NGOẶC)
  // ==========================================
  private static smartSplit(str: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let parenLevel = 0;
    let i = 0;

    while (i < str.length) {
      const char = str[i];
      const nextChars = str.slice(i, i + delimiter.length);

      // Quản lý trạng thái ngữ cảnh
      if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
      else if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
      else if (char === '(' && !inSingleQuote && !inDoubleQuote) parenLevel++;
      else if (char === ')' && !inSingleQuote && !inDoubleQuote) parenLevel--;

      // Nếu đang ở ngoài cùng (không bị nhốt trong nháy/ngoặc) và gặp Delimiter -> Cắt!
      if (!inSingleQuote && !inDoubleQuote && parenLevel === 0 && nextChars === delimiter) {
        result.push(current);
        current = "";
        i += delimiter.length;
        continue;
      }

      current += char;
      i++;
    }
    
    if (current !== "") result.push(current);
    return result.map(s => s.trim());
  }
}
