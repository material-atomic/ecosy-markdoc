/**
 * ✅ Correct: Load template from a CDN file.
 *
 * The content team owns `_template.html` inside the repo. The runtime
 * fetches it on demand and registers it as the `root` template. Editing
 * the file on GitHub → jsDelivr invalidates → next request pulls the new
 * version. No redeploy.
 */
import markdoc, { Layout } from "@ecosy/markdoc";

export default markdoc({
  repo: "owner/docs",
  dir: "content",

  plugins: [
    Layout({
      template: { root: true },

      // Fetch from <dir>/_template.html on the CDN. `parser: "root"` stores
      // the raw file contents under the "root" template name.
      path: {
        name: "_template.html",
        parser: "root",
      },
    }),
  ],
});
