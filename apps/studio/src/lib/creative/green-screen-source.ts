const CORTEX_GREEN_SCREEN_BASE =
  process.env.NEXT_PUBLIC_GREEN_SCREEN_BASE?.replace(/\/$/, "") ?? "";

/** Build the raw MP4 URL Studio uses for browser-side chroma keying. */
export function cortexGreenScreenRawUrl(
  shortcode: string | null | undefined,
  videoId: string,
): string {
  return `${CORTEX_GREEN_SCREEN_BASE}/${shortcode || videoId}.mp4`;
}

/** Normalize older saved keyed-WebM sources to the raw MP4 equivalent. */
export function rawGreenScreenSource(src: string): string {
  return src.replace(/_keyed\.webm(\?.*)?$/, ".mp4$1");
}
