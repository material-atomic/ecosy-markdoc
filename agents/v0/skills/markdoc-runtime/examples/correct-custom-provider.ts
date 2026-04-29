/**
 * ✅ Correct: Point the runtime at `raw.githubusercontent.com` instead of
 * jsDelivr.
 *
 * The default URL shape is jsDelivr's:
 *
 *     https://cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/<dir>/<path>
 *
 * `raw.githubusercontent.com` uses a different layout — it separates the
 * repo and branch with `/` rather than `@`, and the prefix segment is
 * `/<owner>/<repo>/<branch>` (no `gh/`). Change `provider` to the new
 * base URL and `interpolate` to match the new shape. Everything
 * downstream (`Manifest`, `Engine`, `Pagable`, `Fetchable`) stays
 * unchanged.
 */
import markdoc from "@ecosy/markdoc";

export default markdoc({
  repo: "owner/docs",
  branch: "main",
  dir: "content",

  // Point at GitHub's raw CDN directly (no jsDelivr in between).
  provider: "https://raw.githubusercontent.com",

  // Drop the `@` before `{branch}` — raw.githubusercontent uses `/`.
  // The default template would produce `.../owner/repo@main/...`; we
  // need `.../owner/repo/main/...`.
  interpolate: "{provider}/{repo}/{branch}{dir}{path}",
});

// The runtime will now fetch e.g.:
//   https://raw.githubusercontent.com/owner/docs/main/content/index.md
//
// …instead of:
//   https://cdn.jsdelivr.net/gh/owner/docs@main/content/index.md
