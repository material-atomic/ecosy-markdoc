---
title: Running on Node.js
description: Use the Node.js HTTP adapter to serve Markdoc on a traditional Node server
order: 9
---

# Running on Node.js

Ecosy Markdoc is an edge-first framework — it expects the WinterCG `fetch(request)` API. Cloudflare Workers, Deno, Bun, and Vercel Edge all provide this natively, so you can pass `app.fetch` directly as the handler.

Node.js does not. Its `http.createServer` uses `IncomingMessage` and `ServerResponse` from a pre-Fetch era. The `@ecosy/markdoc/node` adapter bridges the two APIs.

## Install

```bash
yarn add @ecosy/markdoc
```

No additional dependencies — the adapter uses only `node:http` from the Node standard library.

## Quick start

```typescript
import markdoc from "@ecosy/markdoc";
import { server } from "@ecosy/markdoc/node";

const app = markdoc({
  repo: "github.com:your-org/your-docs",
  branch: "main",
  dir: "docs/content",
});

server(app, { port: 3000 }).start(() => {
  console.log("http://localhost:3000");
});
```

That is the full integration. `server()` returns a class with static `start()` and `stop()` methods.

## What the adapter does

Every HTTP request goes through this pipeline:

1. Node accepts the connection and creates `IncomingMessage` + `ServerResponse`.
2. Adapter converts `IncomingMessage` → Web `Request`:
   - URL from `req.url` + `req.headers.host`
   - Headers copied into a `Headers` object (array values flattened with `append`)
   - Body for `POST`/`PUT`/`PATCH`/`DELETE` streamed via `ReadableStream<Uint8Array>`
3. Calls `app.fetch(request)` → Web `Response`
4. Writes `Response` back into `ServerResponse`:
   - Status code and status text
   - All headers via `setHeader`
   - Body streamed via the Response's `ReadableStream` reader
5. Errors anywhere in the pipeline return a 500 HTML page with a formatted stack trace.

`GET` and `HEAD` requests have no body, so streaming is skipped on the request side.

## API

### `server(app, options?)`

```typescript
function server(app: EdgeServer, options?: NodeJSOptions): NodeJSServer;

interface EdgeServer {
  fetch(request: Request): Promise<Response>;
}

interface NodeJSOptions {
  port?: number;      // default 3000
  hostname?: string;  // default "127.0.0.1"
}
```

`app` is the value returned by `markdoc(config)`. `options` is optional — sensible defaults apply.

The returned `NodeJSServer` is a class with static methods. You do not instantiate it.

### `NodeJSServer.start(callback?)`

Binds the HTTP server to `port`/`hostname` and begins accepting connections. The optional callback fires once the socket is ready.

```typescript
server(app, { port: 3000 }).start(() => {
  console.log("ready");
});
```

If a server is already running (for example, after hot reload re-executed the module), `start()` **auto-closes the previous instance** and binds the new one. No error is thrown — developers can simply call `start()` from freshly loaded code and trust it to do the right thing.

### `NodeJSServer.stop(callback?)`

Stops the running server. The callback fires once the close completes (or immediately with no error if nothing was running).

```typescript
NodeJSServer.stop((err) => {
  if (err) console.error("stop failed:", err);
  else console.log("stopped");
});
```

## Hot reload

In development with Vite, `tsx watch`, `nodemon`, or similar, the module gets re-executed on every file change. Each re-execution creates a new class returned by `server()`, so a naive implementation would leak the old HTTP server (the new class has no reference to it).

The adapter stores the running server on `globalThis` via `Symbol.for("@ecosy/markdoc/nodejs.httpServer")`. The global symbol registry is shared across module reloads, so:

- Old class definition lost, but its server instance is still reachable through the global symbol.
- New class's `start()` looks up the global server, closes it, binds the new one, replaces the global reference.

You write `start()` once in your entry file. Hot reload handles the rest.

## Hostname

```typescript
server(app, { hostname: "127.0.0.1" })  // localhost only (default)
server(app, { hostname: "0.0.0.0" })    // all interfaces (LAN/containers)
server(app, { hostname: "::" })         // IPv6 all interfaces
```

Default `127.0.0.1` is safer for development — the server is not exposed to your network. Switch to `0.0.0.0` in production containers or when you explicitly want LAN access.

## Graceful shutdown

Handle `SIGINT` and `SIGTERM` to close the server cleanly on exit:

```typescript
const NodeJS = server(app, { port: 3000 });
NodeJS.start(() => console.log("http://localhost:3000"));

function shutdown(signal: string) {
  console.log(`${signal} received — stopping`);
  NodeJS.stop((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

The adapter's `close` waits for in-flight requests to finish before the callback fires — no need for additional drain logic.

## Error handling

Any error thrown inside `app.fetch()` or during stream conversion returns a 500 response:

```html
<html><body>
  <h1>500 — Internal Server Error</h1>
  <pre>... stack trace or message ...</pre>
</body></html>
```

If the error occurs after headers are already sent (mid-stream), the socket is destroyed instead — there is no way to prepend a 500 status to partially-sent bytes.

For production, wrap your `verify`/handlers with proper logging and return sanitized error responses yourself. The built-in 500 page is for development visibility.

## When to use the adapter

Use the Node adapter when:

- You are developing locally with `tsx`, `ts-node`, or compiled JavaScript
- You deploy to a traditional Node host (PM2, systemd, AWS EC2, bare VPS)
- You integrate Markdoc into an existing Node service

Prefer the native fetch export directly when:

- You deploy to Cloudflare Workers — `export default markdoc({...})`
- You deploy to Deno or Deno Deploy — `Deno.serve(app.fetch)`
- You deploy to Bun — `Bun.serve({ fetch: app.fetch })`
- You deploy to Vercel Edge / Netlify Edge — `export default app.fetch`

These runtimes handle the Web Fetch API natively; no adapter is needed.

## Embedding in Tauri desktop apps

Tauri's webview is a browser and speaks Fetch natively, so Markdoc can run client-side inside the webview without any server. A Rust sidecar running the Node adapter is only required if you want a real HTTP server (for example, to serve documentation to external tools over localhost). For in-app documentation viewers, calling `app.fetch(new Request(url))` directly from the React layer is simpler and ships zero extra binary weight.
