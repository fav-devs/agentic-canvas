import type { CreativeLibraryAsset } from "./element-library";
import type { CreativeFrameShape } from "./frames";
import type { CreativeShapeKind } from "./shapes";
import type { KlipySticker } from "@/lib/creative/klipy";
import type { HiclipartGraphic } from "./hiclipart";
import type { UnsplashPhoto } from "./unsplash";

/**
 * What the tool shelf puts on the clipboard when a tile is dragged onto the
 * canvas, so anything in the sidebar can be dropped where the pointer lands
 * rather than only added to the middle of the slide.
 */
export const STUDIO_DRAG_MIME = "application/x-creative-asset";

export type StudioDragMedia = {
  id: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
};

export type StudioDragItem =
  | { kind: "library"; asset: CreativeLibraryAsset }
  | { kind: "shape"; shape: CreativeShapeKind }
  | { kind: "frame"; shape: CreativeFrameShape }
  | { kind: "media"; item: StudioDragMedia }
  | { kind: "photo"; photo: UnsplashPhoto }
  | { kind: "hiclipart"; graphic: HiclipartGraphic }
  | { kind: "sticker"; sticker: KlipySticker }
  | { kind: "text"; variant: "heading" | "body" }
  | { kind: "pager"; variant: "dots" | "stretch" | "bars" | "numbers" };

export function encodeStudioDragItem(item: StudioDragItem) {
  return JSON.stringify(item);
}

/**
 * Parse a dropped payload. Tolerates the original un-tagged shape (a bare
 * `CreativeLibraryAsset`) so a drag started before a deploy still lands.
 */
export function decodeStudioDragItem(json: string): StudioDragItem | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const value = parsed as Record<string, unknown>;
  if (typeof value.kind === "string") return value as StudioDragItem;

  // Legacy payload: a library asset with no discriminator.
  if (
    typeof value.provider === "string" &&
    typeof value.assetUrl === "string"
  ) {
    return { kind: "library", asset: value as unknown as CreativeLibraryAsset };
  }
  return null;
}
