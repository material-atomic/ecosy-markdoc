/**
 * ✅ Correct: Markdown template with a custom parser.
 *
 * The content team prefers markdown over raw HTML. Store `_layout.md` in
 * the repo, hand the runtime a parser function that runs it through
 * `marked` (or any markdown processor) and stores the HTML output under
 * the `root` template name.
 *
 * NB: `marked` is an example dependency — swap in whatever parser you use.
 */
import markdoc, { Layout } from "@ecosy/markdoc";
import { marked } from "marked";

export default markdoc({
  repo: "owner/docs",
  dir: "content",

  plugins: [
    Layout({
      template: { root: true },

      path: {
        name: "_layout.md",
        // Custom parser — receives raw file, returns processed template HTML.
        // Whatever string it returns is stored under the "root" template name.
        parser: async (content) => {
          const html = await marked.parse(content);
          return `<!DOCTYPE html><html><head><title>{{ scope.title }}</title></head><body>${html}<div>{{ body.main }}</div></body></html>`;
        },
      },
    }),
  ],
});
