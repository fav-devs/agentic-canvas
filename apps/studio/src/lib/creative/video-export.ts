import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  QUALITY_HIGH,
  QUALITY_MEDIUM,
  getFirstEncodableVideoCodec,
  getFirstEncodableAudioCodec,
  type VideoCodec,
  type AudioCodec,
} from "mediabunny";
import type {
  CreativeDocument,
  CreativePage,
  CreativeSoundtrack,
} from "./document";
import { buildCreativePageCanvas } from "@/components/creative/fabric-stage";

/** Derive the raw (audio-bearing) mp4 URL from a clip's src. */
function clipMediaUrl(src: string): string {
  return src.replace(/_keyed\.webm(\?.*)?$/, ".mp4$1");
}

/**
 * Mix every visible, unmuted scene clip's audio into one soundtrack buffer,
 * each placed at its scene's start offset (trimmed to the scene length). Runs
 * offline, tolerates per-clip failures, and returns null when there's no audio
 * to encode. Best-effort: a decode/context failure just yields a silent export.
 */
async function buildSoundtrack(
  pages: CreativePage[],
  totalSec: number,
  selectedTrack?: CreativeSoundtrack,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const OfflineCtx =
    window.OfflineAudioContext ??
    (
      window as unknown as {
        webkitOfflineAudioContext?: typeof OfflineAudioContext;
      }
    ).webkitOfflineAudioContext;
  if (!OfflineCtx || totalSec <= 0) return null;

  const sampleRate = 48000;
  const ctx = new OfflineCtx(2, Math.ceil(totalSec * sampleRate), sampleRate);

  // A chosen music bed intentionally wins over scene audio, matching the
  // server-side short renderer. Loop short sounds to cover the whole export.
  if (selectedTrack) {
    try {
      const res = await fetch(
        `/api/audio/file/${encodeURIComponent(selectedTrack.audioId)}`,
        { signal },
      );
      if (!res.ok)
        throw new Error(`Audio could not be loaded (${res.status}).`);
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = buffer.duration < totalSec;
      gain.gain.value = selectedTrack.volume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
      source.stop(totalSec);
      return ctx.startRendering();
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(
        "The selected soundtrack could not be loaded. Choose another sound and try again.",
        { cause: error },
      );
    }
  }

  let offsetSec = 0;
  let placed = 0;

  for (const page of pages) {
    const durSec = sceneDurationMs(page) / 1000;
    const clip = page.elements.find(
      (element) =>
        element.type === "video" && element.visible && !element.muted,
    );
    if (clip && clip.type === "video") {
      try {
        if (signal?.aborted) break;
        const res = await fetch(clipMediaUrl(clip.src), { signal });
        const bytes = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes);
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx.destination);
        node.start(offsetSec, 0, Math.min(buffer.duration, durSec));
        placed += 1;
      } catch {
        // This clip has no decodable audio — leave its window silent.
      }
    }
    offsetSec += durSec;
  }

  if (placed === 0) return null;
  return ctx.startRendering();
}

/** Default seconds a scene is held when a page has no explicit duration. */
export const DEFAULT_SCENE_MS = 3000;
const DEFAULT_FPS = 30;

export function sceneDurationMs(page: CreativePage): number {
  return page.durationMs ?? DEFAULT_SCENE_MS;
}

export function pageHasMotion(page: CreativePage): boolean {
  return page.elements.some(
    (element) => element.type === "video" && element.visible,
  );
}

/** Total length (ms) of the exported video: sum of visible scene durations. */
export function videoDurationMs(document: CreativeDocument): number {
  return document.pages
    .filter((page) => !page.hidden)
    .reduce((total, page) => total + sceneDurationMs(page), 0);
}

const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Encode a creative document to an MP4, one scene per (visible) page.
 *
 * Static scenes are a single held frame for their duration — cheap and exact.
 * Scenes containing a video element are captured in real time so the clip
 * actually plays (object caching is disabled so Fabric re-reads each frame),
 * which means those scenes take roughly their own length to encode.
 */
export async function exportCreativeVideo(input: {
  document: CreativeDocument;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { document: doc, fps = DEFAULT_FPS, onProgress, signal } = input;
  const pages = doc.pages.filter((page) => !page.hidden);
  if (pages.length === 0) throw new Error("There is nothing to export.");

  // H.264 (and most encoders) require even dimensions.
  const width = doc.canvas.width - (doc.canvas.width % 2);
  const height = doc.canvas.height - (doc.canvas.height % 2);

  // One stable canvas is fed to the encoder; each scene's render is drawn onto
  // it. mediabunny snapshots this canvas on every `add()`.
  const frame = window.document.createElement("canvas");
  frame.width = width;
  frame.height = height;
  const ctx = frame.getContext("2d");
  if (!ctx) throw new Error("Could not create a drawing context.");

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const codec: VideoCodec =
    (await getFirstEncodableVideoCodec(["avc", "av1", "vp9"], {
      width,
      height,
    })) ?? "avc";
  const source = new CanvasSource(frame, { codec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: fps });

  const totalMs = videoDurationMs(doc) || 1;

  // Soundtrack: mix each scene clip's audio and add it as a second track.
  // Best-effort — any failure leaves a silent (but valid) export.
  let audioSource: AudioBufferSource | null = null;
  let soundtrack: AudioBuffer | null = null;
  try {
    soundtrack = await buildSoundtrack(
      pages,
      totalMs / 1000,
      doc.soundtrack,
      signal,
    );
    if (soundtrack) {
      const audioCodec: AudioCodec =
        (await getFirstEncodableAudioCodec(["aac", "opus"])) ?? "aac";
      audioSource = new AudioBufferSource({
        codec: audioCodec,
        bitrate: QUALITY_MEDIUM,
      });
      output.addAudioTrack(audioSource);
    }
  } catch (error) {
    if (doc.soundtrack) throw error;
    audioSource = null;
    soundtrack = null;
  }

  await output.start();

  let elapsedMs = 0;
  let tSec = 0;
  const frameDur = 1 / fps;

  const abortIfNeeded = () => {
    if (signal?.aborted)
      throw new DOMException("Export cancelled", "AbortError");
  };

  try {
    for (let i = 0; i < pages.length; i += 1) {
      abortIfNeeded();
      const page = pages[i];
      const durMs = sceneDurationMs(page);
      const sceneCanvas = await buildCreativePageCanvas({
        page,
        fonts: doc.fonts,
        pageIndex: i,
        pageCount: pages.length,
        width,
        height,
      });
      try {
        const element = sceneCanvas.getElement() as HTMLCanvasElement;
        if (pageHasMotion(page)) {
          // Force live re-reads of the playing video each frame.
          for (const object of sceneCanvas.getObjects()) {
            object.objectCaching = false;
          }
          const frames = Math.max(1, Math.round((durMs / 1000) * fps));
          for (let f = 0; f < frames; f += 1) {
            abortIfNeeded();
            sceneCanvas.renderAll();
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(element, 0, 0, width, height);
            await source.add(tSec, frameDur);
            tSec += frameDur;
            // Pace to real time so the underlying <video> advances.
            await wait((frameDur * 1000) / 1);
            onProgress?.(
              Math.min(1, (elapsedMs + ((f + 1) / frames) * durMs) / totalMs),
            );
          }
        } else {
          // Static scene: a single frame held for the whole duration.
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(element, 0, 0, width, height);
          await source.add(tSec, durMs / 1000);
          tSec += durMs / 1000;
        }
      } finally {
        sceneCanvas.dispose();
      }
      elapsedMs += durMs;
      onProgress?.(Math.min(1, elapsedMs / totalMs));
    }

    // Encode the mixed soundtrack (added at timestamp 0, spanning the video).
    if (audioSource && soundtrack) {
      try {
        await audioSource.add(soundtrack);
      } catch (error) {
        if (doc.soundtrack) {
          throw new Error(
            "The selected soundtrack could not be encoded. Choose another sound and try again.",
            { cause: error },
          );
        }
        // Embedded clip audio is best-effort; preserve the visual export.
      }
    }

    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }

  const buffer = target.buffer;
  if (!buffer) throw new Error("Video encoding produced no output.");
  return new Blob([buffer], { type: "video/mp4" });
}
