import * as ort from "onnxruntime-web/webgpu";
import {
  SNAP_CACHE_PREFIXES,
  SNAP_MODEL_CACHE,
  SNAP_MODEL_FILES,
  SNAP_TOTAL_BYTES,
  type SnapModelKey,
} from "./snap-models";

/**
 * Must match the `onnxruntime-web` version in package.json: this URL serves the
 * .wasm binaries that pair with the bundled JS glue, and a mismatch fails at
 * runtime in ways that are painful to trace.
 */
const ORT_ASSET_ROOT =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
const MAX_REFINER_EDGE = 1024;
const DEFAULT_MAX_OUTPUT_EDGE = 4096;
const DEPTH_TARGET = 518;
const DEPTH_MULTIPLE = 14;
const MATTING_SIZE = 256;
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

type SnapStage = "downloading" | "loading" | "processing";

type RemoveRequest = {
  type: "remove";
  id: string;
  sourceUrl: string;
  /** Caller-supplied ceiling; phones can't afford a 4096² RGBA round trip. */
  maxOutputEdge?: number;
};

type WorkerResponse =
  | {
      type: "progress";
      id: string;
      stage: SnapStage;
      progress: number;
    }
  | {
      type: "result";
      id: string;
      blob: Blob;
    }
  | {
      type: "error";
      id: string;
      message: string;
    };

type WorkerScope = {
  postMessage(message: WorkerResponse): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RemoveRequest>) => void,
  ): void;
};

type SnapSessions = {
  depth: ort.InferenceSession;
  matting: ort.InferenceSession;
  refiner: ort.InferenceSession;
};

const scope = globalThis as unknown as WorkerScope;
let sessionsPromise: Promise<SnapSessions> | undefined;

ort.env.wasm.wasmPaths = ORT_ASSET_ROOT;
// Multi-threaded wasm needs SharedArrayBuffer, which needs cross-origin
// isolation (COOP + COEP). This app ships COOP but deliberately not COEP —
// that would break the OAuth popup flow — so asking for threads here would be
// silently ignored at best. Keep the request honest.
ort.env.wasm.numThreads = globalThis.crossOriginIsolated
  ? Math.max(
      1,
      Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)),
    )
  : 1;

scope.addEventListener("message", (event) => {
  if (event.data.type !== "remove") return;
  void handleRemove(event.data);
});

async function handleRemove(request: RemoveRequest) {
  try {
    scope.postMessage({
      type: "progress",
      id: request.id,
      stage: "downloading",
      progress: 0.01,
    });
    let sessions: SnapSessions;
    try {
      sessions = await getSessions((stage, progress) =>
        scope.postMessage({
          type: "progress",
          id: request.id,
          stage,
          progress,
        }),
      );
    } catch (error) {
      // Only a *load* failure invalidates the cached promise. A bad image URL
      // used to discard three initialised sessions with it.
      sessionsPromise = undefined;
      throw error;
    }
    scope.postMessage({
      type: "progress",
      id: request.id,
      stage: "processing",
      progress: 0.05,
    });
    const blob = await removeBackground(
      request.sourceUrl,
      sessions,
      request.maxOutputEdge,
      (progress) =>
        scope.postMessage({
          type: "progress",
          id: request.id,
          stage: "processing",
          progress,
        }),
    );
    scope.postMessage({ type: "result", id: request.id, blob });
  } catch (error) {
    scope.postMessage({
      type: "error",
      id: request.id,
      message:
        error instanceof Error
          ? error.message
          : "Local background removal failed.",
    });
  }
}

function getSessions(onProgress: (stage: SnapStage, progress: number) => void) {
  sessionsPromise ??= loadSessions(onProgress);
  return sessionsPromise;
}

async function loadSessions(
  onProgress: (stage: SnapStage, progress: number) => void,
) {
  void pruneStaleModelCaches();

  const files = SNAP_MODEL_FILES;
  const sessions: Partial<Record<SnapModelKey, ort.InferenceSession>> = {};
  let settledBytes = 0;

  try {
    // Strictly one model at a time. Downloading all three in parallel held
    // ~140 MB of buffers at once, and compiling all three in parallel copied
    // every one of them into the wasm heap on top of that — which is what ran
    // devices out of memory before a single image was touched.
    for (const [index, file] of files.entries()) {
      const model = await fetchCachedModel(file.url, file.bytes, (received) =>
        onProgress(
          "downloading",
          Math.min(1, (settledBytes + received) / SNAP_TOTAL_BYTES),
        ),
      );
      settledBytes += file.bytes;

      // Compiling a 99 MB model can block this worker for a long time, and a
      // silent worker is indistinguishable from a dead one. Tick before each
      // model so the client's stall watchdog sees progress between them.
      onProgress("loading", index / files.length);
      sessions[file.key] = await createSession(model);
      onProgress("loading", (index + 1) / files.length);
      // `model` falls out of scope here, before the next one is fetched.
    }
  } catch (error) {
    // Free whatever did load; leaving it resident makes the retry likelier to
    // fail for the same reason.
    await Promise.allSettled(
      Object.values(sessions).map((session) => session?.release?.()),
    );
    throw describeLoadFailure(error);
  }

  return sessions as SnapSessions;
}

/** WebGPU when it's there, falling back per model rather than per batch. */
async function createSession(model: Uint8Array) {
  const executionProviders = getExecutionProviders();
  try {
    return await ort.InferenceSession.create(model, { executionProviders });
  } catch (error) {
    if (!executionProviders.includes("webgpu")) throw error;
    return ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
    });
  }
}

function describeLoadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/memory|allocation|out of bounds|Aborted/i.test(message)) {
    return new Error(
      "Not enough memory to load the background-removal models. Close other tabs and try again — or run it on a desktop browser.",
    );
  }
  return error instanceof Error
    ? error
    : new Error("The background-removal models could not load.");
}

function getExecutionProviders(): ort.InferenceSession.ExecutionProviderConfig[] {
  return "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
}

/**
 * Drop model caches from earlier revisions. Cache keys are revision-bearing
 * URLs, so without this a revision bump strands ~134 MB per old revision.
 */
async function pruneStaleModelCaches() {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (name) =>
            name !== SNAP_MODEL_CACHE &&
            SNAP_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix)),
        )
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Best effort; a stale cache costs disk, not correctness.
  }
}

/**
 * Model bytes, cached across sessions.
 *
 * The response is streamed straight into Cache Storage rather than assembled
 * in JS first: the old path allocated the whole file, sometimes copied it again
 * to trim it, and then handed a third copy to `cache.put`. For a 99 MB model
 * that is most of a phone's headroom spent before the decoder even starts.
 */
async function fetchCachedModel(
  url: string,
  expectedBytes: number,
  onBytes: (received: number) => void,
) {
  const cache = await caches.open(SNAP_MODEL_CACHE).catch(() => undefined);
  const cached = await cache?.match(url);
  if (cached) {
    onBytes(expectedBytes);
    return new Uint8Array(await cached.arrayBuffer());
  }

  // `no-store` keeps the HTTP cache out of it: Cache Storage owns these bytes,
  // so they aren't held twice on disk either.
  const response = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Could not download the Snap model (${response.status}).`);
  }

  if (cache && response.body) {
    try {
      await cache.put(
        url,
        new Response(trackDownload(response.body, onBytes), {
          headers: { "Content-Type": "application/octet-stream" },
        }),
      );
      const stored = await cache.match(url);
      if (stored) return new Uint8Array(await stored.arrayBuffer());
    } catch {
      // Quota, or a browser that dislikes streamed cache writes. The stream is
      // spent by now, so the only way back is a plain re-fetch.
      const retry = await fetch(url, {
        cache: "no-store",
        credentials: "omit",
      });
      if (retry.ok) {
        const buffer = await retry.arrayBuffer();
        onBytes(buffer.byteLength);
        return new Uint8Array(buffer);
      }
      throw new Error("Could not download the Snap model.");
    }
  }

  const buffer = await response.arrayBuffer();
  onBytes(buffer.byteLength);
  return new Uint8Array(buffer);
}

/** Count bytes as they stream past, without holding on to them. */
function trackDownload(
  body: ReadableStream<Uint8Array>,
  onBytes: (received: number) => void,
) {
  let received = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onBytes(received);
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * Turn a host-provided private media proxy path into a
 * presigned R2 URL so the image bytes load STRAIGHT FROM R2 — never back through
 * the API proxy (Vercel origin transfer). The presign call is same-origin +
 * credentialed (cookies authorize it) but only a tiny JSON URL crosses the
 * proxy. Absolute URLs (already-public assets) pass through unchanged.
 */
async function resolveDirectUrl(sourceUrl: string): Promise<string> {
  if (!sourceUrl.startsWith("/")) return sourceUrl;
  const sep = sourceUrl.includes("?") ? "&" : "?";
  const res = await fetch(`${sourceUrl}${sep}as=url`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not resolve the image URL (${res.status}).`);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("No direct URL returned for the image.");
  return data.url;
}

async function removeBackground(
  sourceUrl: string,
  sessions: SnapSessions,
  maxOutputEdge: number | undefined,
  onProgress: (progress: number) => void,
) {
  // Resolve to a presigned R2 URL, then fetch the bytes from R2 WITHOUT
  // credentials — R2's bucket CORS already allows GET from our origin, and a
  // presigned GET is authed by its signature, not cookies. (Sending cookies here
  // is what triggered the Access-Control-Allow-Credentials CORS failure.)
  const directUrl = await resolveDirectUrl(sourceUrl);
  const response = await fetch(directUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Could not load the selected image (${response.status}).`);
  }
  const bitmap = await createImageBitmap(await response.blob());

  try {
    const depthSize = coverSize(
      bitmap.width,
      bitmap.height,
      DEPTH_TARGET,
      DEPTH_MULTIPLE,
    );
    const depthPixels = drawToPixels(bitmap, depthSize.width, depthSize.height);
    const depthInput = rgbaToNchw(
      depthPixels,
      depthSize.width,
      depthSize.height,
      true,
    );
    const depthResult = await sessions.depth.run({
      image: new ort.Tensor("float32", depthInput, [
        1,
        3,
        depthSize.height,
        depthSize.width,
      ]),
    });
    const depthTensor = depthResult.depth;
    if (!depthTensor) throw new Error("Snap depth output is missing.");
    const depth = normalizeDepth(depthTensor.data as Float32Array);
    const depthWidth = Number(depthTensor.dims.at(-1));
    const depthHeight = Number(depthTensor.dims.at(-2));
    const depthCanvas = grayscaleCanvas(depth, depthWidth, depthHeight);
    onProgress(0.36);

    const mattingRgb = drawToPixels(bitmap, MATTING_SIZE, MATTING_SIZE);
    const mattingDepth = drawToPixels(depthCanvas, MATTING_SIZE, MATTING_SIZE);
    const mattingInput = rgbdToNchw(
      mattingRgb,
      mattingDepth,
      MATTING_SIZE,
      MATTING_SIZE,
    );
    const mattingResult = await sessions.matting.run({
      rgbd_input: new ort.Tensor("float32", mattingInput, [
        1,
        4,
        MATTING_SIZE,
        MATTING_SIZE,
      ]),
    });
    const alpha1Tensor = mattingResult.alpha_output;
    if (!alpha1Tensor) throw new Error("Snap matte output is missing.");
    const alpha1 = floatMaskToCanvas(
      alpha1Tensor.data as Float32Array,
      MATTING_SIZE,
      MATTING_SIZE,
    );
    onProgress(0.62);

    const refinerSize = containSize(
      bitmap.width,
      bitmap.height,
      MAX_REFINER_EDGE,
    );
    const refinerRgb = drawToPixels(
      bitmap,
      refinerSize.width,
      refinerSize.height,
    );
    const refinerDepth = drawToPixels(
      depthCanvas,
      refinerSize.width,
      refinerSize.height,
    );
    const refinerAlpha = drawToPixels(
      alpha1,
      refinerSize.width,
      refinerSize.height,
    );
    const refinerInput = rgbdaToNchw(
      refinerRgb,
      refinerDepth,
      refinerAlpha,
      refinerSize.width,
      refinerSize.height,
    );
    const refinedResult = await sessions.refiner.run({
      rgbd_alpha_input: new ort.Tensor("float32", refinerInput, [
        1,
        5,
        refinerSize.height,
        refinerSize.width,
      ]),
    });
    const alpha2Tensor = refinedResult.alpha_output;
    if (!alpha2Tensor) throw new Error("Snap refined matte is missing.");
    const refinedAlpha = floatMaskToCanvas(
      alpha2Tensor.data as Float32Array,
      refinerSize.width,
      refinerSize.height,
    );
    onProgress(0.88);

    // A 4096² output means two ~67 MB RGBA buffers on top of the loaded
    // sessions, which is where phones run out of memory.
    const outputSize = containSize(
      bitmap.width,
      bitmap.height,
      Math.max(256, maxOutputEdge ?? DEFAULT_MAX_OUTPUT_EDGE),
      false,
    );
    const output = new OffscreenCanvas(outputSize.width, outputSize.height);
    const context = getContext(output);
    context.drawImage(bitmap, 0, 0, output.width, output.height);
    const outputPixels = context.getImageData(
      0,
      0,
      output.width,
      output.height,
    );
    const alphaPixels = drawToPixels(refinedAlpha, output.width, output.height);
    for (let index = 0; index < outputPixels.data.length; index += 4) {
      outputPixels.data[index + 3] = alphaPixels[index];
    }
    context.putImageData(outputPixels, 0, 0);
    onProgress(1);
    return output.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}

function coverSize(
  width: number,
  height: number,
  target: number,
  multiple: number,
) {
  const scale = Math.max(target / width, target / height);
  return {
    width: Math.max(target, Math.round((width * scale) / multiple) * multiple),
    height: Math.max(
      target,
      Math.round((height * scale) / multiple) * multiple,
    ),
  };
}

function containSize(
  width: number,
  height: number,
  maxEdge: number,
  allowUpscale = true,
) {
  const scale = allowUpscale
    ? maxEdge / Math.max(width, height)
    : Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawToPixels(
  source: CanvasImageSource,
  width: number,
  height: number,
) {
  const canvas = new OffscreenCanvas(width, height);
  const context = getContext(canvas);
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function getContext(canvas: OffscreenCanvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas processing is unavailable.");
  return context;
}

function rgbaToNchw(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  imagenetNormalize: boolean,
) {
  const pixelCount = width * height;
  const output = new Float32Array(pixelCount * 3);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = pixel * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = pixels[source + channel] / 255;
      output[channel * pixelCount + pixel] = imagenetNormalize
        ? (value - IMAGENET_MEAN[channel]) / IMAGENET_STD[channel]
        : value;
    }
  }
  return output;
}

function rgbdToNchw(
  rgb: Uint8ClampedArray,
  depth: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const pixelCount = width * height;
  const output = new Float32Array(pixelCount * 4);
  const rgbTensor = rgbaToNchw(rgb, width, height, false);
  output.set(rgbTensor);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    output[pixelCount * 3 + pixel] = depth[pixel * 4] / 255;
  }
  return output;
}

function rgbdaToNchw(
  rgb: Uint8ClampedArray,
  depth: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const pixelCount = width * height;
  const output = new Float32Array(pixelCount * 5);
  output.set(rgbaToNchw(rgb, width, height, false));
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    output[pixelCount * 3 + pixel] = depth[pixel * 4] / 255;
    output[pixelCount * 4 + pixel] = alpha[pixel * 4] / 255;
  }
  return output;
}

function normalizeDepth(values: Float32Array) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = Math.max(Number.EPSILON, max - min);
  const output = new Uint8ClampedArray(values.length);
  for (let index = 0; index < values.length; index += 1) {
    output[index] = Math.round(((values[index] - min) / range) * 255);
  }
  return output;
}

function grayscaleCanvas(
  values: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const canvas = new OffscreenCanvas(width, height);
  const context = getContext(canvas);
  const pixels = context.createImageData(width, height);
  for (let index = 0; index < values.length; index += 1) {
    const target = index * 4;
    pixels.data[target] = values[index];
    pixels.data[target + 1] = values[index];
    pixels.data[target + 2] = values[index];
    pixels.data[target + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function floatMaskToCanvas(
  values: Float32Array,
  width: number,
  height: number,
) {
  const mask = new Uint8ClampedArray(values.length);
  for (let index = 0; index < values.length; index += 1) {
    mask[index] = Math.round(Math.max(0, Math.min(1, values[index])) * 255);
  }
  return grayscaleCanvas(mask, width, height);
}
