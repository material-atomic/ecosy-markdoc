/**
 * ✅ Correct: Dev entry — works under tsx watch / nodemon / vite-node.
 *
 * Run with:  `yarn dev`  (package.json: `"dev": "tsx watch src/dev.ts"`)
 *
 * Each file change re-executes this module. The adapter detects the previous
 * HTTP server on globalThis, closes it, then binds the new one on the same
 * port — no EADDRINUSE, no manual cleanup.
 */
import markdoc, { html } from "@ecosy/markdoc";
import { AutoInvalidate, Layout, Markdash } from "@ecosy/markdoc/plugins";
import { server } from "@ecosy/markdoc/nodejs";

const app = markdoc({
  repo: "owner/docs",
  dir: "content",

  // Short TTL so content edits are picked up within a minute.
  revalidate: 30_000,

  plugins: [
    Layout({
      template: { root: true },
      getTemplate: html`
        <!DOCTYPE html>
        <html>
          <head><title>{{ scope.title }} (dev)</title></head>
          <body>
            {{ body.main }}
          </body>
        </html>
      `,
    }),
    // Dev dashboard — reload manifest / engine / pages from the browser.
    Markdash({ prefix: "_dev/dash" }),

    // Proactive refresh every 30s in dev.
    AutoInvalidate({
      interval: 30_000,
      targets: ["manifest", "pages"],
    }),
  ],
});

server(app, {
  port: 3000,
  hostname: "127.0.0.1", // loopback — keep dev servers off the LAN
}).start(() => {
  console.log("[dev] http://localhost:3000");
  console.log("[dev] dashboard: http://localhost:3000/_dev/dash");
});
