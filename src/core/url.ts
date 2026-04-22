import { Serialize } from "@ecosy/core";

// ─── Types ─────────────────────────────────────────────────────────

export interface MarkdocURLContext {
  /** Full original URL string. */
  url: string;
  /** Hostname with port (e.g. `localhost:3000`). */
  host: string;
  /** Hostname without port (e.g. `localhost`). */
  hostname: string;
  /** Protocol + host (e.g. `https://example.com`). */
  origin: string;
  /** Protocol (e.g. `https:`). */
  protocol: string;
  /** Pathname portion (e.g. `/docs/getting-started`). */
  pathname: string;
  /** Raw query string including `?`. Empty string if none. */
  search: string;
  /** Parsed query parameters. */
  query: Record<string, string>;
  /** Parsed path params from dynamic route segments. */
  params: Record<string, string>;
}

// ─── MarkdocURL ────────────────────────────────────────────────────

/**
 * MarkdocURL — centralized URL parser and security checker.
 *
 * Wraps the raw URL string into a structured context object and
 * provides utilities for common edge-runtime URL operations:
 *
 * - **Parsing**: host, hostname, origin, protocol, pathname, query, params
 * - **CORS**: origin matching with allowlist support
 * - **Referrer**: extract and validate the `Referer` header origin
 * - **Embed protection**: detect iframe/embed via `Sec-Fetch-Dest` header
 * - **Same-origin check**: compare request origin against self
 *
 * Designed to work with WinterCG `Request` where `request.url`
 * always contains the full URL including protocol and host.
 */
export class MarkdocURL {
  private readonly parsed: URL;

  /** Full original URL string. */
  readonly url: string;
  /** Hostname with port. */
  readonly host: string;
  /** Hostname without port. */
  readonly hostname: string;
  /** Protocol + host. */
  readonly origin: string;
  /** Protocol (e.g. `https:`). */
  readonly protocol: string;
  /** Pathname, trailing slash stripped (except root). */
  readonly pathname: string;
  /** Raw query string including `?`. */
  readonly search: string;
  /** Parsed query parameters via Serialize.queryString. */
  readonly query: Record<string, string>;
  /** Path params — populated by Router.match(). */
  params: Record<string, string> = {};

  constructor(url: string) {
    this.url = url;

    try {
      this.parsed = url.includes("://") ? new URL(url) : new URL(url, "http://localhost");
    } catch {
      this.parsed = new URL("http://localhost");
    }

    this.host = this.parsed.host;
    this.hostname = this.parsed.hostname;
    this.origin = this.parsed.origin;
    this.protocol = this.parsed.protocol;
    this.search = this.parsed.search;
    this.query = Serialize.queryString.parse(this.search);

    // Normalize pathname: strip trailing slash except root
    let pathname = this.parsed.pathname;
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    this.pathname = pathname;
  }

  // ─── CORS ──────────────────────────────────────────────────────────

  /**
   * Check if a given origin is allowed by the allowlist.
   * Supports exact match and wildcard `*`.
   *
   * @param requestOrigin - The `Origin` header from the request.
   * @param allowlist - Array of allowed origins. `["*"]` allows all.
   */
  isCorsAllowed(requestOrigin: string, allowlist: string[]): boolean {
    if (!requestOrigin) return false;
    if (allowlist.includes("*")) return true;
    return allowlist.some(allowed => allowed === requestOrigin);
  }

  /**
   * Check if a request origin matches this URL's origin (same-origin policy).
   *
   * @param requestOrigin - The `Origin` header value from the incoming request.
   */
  isSameOrigin(requestOrigin: string): boolean {
    if (!requestOrigin) return false;
    return requestOrigin === this.origin;
  }

  // ─── Referrer ──────────────────────────────────────────────────────

  /**
   * Extract and parse the origin from a `Referer` header value.
   * Returns `null` if the header is missing or unparseable.
   *
   * @param referer - The raw `Referer` header string.
   */
  static parseRefererOrigin(referer: string | undefined): string | null {
    if (!referer) return null;
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  /**
   * Check if the referer origin matches this URL's origin.
   *
   * @param referer - The raw `Referer` header string.
   */
  isRefererSameOrigin(referer: string | undefined): boolean {
    const refOrigin = MarkdocURL.parseRefererOrigin(referer);
    return refOrigin !== null && refOrigin === this.origin;
  }

  // ──�� Embed / iframe protection ─────────────────────────────────────

  /**
   * Detect if the request is an embed/iframe request using `Sec-Fetch-Dest`.
   *
   * Common values:
   * - `document` → normal navigation
   * - `iframe` → loaded inside an iframe
   * - `embed` / `object` → embedded content
   *
   * @param secFetchDest - The `Sec-Fetch-Dest` header value.
   */
  static isEmbed(secFetchDest: string | undefined): boolean {
    if (!secFetchDest) return false;
    const dest = secFetchDest.toLowerCase();
    return dest === "iframe" || dest === "embed" || dest === "object";
  }

  /**
   * Detect if the request is a cross-site request using `Sec-Fetch-Site`.
   *
   * Values: `same-origin`, `same-site`, `cross-site`, `none`
   *
   * @param secFetchSite - The `Sec-Fetch-Site` header value.
   */
  static isCrossSite(secFetchSite: string | undefined): boolean {
    return secFetchSite === "cross-site";
  }

  // ─── Serialization ─────────────────────────────────────────────────

  /**
   * Export as a plain object (for use in RouteMatch, store state, etc.)
   */
  toContext(): MarkdocURLContext {
    return {
      url: this.url,
      host: this.host,
      hostname: this.hostname,
      origin: this.origin,
      protocol: this.protocol,
      pathname: this.pathname,
      search: this.search,
      query: this.query,
      params: this.params,
    };
  }

  /**
   * Create from a WinterCG Request.
   */
  static from(request: Request): MarkdocURL {
    return new MarkdocURL(request.url);
  }
}
