import { Serialize } from "@ecosy/core";

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/**
 * MarkdocResponse — controlled response builder for plugins.
 *
 * Plugins build responses through this interface instead of
 * constructing raw Response objects. Markdoc converts the
 * final MarkdocResponse into a platform Response internally.
 */
export class MarkdocResponse {
  private _status = 200;
  private _headers = new Map<string, string[]>();
  private _body: string | null = null;
  private _poweredBy: string | false = "Markdoc";

  status(code: number): this {
    this._status = code;
    return this;
  }

  /**
   * Set a response header. Replaces any existing value for this key.
   */
  setHeader(key: string, value: string): this {
    this._headers.set(key.toLowerCase(), [value]);
    return this;
  }

  /**
   * Append a value to a response header (e.g. multiple Set-Cookie).
   */
  appendHeader(key: string, value: string): this {
    const normalized = key.toLowerCase();
    const existing = this._headers.get(normalized) ?? [];
    existing.push(value);
    this._headers.set(normalized, existing);
    return this;
  }

  /**
   * Set a cookie on the response.
   */
  setCookie(name: string, value: string, options: CookieOptions = {}): this {
    const encoded = Serialize.URL.encode(value);
    const parts = [`${name}=${encoded}`];

    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.secure) parts.push("Secure");
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

    return this.appendHeader("set-cookie", parts.join("; "));
  }

  /**
   * Clear a cookie by setting Max-Age=0.
   */
  clearCookie(name: string, options: Pick<CookieOptions, "path" | "domain"> = {}): this {
    return this.setCookie(name, "", { ...options, maxAge: 0 });
  }

  /**
   * Set custom X-Powered-By header. Pass `false` to hide it entirely.
   */
  setPoweredBy(value: string | false): this {
    this._poweredBy = value;
    return this;
  }

  html(body: string): this {
    this._body = body;
    this.setHeader("content-type", "text/html");
    return this;
  }

  text(body: string): this {
    this._body = body;
    this.setHeader("content-type", "text/plain");
    return this;
  }

  xml(body: string): this {
    this._body = body;
    this.setHeader("content-type", "application/xml");
    return this;
  }

  json(data: unknown): this {
    this._body = Serialize.JSON.stringify(data);
    this.setHeader("content-type", "application/json");
    return this;
  }

  /**
   * Convert to platform Response. Called internally by Server.
   */
  toResponse(): Response {
    const headers = new Headers();
    if (this._poweredBy !== false) {
      headers.set("x-powered-by", this._poweredBy);
    }
    for (const [key, values] of this._headers) {
      for (const value of values) {
        headers.append(key, value);
      }
    }
    return new Response(this._body, {
      status: this._status,
      headers,
    });
  }
}
