/**
 * ✅ Correct: Minimal Cloudflare Workers deployment.
 *
 * The `markdoc()` factory returns a WinterCG-compatible fetch handler.
 * Re-exporting it as the module default is the whole deployment.
 */
import markdoc from "@ecosy/markdoc";

const app = markdoc({
  repo: "owner/docs",
  branch: "main",
  dir: "content",

  // 5 minute TTL — CDN-fetched assets (manifest, markdown, components) are
  // re-fetched lazily after this window elapses, on the next matching request.
  revalidate: 5 * 60_000,
});

export default {
  fetch: app.fetch,
};
