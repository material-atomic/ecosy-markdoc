/**
 * ❌ Wrong: Common adapter mistakes.
 */
import markdoc from "@ecosy/markdoc";
import { server } from "@ecosy/markdoc/nodejs";

const app = markdoc({ repo: "owner/docs" });

// --- Mistake 1: Trying to `new` the returned class ---

const Server = server(app, { port: 3000 });
// ❌ Wrong — the adapter returns a class with STATIC methods only.
//    `Server` is never instantiated; it holds the class-level http.Server.
// @ts-expect-error — constructor is not part of the public contract
const instance = new Server();
void instance;

// --- Mistake 2: Binding on 0.0.0.0 in an unsecured dev environment ---

server(app, {
  port: 3000,
  hostname: "0.0.0.0", // ❌ exposes to LAN — OK for containers behind a
  //    firewall/LB, dangerous on a laptop at a café.
}).start();

// --- Mistake 3: Calling `start()` multiple times expecting a new server ---

Server.start();
Server.start(); // ❌ Second call closes the previous server and rebinds.
//    Fine during HMR (intended behavior), but don't call start() in a loop.

// --- Mistake 4: Bringing in Node-only imports from the app bundle ---

// import { server as edgeServer } from "@ecosy/markdoc";
// ❌ Wrong — `server()` lives in `@ecosy/markdoc/nodejs`, not the default
//    entry. Importing it from the main entry pulls Node APIs into bundles
//    destined for Cloudflare Workers or Deno.

// --- Mistake 5: Forgetting signal handlers in production ---

// The default entry:
//
//   server(app, { port: 3000 }).start();
//
// ❌ Missing SIGTERM handler — Kubernetes / Docker send SIGTERM on graceful
//    termination, and with no handler the process dies immediately,
//    dropping in-flight requests. Always wire `Server.stop()` to SIGTERM
//    and SIGINT in production entries (see correct-graceful-shutdown.ts).

// --- Mistake 6: Reading `req.body` on a GET/HEAD ---

// ❌ The adapter intentionally drops request body for GET/HEAD (HTTP spec).
//    If you need to read JSON, require POST/PUT/PATCH and call
//    `await req.json()` inside the plugin.
