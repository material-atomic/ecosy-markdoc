import { Injectable } from "../classable/injectable";
import { Storable } from "./storable";

export interface PageStoreState {
  path: string;
  url: string | undefined;
  metadata: Record<string, unknown>;
  body: string;
  /** Sitemap pages — populated by Server for plugin access. */
  pages: [string, string][];
}

export class RequestContext extends Injectable({
  store: { target: Storable<PageStoreState>(), get: () => [{ path: "", url: undefined, metadata: {}, body: "", pages: [] }] },
}) {
  readonly url: URL;
  readonly pathname: string;
  readonly method: string;
  readonly headers: Headers;
  readonly canonicalPath: string;

  constructor(readonly request: Request) {
    super();
    this.url = new URL(request.url);
    this.pathname = this.url.pathname.replace(/^\//, "");
    this.method = request.method;
    this.headers = request.headers;
    this.canonicalPath = this.pathname.endsWith(".md")
      ? this.pathname
      : `${this.pathname}.md`;
  }

  static from(request: Request): RequestContext {
    return new RequestContext(request);
  }
}
