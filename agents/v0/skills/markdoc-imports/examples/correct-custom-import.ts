/**
 * ✅ Correct: Custom observability import.
 *
 * `MetricsReporter` periodically dumps manifest / page counts to an external
 * metrics endpoint. It pulls the runtime instances it needs via `Inject` and
 * cleans up via `onDispose` so graceful shutdowns stop the timer.
 */
import markdoc, { Inject } from "@ecosy/markdoc";
import type { ManifestLike, PagableLike } from "@ecosy/markdoc";

export interface MetricsReporterOptions {
  /** How often to report, in milliseconds. */
  interval?: number;
  /** Endpoint receiving the metrics payload. */
  endpoint: string;
  /** Optional service tag. */
  service?: string;
}

export function MetricsReporter(options: MetricsReporterOptions) {
  return class MetricsReporterService {
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor(
      private readonly manifest = Inject<ManifestLike>("manifest"),
      private readonly pagable = Inject<PagableLike>("pagable"),
    ) {
      const interval = options.interval ?? 60_000;
      if (interval <= 0) return;

      this.timer = setInterval(() => {
        void this.report();
      }, interval);
    }

    onDispose(): void {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    private async report() {
      try {
        const pages = await this.manifest.list();
        await fetch(options.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service: options.service ?? "markdoc",
            ts: Date.now(),
            manifestPages: pages.length,
            cachedPages: this.pagable.size,
          }),
        });
      } catch {
        /* metrics are best-effort — never crash the runtime over telemetry */
      }
    }
  };
}

// --- Registration ---

export default markdoc({
  repo: "owner/docs",

  imports: {
    metrics: MetricsReporter({
      interval: 30_000,
      endpoint: "https://metrics.example.com/ingest",
      service: "docs-runtime",
    }),
  },
});
