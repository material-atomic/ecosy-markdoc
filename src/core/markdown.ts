import { Content, type ContentContextLike, type ContentStatus } from "./content";

export interface MarkdownLike {
  readonly contentUrl: string;
  readonly status: ContentStatus;
  readonly error: unknown;
  readonly metadata: Record<string, unknown>;
  readonly body: string;
  load(): Promise<void>;
}

export function Markdown(context: ContentContextLike) {
  return class MarkdownNode extends Content(context) {
    private _metadata: Record<string, unknown> = {};
    private _body: string = "";

    async load() {
      await this.execute();

      if (this.status === "completed" && this.data) {
        this.parse(this.data);
      }
    }

    /**
     * Parse raw YAML-subset frontmatter string into key-value pairs.
     *
     * Supports:
     *   - `key: value` (scalar, with boolean/number/null coercion)
     *   - `key: "quoted value"` (strips quotes)
     *   - `key:` followed by `- item` lines (flat list)
     *
     * Static so it can be reused outside of a MarkdownNode instance.
     */
    static parseFrontmatter(raw: string): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      const lines = raw.split("\n");

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];

        if (!line.trim() || line.trim().startsWith("#")) {
          i++;
          continue;
        }

        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) {
          i++;
          continue;
        }

        const key = line.slice(0, colonIndex).trim();
        const valueStr = line.slice(colonIndex + 1).trim();

        if (!key) {
          i++;
          continue;
        }

        if (valueStr === "") {
          const items: string[] = [];
          i++;
          while (i < lines.length) {
            const nextLine = lines[i];
            const trimmed = nextLine.trim();
            if (trimmed.startsWith("- ")) {
              items.push(trimmed.slice(2).trim());
              i++;
            } else if (trimmed === "-") {
              i++;
            } else if (nextLine.match(/^\s/) && trimmed === "") {
              i++;
            } else {
              break;
            }
          }
          result[key] = items.length > 0 ? items : "";
          continue;
        }

        let value: unknown = valueStr;
        if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        if (value === "true") value = true;
        else if (value === "false") value = false;
        else if (value === "null") value = null;
        else if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
          value = Number(value);
        }

        result[key] = value;
        i++;
      }

      return result;
    }

    private parse(rawContent: string) {
      const fenceMatch = rawContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);

      if (fenceMatch) {
        this._metadata = MarkdownNode.parseFrontmatter(fenceMatch[1]);
        this._body = fenceMatch[2];
      } else {
        this._body = rawContent;
      }
    }

    get metadata() { return this._metadata; }
    get body() { return this._body; }
  };
}
