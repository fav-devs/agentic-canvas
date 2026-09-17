/**
 * The Snap background-removal models.
 *
 * Shared by the worker (which downloads them) and the UI (which has to warn
 * about the cost before a phone on cellular starts a ~134 MB transfer), so
 * there is one definition of what "first run" actually downloads.
 */

export const SNAP_REVISION = "619c140d55036e097502ea969cbfbc59c34423d2";

const MODEL_ROOT = `https://huggingface.co/withoutbg/snap/resolve/${SNAP_REVISION}`;

/**
 * Cache name carries the revision: keys are revision-bearing URLs, so a static
 * name would strand the old models forever when the revision moves.
 */
export const SNAP_MODEL_CACHE = `agentic-canvas-snap-${SNAP_REVISION.slice(0, 12)}`;

/** Every cache this feature has ever used, for cleanup on revision bumps. */
export const SNAP_CACHE_PREFIXES = [
  "agentic-canvas-snap-",
  "agentic-canvas-withoutbg-snap-",
];

export type SnapModelKey = "depth" | "matting" | "refiner";

export const SNAP_MODEL_FILES = [
  {
    key: "depth",
    url: `${MODEL_ROOT}/depth_anything_v2_vits_slim.onnx`,
    bytes: 98_985_353,
  },
  {
    key: "matting",
    url: `${MODEL_ROOT}/snap_matting_0.1.0.onnx`,
    bytes: 26_831_092,
  },
  {
    key: "refiner",
    url: `${MODEL_ROOT}/snap_refiner_0.1.0.onnx`,
    bytes: 14_462_962,
  },
] as const satisfies ReadonlyArray<{
  key: SnapModelKey;
  url: string;
  bytes: number;
}>;

export const SNAP_TOTAL_BYTES = SNAP_MODEL_FILES.reduce(
  (total, file) => total + file.bytes,
  0,
);

/** "134 MB" — for telling someone what they're about to download. */
export function formatBytes(bytes: number) {
  const megabytes = bytes / 1_000_000;
  return megabytes >= 100
    ? `${Math.round(megabytes)} MB`
    : `${megabytes.toFixed(1)} MB`;
}

export const SNAP_DOWNLOAD_LABEL = formatBytes(SNAP_TOTAL_BYTES);

/**
 * Whether every model is already in Cache Storage, i.e. whether the next run is
 * free. Returns false rather than throwing where the Cache API is unavailable.
 */
export async function areSnapModelsCached(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(SNAP_MODEL_CACHE);
    const matches = await Promise.all(
      SNAP_MODEL_FILES.map((file) => cache.match(file.url)),
    );
    return matches.every(Boolean);
  } catch {
    return false;
  }
}

/**
 * True when the browser says the connection is metered or slow. Used to make
 * the first-run warning firmer rather than to block outright — the reading is
 * a hint, and Safari doesn't implement it at all.
 */
export function isConnectionCostly(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return false;
  return (
    connection.saveData === true ||
    ["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "")
  );
}
