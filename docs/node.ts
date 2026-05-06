/**
 * Node.js deployment entry — alternative to the WinterCG `index.ts` entry.
 *
 * `index.ts` is the canonical app: it returns a `{ fetch }` server that
 * runs on Cloudflare Workers, Deno Deploy, Vercel Edge, or any other
 * WinterCG-compatible runtime. It is also what `wrangler dev` uses for
 * local edge emulation. Most consumers ship only `index.ts`.
 *
 * `node.ts` (this file) wraps the same `app` with the `@ecosy/markdoc/nodejs`
 * adapter so it can be hosted on a plain Node.js process — useful when the
 * target is a long-running Node server (Hetzner, Fly.io, a container behind
 * a reverse proxy, …) instead of a Workers-style runtime. The two files
 * coexist in this folder to demonstrate both deployment shapes; consumers
 * pick whichever matches their host and delete the other.
 *
 * Not required for development. `withLocally` (see `./locally.ts`) lazily
 * boots its own Node HTTP server for the filesystem mirror when running
 * under `wrangler dev` in dev mode — no separate Node entry process is
 * needed to get edit-save-reload against a working copy.
 *
 * Run with: `tsx node.ts` (or compiled JS).
 *   PORT — defaults to 3000
 *   HOST — defaults to 127.0.0.1
 */

import app from "./index";
import { server } from "@ecosy/markdoc/nodejs";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

server(app, { port: PORT, hostname: HOST }).start(() => {
  console.log(`Ecosy Markdoc docs → http://${HOST}:${PORT}`);
});
