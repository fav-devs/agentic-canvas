import { createCreativeId } from "@/lib/creative/document";
import {
  SnapRequestQueue,
  type SnapRemovalProgress,
  type SnapRequestOptions,
  type SnapWorkerLike,
} from "./snap-request-queue";

export type { SnapRemovalProgress };
export type SnapRemovalOptions = SnapRequestOptions;

let queue: SnapRequestQueue | undefined;

function getQueue() {
  queue ??= new SnapRequestQueue({
    createWorker: () => {
      if (typeof Worker === "undefined") {
        throw new Error(
          "Local background removal is unavailable in this browser.",
        );
      }
      // Keep this in Next's statically analyzable worker form so the bundler
      // owns the worker format and bootstrap URL.
      return new Worker(
        new URL("./snap-background.worker.ts", import.meta.url),
      ) as unknown as SnapWorkerLike;
    },
  });
  return queue;
}

export function removeBackgroundWithSnap(
  sourceUrl: string,
  options: SnapRemovalOptions = {},
) {
  return getQueue().request(createCreativeId("bg"), sourceUrl, options);
}

/** Release the worker and its sessions immediately (e.g. leaving the editor). */
export function releaseSnapWorker() {
  queue?.release();
}
