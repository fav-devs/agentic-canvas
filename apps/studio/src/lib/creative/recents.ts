import {
  decodeStudioDragItem,
  encodeStudioDragItem,
  type StudioDragItem,
} from "./drag-payload";

/**
 * Recently used elements, across every kind.
 *
 * Stored as `StudioDragItem` — the same payload a drag already carries. That
 * union is exactly the vocabulary this needs (a shape, a frame, a library asset,
 * an upload, a photo, a sticker, text, a pager), and the editor already knows how
 * to insert every member of it. Recents therefore need no insert path of their
 * own: replaying a remembered item is the same code as dropping one.
 *
 * Per profile rather than per design, because "the sticker I used ten minutes
 * ago" is a fact about the person, not about the document they were in.
 */

const KEY_PREFIX = "agentic-canvas.studio.recents:";

/** Enough for a scrolling row and a couple of screens of history. */
const LIMIT = 24;

/**
 * What makes two remembered items "the same thing".
 *
 * Identity is per kind: two rectangles are one entry however many times you
 * reach for them, but two different stickers are two entries. Without this the
 * row fills up with duplicates of whatever you used last.
 */
export function recentKey(item: StudioDragItem): string {
  switch (item.kind) {
    case "library":
      return `library:${item.asset.id}`;
    case "shape":
      return `shape:${item.shape}`;
    case "frame":
      return `frame:${item.shape}`;
    case "media":
      return `media:${item.item.id}`;
    case "photo":
      return `photo:${item.photo.id}`;
    case "hiclipart":
      return `hiclipart:${item.graphic.id}`;
    case "sticker":
      return `sticker:${item.sticker.id}`;
    case "text":
      return `text:${item.variant}`;
    case "pager":
      return `pager:${item.variant}`;
  }
}

function storageKey(profileId: string) {
  return `${KEY_PREFIX}${profileId}`;
}

export function readStudioRecents(profileId: string): StudioDragItem[] {
  if (!profileId) return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey(profileId));
  } catch {
    // Blocked storage: recents are a convenience, never a requirement.
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Each entry is decoded through the drag decoder, so a payload written by an
    // older build is validated rather than trusted.
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map(decodeStudioDragItem)
      .filter((item): item is StudioDragItem => item !== null)
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

/**
 * Record a use and return the new list.
 *
 * Most-recent-first, deduplicated by `recentKey`, capped at `LIMIT`. Returns the
 * list so a caller can render it without a second read.
 */
export function rememberStudioItem(
  profileId: string,
  item: StudioDragItem,
): StudioDragItem[] {
  const key = recentKey(item);
  const next = [
    item,
    ...readStudioRecents(profileId).filter(
      (existing) => recentKey(existing) !== key,
    ),
  ].slice(0, LIMIT);

  if (profileId) {
    try {
      window.localStorage.setItem(
        storageKey(profileId),
        JSON.stringify(next.map(encodeStudioDragItem)),
      );
    } catch {
      // Quota or private mode — the in-memory list is still correct for this
      // session, which is the part the user can see.
    }
  }
  return next;
}

export function clearStudioRecents(profileId: string) {
  try {
    window.localStorage.removeItem(storageKey(profileId));
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
