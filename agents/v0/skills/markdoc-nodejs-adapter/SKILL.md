---
name: markdoc-nodejs-adapter
description: Skill for running a Markdoc app on Node.js. Call this skill when deploying to a long-running Node server (Docker, VM, bare metal), integrating with a process supervisor, or configuring hot-reload-friendly development via tsx/nodemon/vite.
---

# Node.js Adapter — `@ecosy/markdoc/nodejs`

<instructions>
  <rule>
    <title>Node is a separate import path — `@ecosy/markdoc/nodejs`</title>
    <details>
      The core runtime is WinterCG-native and contains no Node-specific code. To run it on Node.js, import `server` from `@ecosy/markdoc/nodejs`. The adapter bridges Node's `IncomingMessage`/`ServerResponse` onto the Web `Request`/`Response` APIs the app's `fetch()` expects. This keeps the runtime bundle small for Workers/Edge consumers.
    </details>
  </rule>
  <rule>
    <title>`server(app, options)` returns a class, not an instance</title>
    <details>
      The adapter is a factory returning a class with two static methods: `start(callback?)` and `stop(callback?)`. Call `server(app).start()` once in your entry file. You never `new` the result — the static methods operate on a class-level HTTP server handle stored on `globalThis` via `Symbol.for`.
    </details>
  </rule>
  <rule>
    <title>HMR-friendly via `globalThis` symbol registry</title>
    <details>
      Hot-reload tools (tsx watch, nodemon, vite-node) re-execute the entry module on file change. Each re-execution returns a fresh `NodeJSServer` class with an empty static slot — which would normally leave a zombie HTTP server bound to the port. The adapter sidesteps this by stashing the running `http.Server` under `Symbol.for("@ecosy/markdoc/nodejs.httpServer")`. On `start()`, the new class finds the previous server, closes it, then binds. No port conflicts, no manual cleanup.
    </details>
  </rule>
  <rule>
    <title>`hostname` defaults to `127.0.0.1` — loopback only</title>
    <details>
      The adapter binds to localhost by default so you don't accidentally expose a dev server on all interfaces. Set `hostname: "0.0.0.0"` explicitly to accept connections from outside the host (container deployments, LAN testing). Never leave this on `0.0.0.0` in a misconfigured dev environment — pair it with a firewall or reverse proxy.
    </details>
  </rule>
  <rule>
    <title>Streaming bodies require `duplex: "half"`</title>
    <details>
      The adapter streams POST/PUT/PATCH bodies from `IncomingMessage` into a Web `ReadableStream`. Node 18+ with undici enforces the `duplex: "half"` option on `Request` whenever a streaming body is attached — the adapter sets it automatically. If you see `TypeError: Request with a non-null body must have a duplex property set`, it's because the adapter was bypassed or a middleware mutated the request.
    </details>
  </rule>
  <rule>
    <title>Response bodies stream back — no full buffering</title>
    <details>
      The adapter pulls from the Web `Response.body` reader and writes chunks directly to the Node response. Large HTML pages or streamed APIs don't materialize fully in memory. If the app returns a `Response` with no body, the adapter calls `res.end()` immediately.
    </details>
  </rule>
  <rule>
    <title>`stop()` is cooperative — it waits for the HTTP server to close</title>
    <details>
      `NodeJSServer.stop(cb)` calls `httpServer.close()`, which stops accepting new connections and waits for in-flight requests to finish. Use this in signal handlers (`SIGTERM`, `SIGINT`) for graceful shutdown. If you need a forceful kill, set a timeout on your end — the adapter itself never forces sockets closed.
    </details>
  </rule>
</instructions>

<examples>
  <example>
    <description>Correct: Minimal Node.js entry file</description>
    <reference_path>./examples/correct-minimal.ts</reference_path>
  </example>
  <example>
    <description>Correct: Production entry with graceful shutdown</description>
    <reference_path>./examples/correct-graceful-shutdown.ts</reference_path>
  </example>
  <example>
    <description>Correct: Dev server with tsx watch + HMR</description>
    <reference_path>./examples/correct-dev.ts</reference_path>
  </example>
  <example>
    <description>Wrong: Common adapter mistakes</description>
    <reference_path>./examples/wrong-patterns.ts</reference_path>
  </example>
</examples>
