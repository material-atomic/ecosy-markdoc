import { Serialize } from "@ecosy/core/serialize";
import { Injectable } from "@ecosy/classable/injectable";
import { Storable } from "./storable";
import { MarkdocURL } from "./url";

export interface RequestStoreState {
  headers: Record<string, string>;
  cookies: Record<string, string>;
  queries: Record<string, string>;
}

/**
 * MarkdocRequest — controlled request interface for plugins.
 *
 * Wraps the raw WinterCG Request so plugins never touch
 * the underlying platform request directly.
 *
 * URL is parsed via MarkdocURL for full context (host, origin, CORS, embed).
 * Headers and cookies are auto-parsed into a Storable store
 * with normalized lowercase keys. The get methods match
 * case-insensitively so developers don't have to worry about
 * header casing.
 */
export class MarkdocRequest extends Injectable({
  store: {
    target: Storable<RequestStoreState>(),
    get: () => [{ headers: {}, cookies: {}, queries: {} }],
  },
}) {
  /** Parsed URL with security utilities (CORS, referrer, embed). */
  readonly mdUrl: MarkdocURL;
  readonly pathname: string;
  readonly method: string;

  /**
   * Raw underlying `Request`. Kept for body access (`json()`, `formData()`, ...)
   * that the WinterCG Fetch API only exposes on the original Request instance.
   * Most consumers should use `req.json()` / `req.formData()` / `req.text()`
   * instead of touching `raw` directly.
   */
  readonly raw: Request;

  constructor(request: Request) {
    super();
    this.raw = request;
    this.mdUrl = MarkdocURL.from(request);
    this.pathname = this.mdUrl.pathname;
    this.method = request.method;

    // Headers — normalize keys to lowercase
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Cookies — parse from Cookie header using Serialize.URL.decode
    const cookies: Record<string, string> = {};
    const raw = headers["cookie"];
    if (raw) {
      for (const pair of raw.split(";")) {
        const idx = pair.indexOf("=");
        if (idx === -1) continue;
        const key = pair.slice(0, idx).trim();
        const value = Serialize.URL.decode(pair.slice(idx + 1).trim());
        cookies[key] = value;
      }
    }

    // Queries — already parsed by MarkdocURL
    const queries = this.mdUrl.query;

    this.store.setState({ headers, cookies, queries });
  }

  /**
   * Get a header value. Case-insensitive match.
   */
  header(name: string): string | undefined {
    return this.store.getState().headers[name.toLowerCase()];
  }

  /**
   * Get all headers (normalized lowercase keys).
   */
  get headers(): Record<string, string> {
    return this.store.getState().headers;
  }

  /**
   * Get a cookie value by name.
   */
  cookie(name: string): string | undefined {
    return this.store.getState().cookies[name];
  }

  /**
   * Get all cookies.
   */
  get cookies(): Record<string, string> {
    return this.store.getState().cookies;
  }

  /**
   * Get a query parameter value.
   */
  query(name: string): string | undefined {
    return this.store.getState().queries[name];
  }

  /**
   * Get all query parameters.
   */
  get queries(): Record<string, string> {
    return this.store.getState().queries;
  }

  // ─── Body accessors ────────────────────────────────────────────────
  // Delegate to the underlying Fetch API Request. Note: body streams can
  // only be consumed ONCE — don't call `json()` after `text()` on the same request.

  /**
   * Parse body as JSON. Throws if body isn't valid JSON.
   *
   * @example
   * const { email, password } = await req.json<{ email: string; password: string }>();
   */
  json<T = unknown>(): Promise<T> {
    return this.raw.json() as Promise<T>;
  }

  /**
   * Parse body as `FormData`. For `multipart/form-data` or `application/x-www-form-urlencoded`.
   *
   * @example
   * const form = await req.formData();
   * const email = form.get("email");
   */
  formData(): Promise<FormData> {
    return this.raw.formData();
  }

  /**
   * Read body as text.
   */
  text(): Promise<string> {
    return this.raw.text();
  }

  /**
   * Read body as binary buffer.
   */
  arrayBuffer(): Promise<ArrayBuffer> {
    return this.raw.arrayBuffer();
  }

  /**
   * Raw readable stream of the body. `null` for GET/HEAD or empty body.
   * Prefer `json()` / `formData()` / `text()` unless you need streaming.
   */
  get body(): ReadableStream<Uint8Array> | null {
    return this.raw.body;
  }

  static from(request: Request): MarkdocRequest {
    return new MarkdocRequest(request);
  }
}
