/**
 * ✅ Correct: Cloudflare Workers entry — `src/worker.ts`.
 *
 * The Workers runtime passes an `env` object to every fetch invocation.
 * Build the app lazily inside `fetch()` (on cold start) and cache the
 * instance in a module-level ref. Do NOT call `buildApp()` at top-level —
 * Cloudflare does not guarantee env bindings are populated at import time.
 */
import { buildApp, type AppEnv } from "./app";

type WorkerEnv = {
  JWT_SECRET: string;
};

type App = ReturnType<typeof buildApp>;
let cached: App | null = null;

function getApp(env: WorkerEnv): App {
  if (cached) return cached;
  const appEnv: AppEnv = { JWT_SECRET: env.JWT_SECRET, RUNTIME: "workers" };
  cached = buildApp(appEnv);
  return cached;
}

export default {
  async fetch(request: Request, env: WorkerEnv) {
    return getApp(env).fetch(request);
  },
};
