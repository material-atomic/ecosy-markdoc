import { Injectable } from "../classable/injectable";
import { Storable } from "./storable";

// ─── Store state ──────────────────────────────────────────────────

export interface HeadState {
  /** `<script>` tags for `<head>` (analytics, preloads, etc.) */
  scripts: string;
  /** `<link>` tags for stylesheets and preloads */
  links: string;
  /** `<style>` tag content (inline CSS) */
  style: string;
  /** `<meta>` tags built from page frontmatter */
  metadata: string;
}

export interface BodyState {
  /** Parsed page HTML content */
  main: string;
  /** `<script>` tags rendered at end of `<body>` */
  scripts: string;
}

export interface ScopeState {
  /** Canonical page path (e.g. "guides/writing-markdown.md") */
  path: string;
  /** Public URL for this route */
  url: string | undefined;
  /** Page title from frontmatter */
  title: string;
  /** Page description from frontmatter */
  description: string;
  /** Full frontmatter metadata object */
  metadata: Record<string, unknown>;
  /** Sitemap pages — [canonicalPath, publicUrl] tuples */
  pages: [string, string][];
  /** Arbitrary plugin/request data */
  [key: string]: unknown;
}

export interface PageStoreState {
  head: HeadState;
  body: BodyState;
  scope: ScopeState;
}

const INITIAL_STATE: PageStoreState = {
  head: { scripts: "", links: "", style: "", metadata: "" },
  body: { main: "", scripts: "" },
  scope: { path: "", url: undefined, title: "", description: "", metadata: {}, pages: [] },
};

export class RequestContext extends Injectable({
  store: { target: Storable<PageStoreState>(), get: () => [INITIAL_STATE] },
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
