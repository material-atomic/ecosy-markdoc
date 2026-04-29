/**
 * ❌ Wrong: Common configuration mistakes.
 *
 * Each block is a standalone counter-example — do not combine them.
 */
import markdoc, { Layout } from "@ecosy/markdoc";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const SomeCustomConfig: unknown;

// --- Mistake 1: Missing required `repo` ---

// @ts-expect-error — `repo` is required
const app1 = markdoc({
  branch: "main",
  dir: "content",
});

// --- Mistake 2: Trying to new the runtime directly ---

import { Runtimable } from "@ecosy/markdoc";

const Runtime = Runtimable({ repo: "owner/repo" });
// ❌ Wrong — bypasses the server, plugin resolution, teleport wiring.
//    Always go through `markdoc(config)`.
// @ts-expect-error — no-args ctor intentionally misused to illustrate.
const runtime = new Runtime();
void runtime;

// --- Mistake 3: Using `imports` to serve a URL ---

markdoc({
  repo: "owner/repo",
  imports: {
    // ❌ Wrong — imports are runtime services, not request handlers.
    //    URLs belong in `plugins`.
    wrongHandler: class {
      fetch() {
        return new Response("nope");
      }
    },
  },
});

// --- Mistake 4: Overriding a reserved key through `imports` ---

markdoc({
  repo: "owner/repo",
  imports: {
    // ❌ Wrong — `configuration`, `repo`, `documentation`, `fetchable`,
    //    `manifest`, `pagable`, `pluginable`, `server` are reserved.
    //    The runtime filters them out and warns at construction time.
    configuration: SomeCustomConfig as never,
  },
});

// --- Mistake 5: Two root layouts ---

markdoc({
  repo: "owner/repo",
  plugins: [
    Layout({ template: { root: true } }), // first wins
    Layout({ template: { root: true } }), // ❌ never registered
  ],
});

// --- Mistake 6: Treating `markdoc()` as async ---

// ❌ Wrong — `markdoc()` is synchronous. No network calls happen here.
//    All fetching is lazy inside `app.fetch()`.
// const app2 = await markdoc({ repo: "owner/repo" });

// --- Mistake 7: Reaching for Node APIs from a plugin ---

// import fs from "node:fs"; // ❌ Wrong — not available on Workers.
// Use `this.fetchable.http.get(url)` or the WinterCG `fetch()` instead.

void app1;
