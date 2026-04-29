/**
 * ✅ Correct: Production entry with graceful shutdown.
 *
 * Binds on all interfaces (for Docker / VM), wires SIGTERM / SIGINT handlers
 * that drain in-flight requests before exiting, and bounds the drain to
 * 15 seconds so the process exits even if a request is hung.
 */
import markdoc from "@ecosy/markdoc";
import { server } from "@ecosy/markdoc/nodejs";

const app = markdoc({
  repo: "owner/docs",
  branch: "main",
  dir: "content",
});

const PORT = Number(process.env.PORT) || 3000;
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const Server = server(app, { port: PORT, hostname: HOSTNAME });

Server.start(() => {
  console.log(`[markdoc] listening on http://${HOSTNAME}:${PORT}`);
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[markdoc] received ${signal}, draining…`);

  const drainTimeout = setTimeout(() => {
    console.error("[markdoc] drain timeout exceeded, forcing exit");
    process.exit(1);
  }, 15_000);
  drainTimeout.unref();

  Server.stop((err) => {
    clearTimeout(drainTimeout);
    if (err) {
      console.error("[markdoc] stop error:", err);
      process.exit(1);
    }
    console.log("[markdoc] shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
