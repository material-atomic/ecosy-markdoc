import { markdoc, inspect, Sitemap } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github:material-atomic/ecosy-markdoc",
  branch: "main",
  dir: "docs/content",
  plugins: [Sitemap],
});

inspect();

export default app;
