/**
 * ✅ Correct: Node.js entry — `src/server.ts`.
 *
 * Loads env from `process.env`, builds the shared app, wires SIGTERM /
 * SIGINT for graceful drain. `AutoInvalidate` runs cross-runtime via the
 * plugin pipeline, so no runtime gating is needed here.
 */
import { server } from "@ecosy/markdoc/nodejs";
import { buildApp, type AppEnv } from "./app";

const env: AppEnv = {
  JWT_SECRET: process.env.JWT_SECRET ?? (() => {
    console.error("JWT_SECRET is required");
    process.exit(1);
  })(),
  RUNTIME: "node",
};

const app = buildApp(env);

const PORT = Number(process.env.PORT) || 3000;
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const Server = server(app, { port: PORT, hostname: HOSTNAME });

Server.start(() => {
  console.log(`[markdoc] listening on http://${HOSTNAME}:${PORT}`);
});

// --- Graceful shutdown ---
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[markdoc] received ${signal}, draining…`);

  const t = setTimeout(() => {
    console.error("[markdoc] drain timeout, exit(1)");
    process.exit(1);
  }, 15_000);
  t.unref();

  Server.stop((err) => {
    clearTimeout(t);
    if (err) {
      console.error("[markdoc] stop error", err);
      process.exit(1);
    }
    console.log("[markdoc] shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
