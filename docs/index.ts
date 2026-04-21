import { markdoc } from "@ecosy/markdoc";

const app = markdoc({
  repo: "github:ngvcanh/ecosy-markdoc",
  branch: "main",
  dir: "docs/content"
});

export default app;
