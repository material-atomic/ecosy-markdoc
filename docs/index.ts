import { markdoc } from "@ecosy/markdoc";
import { AutoInvalidate, Sitemap, RobotsTxt, Markdash } from "@ecosy/markdoc/plugins";
import { MarkdownViewer } from "./markdown-viewer";
import withLocally from "./locally";

const app = markdoc(
  withLocally({
    repo: "github.com:material-atomic/ecosy-markdoc",
    branch: "main",
    dir: "docs/content",

    // Swap in a custom markdown-it based parser with GFM + KaTeX + Mermaid +
    // syntax highlighting. See `markdown-viewer.ts` for the reference setup.
    parser: MarkdownViewer(),

    plugins: [
      Sitemap,
      RobotsTxt(),
      Markdash({
        prefix: "/dash",
        enableSwitchSource: true
      }),
      AutoInvalidate({ interval: 5 * 60 * 1000 }), // every 5 minutes
    ],

    // Locally-only options (sliced out by withLocally). In Node dev,
    // content fetches are redirected to a local mirror on this port;
    // on edge runtimes and in production this wrapper is a no-op.
    port: 4999,
  }),
);

export default app;
