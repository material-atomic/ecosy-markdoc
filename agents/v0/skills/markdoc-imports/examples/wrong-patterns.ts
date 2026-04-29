/**
 * ❌ Wrong: Common import mistakes.
 */
import markdoc from "@ecosy/markdoc";

// --- Mistake 1: Putting periodic-tick services into `imports` ---

class WrongAutoInvalidate {
  constructor() {
    // ❌ Wrong — imports are eagerly constructed when `markdoc()` returns.
    //    Calling `setInterval` here runs in module-load scope, which throws
    //    on Cloudflare Workers ("Disallowed operation called within global
    //    scope"). Use the shipped `AutoInvalidate` plugin instead — its
    //    `start()` runs on the first request, after the runtime is live.
    setInterval(() => console.log("tick"), 60_000);
  }
}

markdoc({
  repo: "owner/docs",
  imports: {
    autoInvalidate: WrongAutoInvalidate,
  },
});

// --- Mistake 2: Overriding a reserved key ---

declare class BogusConfiguration {
  readonly options: unknown;
}

markdoc({
  repo: "owner/docs",
  imports: {
    // ❌ Wrong — `configuration` is reserved and filtered out.
    //    (Also: `repo`, `documentation`, `fetchable`, `manifest`, `pagable`,
    //    `pluginable`, `server`.) The runtime logs a warning and ignores it.
    configuration: BogusConfiguration,
  },
});

// --- Mistake 3: Passing an instance instead of a class ---

class Uploader {
  async flush() {
    /* ... */
  }
}

markdoc({
  repo: "owner/docs",
  imports: {
    // ❌ Wrong — imports must be a class or { target, get }, not an instance.
    // @ts-expect-error
    uploader: new Uploader(),
  },
});

// --- Mistake 4: Missing `onDispose` on a timer-based import ---

class LeakyReporter {
  constructor() {
    // ❌ Wrong — no `onDispose`. The timer keeps the Node process alive
    //    when the runtime tears down, preventing graceful shutdown.
    setInterval(() => console.log("tick"), 1_000);
  }
}

markdoc({
  repo: "owner/docs",
  imports: { leaky: LeakyReporter },
});

// --- Mistake 5: Using imports to answer URLs ---

class UrlHandler {
  // ❌ Wrong — imports don't receive requests. URLs belong in `plugins`.
  fetch() {
    return new Response("nope");
  }
}

markdoc({
  repo: "owner/docs",
  imports: {
    wrongHandler: UrlHandler,
  },
});
