/**
 * ✅ Correct: Minimal Node.js entry.
 *
 * `server(app, { port }).start(cb)` binds the HTTP server on localhost and
 * fires `cb` once listening. The adapter class is stored on globalThis so
 * this file is safe to re-execute under tsx watch / nodemon without
 * port conflicts.
 */
import markdoc from "@ecosy/markdoc";
import { server } from "@ecosy/markdoc/nodejs";

const app = markdoc({
  repo: "owner/docs",
  branch: "main",
  dir: "content",
});

server(app, { port: 3000 }).start(() => {
  console.log("📘 docs running at http://localhost:3000");
});
