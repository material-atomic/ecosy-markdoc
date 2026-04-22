import fm from "front-matter";
import { Content, type ContentContextLike, type ContentStatus } from "./content";
import { builtinParser, type MarkdownParser } from "./parser";

export interface MarkdownContextLike extends ContentContextLike {
  /** Optional parser override. When omitted, body stays as raw markdown. */
  parser?: MarkdownParser;
}

export interface MarkdownLike {
  readonly contentUrl: string;
  readonly status: ContentStatus;
  readonly error: unknown;
  readonly metadata: Record<string, unknown>;
  readonly body: string;
  load(): Promise<void>;
}

export function Markdown(context: MarkdownContextLike) {
  const parse = context.parser ?? null;

  return class MarkdownNode extends Content(context) {
    private _metadata: Record<string, unknown> = {};
    private _body: string = "";

    async load() {
      await this.execute();

      if (this.status === "completed" && this.data) {
        const { attributes: data, body: content } = fm<Record<string, unknown>>(this.data);
        this._metadata = data;
        this._body = parse ? parse(content, data) : content;
      }
    }

    get metadata() { return this._metadata; }
    get body() { return this._body; }
  };
}
