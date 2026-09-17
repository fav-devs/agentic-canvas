/**
 * Request bookkeeping for the background-removal worker.
 *
 * Split from the worker wiring so the parts that go wrong — a worker the OS
 * killed, a cancelled request, a browser that can't start workers at all — are
 * testable without spinning up onnxruntime.
 */

export type SnapRemovalProgress = {
  stage: "downloading" | "loading" | "processing";
  progress: number;
};

export type SnapWorkerMessage =
  | {
      type: "progress";
      id: string;
      stage: SnapRemovalProgress["stage"];
      progress: number;
    }
  | { type: "result"; id: string; blob: Blob }
  | { type: "error"; id: string; message: string };

/** The slice of the Worker API this queue needs, so tests can stand one in. */
export type SnapWorkerLike = {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: string, listener: (event: never) => void): void;
};

export type SnapRequestOptions = {
  onProgress?: (progress: SnapRemovalProgress) => void;
  signal?: AbortSignal;
  maxOutputEdge?: number;
};

/**
 * Longest a request may go without any word from the worker before it is
 * declared dead. Silence usually means the worker was killed — a case where no
 * `error` event fires and the promise would otherwise never settle.
 *
 * The floor is set by the longest legitimately silent stretch: compiling a
 * ~99 MB ONNX model blocks the worker thread, so it cannot report progress
 * while it happens. The worker ticks between models to keep each gap to one
 * compile.
 */
export const DEFAULT_STALL_TIMEOUT_MS = 180_000;
export const DEFAULT_WATCHDOG_INTERVAL_MS = 5_000;
/** Release the worker (and its loaded sessions) once nobody needs it. */
export const DEFAULT_IDLE_TEARDOWN_MS = 90_000;

export const CANCELLED_MESSAGE = "Background removal was cancelled.";
export const STALLED_MESSAGE =
  "Background removal stopped responding and was cancelled. If this keeps happening, close other tabs or try a smaller image.";
export const WORKER_STOPPED_MESSAGE =
  "The local background-removal worker stopped.";

type PendingRemoval = {
  resolve(blob: Blob): void;
  reject(error: Error): void;
  onProgress?: (progress: SnapRemovalProgress) => void;
  lastActivity: number;
  cleanup(): void;
};

export class SnapRequestQueue {
  private worker: SnapWorkerLike | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly pending = new Map<string, PendingRemoval>();

  constructor(
    private readonly options: {
      createWorker(): SnapWorkerLike;
      stallTimeoutMs?: number;
      watchdogIntervalMs?: number;
      idleTeardownMs?: number;
      now?: () => number;
    },
  ) {}

  private get now() {
    return this.options.now ?? Date.now;
  }

  request(
    id: string,
    sourceUrl: string,
    { onProgress, signal, maxOutputEdge }: SnapRequestOptions = {},
  ): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error(CANCELLED_MESSAGE));
        return;
      }

      const onAbort = () => {
        this.pending.delete(id);
        reject(new Error(CANCELLED_MESSAGE));
        // An in-flight inference can't be interrupted, so dropping the worker
        // is the only way to stop it burning memory and CPU.
        this.destroyWorker();
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      this.pending.set(id, {
        resolve,
        reject,
        onProgress,
        lastActivity: this.now(),
        cleanup: () => signal?.removeEventListener("abort", onAbort),
      });
      this.cancelIdleTeardown();

      try {
        this.ensureWorker().postMessage({
          type: "remove",
          id,
          sourceUrl,
          maxOutputEdge,
        });
        this.startWatchdog();
      } catch (error) {
        // Without this the entry would linger forever on a browser that can't
        // start the worker at all.
        this.pending.delete(id);
        signal?.removeEventListener("abort", onAbort);
        reject(
          error instanceof Error
            ? error
            : new Error("Local background removal is unavailable."),
        );
      }
    });
  }

  /** Tear the worker down when idle (e.g. leaving the editor). */
  release() {
    if (this.pending.size > 0) return;
    this.cancelIdleTeardown();
    this.destroyWorker();
  }

  /** Requests currently in flight — for tests and leak assertions. */
  get size() {
    return this.pending.size;
  }

  private ensureWorker() {
    if (!this.worker) {
      const instance = this.options.createWorker();
      instance.addEventListener("message", ((
        event: MessageEvent<SnapWorkerMessage>,
      ) => this.handleMessage(event.data)) as (event: never) => void);
      instance.addEventListener("error", (() =>
        this.destroyWorker(WORKER_STOPPED_MESSAGE)) as (event: never) => void);
      this.worker = instance;
    }
    return this.worker;
  }

  private handleMessage(message: SnapWorkerMessage) {
    const request = this.pending.get(message.id);
    if (!request) return;
    request.lastActivity = this.now();

    if (message.type === "progress") {
      request.onProgress?.({
        stage: message.stage,
        progress: message.progress,
      });
      return;
    }

    this.pending.delete(message.id);
    request.cleanup();
    if (message.type === "result") request.resolve(message.blob);
    else request.reject(new Error(message.message));

    if (this.pending.size === 0) this.scheduleIdleTeardown();
  }

  private startWatchdog() {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      const stallTimeout =
        this.options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
      const now = this.now();
      for (const [id, request] of this.pending) {
        if (now - request.lastActivity < stallTimeout) continue;
        this.pending.delete(id);
        request.cleanup();
        request.reject(new Error(STALLED_MESSAGE));
        // A wedged worker never recovers, and it still holds the sessions.
        this.destroyWorker();
        return;
      }
      if (this.pending.size === 0) this.stopWatchdog();
    }, this.options.watchdogIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog() {
    if (!this.watchdog) return;
    clearInterval(this.watchdog);
    this.watchdog = undefined;
  }

  private scheduleIdleTeardown() {
    this.cancelIdleTeardown();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.pending.size === 0) this.destroyWorker();
    }, this.options.idleTeardownMs ?? DEFAULT_IDLE_TEARDOWN_MS);
  }

  private cancelIdleTeardown() {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private destroyWorker(rejectionMessage?: string) {
    const instance = this.worker;
    this.worker = undefined;
    this.stopWatchdog();
    if (rejectionMessage) {
      for (const request of this.pending.values()) {
        request.cleanup();
        request.reject(new Error(rejectionMessage));
      }
      this.pending.clear();
    }
    instance?.terminate();
  }
}
