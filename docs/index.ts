import { markdoc, Sitemap, RobotsTxt } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github.com:material-atomic/ecosy-markdoc",
  branch: "main",
  dir: "docs/content",
  plugins: [Sitemap, RobotsTxt()],
});

export default app;
