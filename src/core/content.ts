import type { FetchableLike } from "./fetchable";
import { Revalidate } from "./revalidate";

export type ContentStatus = "idle" | "fetching" | "error" | "completed";

/**
 * Context contract for content loading.
 * Lib classes depend on this interface only — they don't know
 * where fetchable, revalidate, or contentUrl come from.
 * Each caller provides its own instance.
 */
export interface ContentContextLike {
  fetchable: FetchableLike;
  revalidate: number;
  contentUrl: string;
}

export function Content(context: ContentContextLike) {
  return class ContentNode extends Revalidate({ duration: context.revalidate }) {
    public readonly contentUrl = context.contentUrl;

    protected _status: ContentStatus = "idle";
    protected _error: unknown;
    protected _data: string | null = null;
    protected _result: unknown = null;
    protected _lastFetched: number = 0;

    async execute() {
      if (this._status === "completed" && !this.shouldRevalidate(this._lastFetched)) {
        return;
      }

      this._status = "fetching";
      this._error = null;

      try {
        const result = await context.fetchable.http.get<string | null>(context.contentUrl);
        this._result = result;

        if (result.success) {
          this._data = result.data;
          this._lastFetched = Date.now();
          this._status = "completed";
        } else {
          this._error = result.error;
          this._status = "error";
        }
      } catch (err) {
        this._error = err;
        this._status = "error";
      }
    }

    get status() { return this._status; }
    get data() { return this._data; }
    get result() { return this._result; }
    get error() { return this._error; }
  };
}
