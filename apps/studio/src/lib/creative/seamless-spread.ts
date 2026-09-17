import type {
  CreativeDocument,
  CreativeElement,
  CreativePage,
} from "@/lib/creative/document";

export type SpreadCount = 1 | 2 | 3;

export type CreativeSpread = {
  count: SpreadCount;
  startIndex: number;
  pages: CreativePage[];
  page: CreativePage;
  /** The real page containing each representative shown on the spread. */
  sourcePageByElementId: Map<string, CreativePage>;
};

export function spreadStartIndex(
  pageCount: number,
  activePageIndex: number,
  count: SpreadCount,
) {
  return Math.max(0, Math.min(activePageIndex, Math.max(0, pageCount - count)));
}

/**
 * Compose consecutive pages into one editor-only artboard.
 *
 * Ordinary layers are translated into spread coordinates. Seamless copies are
 * collapsed back into one representative, because their local x positions are
 * projections of the same global layer.
 */
export function composeCreativeSpread(
  document: CreativeDocument,
  activePageIndex: number,
  requestedCount: SpreadCount,
  selectedElementId?: string,
): CreativeSpread {
  const count = Math.min(requestedCount, document.pages.length) as SpreadCount;
  const startIndex = spreadStartIndex(
    document.pages.length,
    activePageIndex,
    count,
  );
  const pages = document.pages.slice(startIndex, startIndex + count);
  const sourcePageByElementId = new Map<string, CreativePage>();
  const groups = new Map<
    string,
    Array<{ element: CreativeElement; page: CreativePage; offset: number }>
  >();
  type OrderedEntry =
    | { kind: "ordinary"; element: CreativeElement; page: CreativePage }
    | { kind: "seamless"; seamlessId: string };
  const backgrounds: OrderedEntry[] = [];
  const foreground: OrderedEntry[] = [];

  pages.forEach((page, localPageIndex) => {
    const offset = localPageIndex * document.canvas.width;
    page.elements.forEach((element) => {
      // "Make image background" creates a locked, full-bleed bottom image.
      // Across a spread, page-by-page concatenation would put page two's
      // background above a layer crossing over from page one. Keep every page
      // background beneath the editable spread instead.
      const entries =
        element.type === "image" &&
        element.name === "Background image" &&
        element.locked
          ? backgrounds
          : foreground;
      if (!element.seamlessId) {
        entries.push({
          kind: "ordinary",
          element: { ...element, x: element.x + offset },
          page,
        });
        sourcePageByElementId.set(element.id, page);
        return;
      }
      const copies = groups.get(element.seamlessId) ?? [];
      if (copies.length === 0) {
        entries.push({ kind: "seamless", seamlessId: element.seamlessId });
      }
      copies.push({ element, page, offset });
      groups.set(element.seamlessId, copies);
    });
  });

  const ordered = [...backgrounds, ...foreground];
  const elements = ordered.flatMap((entry) => {
    if (entry.kind === "ordinary") return [entry.element];
    const copies = groups.get(entry.seamlessId);
    if (!copies?.length) return [];
    const representative =
      copies.find(({ element }) => element.id === selectedElementId) ??
      copies[0]!;
    sourcePageByElementId.set(representative.element.id, representative.page);
    return [
      {
        ...representative.element,
        x: representative.element.x + representative.offset,
      },
    ];
  });

  return {
    count,
    startIndex,
    pages,
    sourcePageByElementId,
    page: {
      id: `spread:${pages.map((page) => page.id).join(":")}`,
      name: `${pages[0]?.name ?? "Slide"} spread`,
      background: pages[0]?.background ?? "#FFFFFF",
      // The editor also uses this composed page when spread count is one.
      // Preserve the real page effect so the live canvas matches thumbnails
      // and exports instead of silently falling back to the flat colour.
      backgroundEffect: pages[0]?.backgroundEffect,
      elements,
    },
  };
}

/** Page indices within a spread touched by an axis-aligned element box. */
export function coveredSpreadPageIndices(
  x: number,
  width: number,
  pageWidth: number,
  pageCount: number,
  height = 0,
  rotation = 0,
) {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [0, width * cos, -height * sin, width * cos - height * sin];
  const left = x + Math.min(...corners);
  // A right edge exactly on a seam belongs only to the page on its left.
  const right = x + Math.max(...corners) - 1e-7;
  const first = Math.max(0, Math.floor(left / pageWidth));
  const last = Math.min(pageCount - 1, Math.floor(right / pageWidth));
  if (last < first) {
    const centre = Math.max(
      0,
      Math.min(pageCount - 1, Math.floor((x + width / 2) / pageWidth)),
    );
    return [centre];
  }
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
