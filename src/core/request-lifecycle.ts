import {
  Lifecycle,
  type InjectClassable,
  type GuardLike,
  type InterceptorLike,
  type FilterLike,
  type PipeLike,
} from "../classable/lifecycle";
import type { MarkdocRequest } from "./request";
import type { MarkdocResponse } from "./response";

// ─── Public options ────────────────────────────────────────────────

export interface RequestLifecycleOptions {
  guards?: InjectClassable<GuardLike<MarkdocRequest>>[];
  interceptors?: InjectClassable<InterceptorLike<MarkdocRequest>>[];
  filters?: InjectClassable<FilterLike<MarkdocRequest>>[];
  pipes?: InjectClassable<PipeLike<MarkdocRequest>>[];
}

// ─── Handler type ──────────────────────────────────────────────────

export type RequestHandlerFn = (
  req: MarkdocRequest,
  res: MarkdocResponse,
) => Promise<MarkdocResponse>;

// ─── RequestLifecycle ──────────────────────────────────────────────

/**
 * RequestLifecycle — builds a Lifecycle-branded handler class
 * for use with `Executor.lifecycle()`.
 *
 * Instead of manually resolving hooks and implementing the pipeline,
 * this creates a class with a static `descriptor` containing the
 * configured hooks. The caller (Server) passes it to Executor.lifecycle()
 * which handles the full pipeline:
 *
 *   Guards → Pipes → Interceptors → execute() → Filters
 *
 * Global vs per-request scoping is managed by Executable's
 * Teleport-backed resolver — no manual caching needed.
 */
export class RequestLifecycle {
  /**
   * The Lifecycle-branded handler class.
   * Has static `descriptor` with guards/pipes/interceptors/filters
   * and an `execute(req, res, handler)` instance method.
   */
  readonly Handler: ReturnType<typeof buildHandlerClass>;

  constructor(options: RequestLifecycleOptions = {}) {
    this.Handler = buildHandlerClass(options);
  }
}

/**
 * Build a Lifecycle-branded class whose `execute()` delegates
 * to the provided handler function.
 *
 * Executor.lifecycle() discovers `execute()` on the instance
 * and calls it with the args array: `execute(req, res, handler)`.
 */
function buildHandlerClass(options: RequestLifecycleOptions) {
  return class RequestPipeline extends Lifecycle({
    guards: (options.guards ?? []) as InjectClassable<GuardLike>[],
    interceptors: (options.interceptors ?? []) as InjectClassable<InterceptorLike>[],
    filters: (options.filters ?? []) as InjectClassable<FilterLike>[],
    pipes: (options.pipes ?? []) as InjectClassable<PipeLike>[],
  }) {
    /**
     * Core execution — called by Executor.lifecycle() after guards and pipes,
     * wrapped by interceptors, result passed through filters.
     */
    async execute(
      req: MarkdocRequest,
      res: MarkdocResponse,
      handler: RequestHandlerFn,
    ): Promise<MarkdocResponse> {
      return handler(req, res);
    }
  };
}
