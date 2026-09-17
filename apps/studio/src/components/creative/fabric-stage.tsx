"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  ActiveSelection,
  Canvas,
  Circle,
  Ellipse,
  FabricImage,
  Group,
  Line,
  loadSVGFromString,
  Path,
  Rect,
  Shadow,
  StaticCanvas,
  Text as FabricText,
  Textbox,
  util,
  type FabricObject,
} from "fabric";
import { drawingStrokeBounds } from "@/lib/creative/document";
import type {
  CreativeBackgroundEffect,
  CreativeBrush,
  CreativeDrawingElement,
  CreativeDrawingStroke,
  CreativeElement,
  CreativeFont,
  CreativeFrameElement,
  CreativeImageAdjustments,
  CreativeTagElement,
  CreativePixelateEffect,
  CreativePage,
  CreativeTextElement,
} from "@/lib/creative/document";
import {
  capStrokePoints,
  simplifyStrokePoints,
  strokeGeometry,
} from "@/lib/creative/strokes";
import { snapBox } from "@/lib/creative/align";
import { createChromaKeyer } from "@/lib/creative/chroma-key";
import { rawGreenScreenSource } from "@/lib/creative/green-screen-source";
import {
  cssFilterString,
  isNeutralAdjustments,
  NEUTRAL_ADJUSTMENTS,
  warmthOverlay,
} from "@/lib/creative/image-filters";
import {
  FRAME_CURVES,
  frameContentBox,
  frameImagePlacement,
  framePolygonPoints,
  type CreativeFrameShape,
} from "@/lib/creative/frames";
import { shapeSvgPath } from "@/lib/creative/shapes";
import {
  ensureCatalogueFont,
  ensureFontsForFamilies,
} from "@/lib/creative/font-catalogue";
import {
  drawCuttingMat,
  DEFAULT_CUTTING_MAT,
} from "@/lib/creative/cutting-mat";
import { registerCreativeFont } from "@/lib/creative/font-library";
import { TEXTURE_URLS } from "@/components/ui/bg-image-texture";
import { scaledTextFontSize } from "@/lib/creative/text-transform";
import {
  applyAsciiEffect,
  applyDitherEffect,
} from "@/lib/creative/image-effects";

const vectorSourceCache = new Map<string, string>();

/**
 * How long to wait for fonts before drawing anyway. Long enough that the common
 * case (cached faces) never shows a fallback, short enough that a hanging font
 * request costs a flicker rather than the slide.
 */
const FONT_WAIT_MS = 900;

/**
 * How many off-slide objects to keep alive. A carousel is a handful of slides
 * with a handful of elements each, so this holds a whole design comfortably
 * while still bounding memory for a pathological one.
 */
const PARKED_LIMIT = 240;

/**
 * Keep an object that has left the canvas, so returning to its slide costs a
 * re-add rather than a refetch and a re-rasterise. Keyed by element *and*
 * signature: a parked object is only reusable while the thing it was built from
 * is unchanged.
 */
function park(
  parked: Map<string, FabricObject>,
  key: string,
  object: FabricObject,
) {
  // Re-inserting moves the key to the end, so the map doubles as recency order.
  parked.delete(key);
  parked.set(key, object);
  while (parked.size > PARKED_LIMIT) {
    const oldest = parked.keys().next().value;
    if (oldest === undefined) break;
    parked.delete(oldest);
  }
}

function unpark(parked: Map<string, FabricObject>, key: string) {
  const object = parked.get(key);
  if (object) parked.delete(key);
  return object ?? null;
}
const textureImageCache = new Map<string, Promise<HTMLImageElement>>();

export type FabricStageHandle = {
  exportPng(): Promise<Blob>;
  /**
   * Map a viewport point (a drag/drop event) to document coordinates, or null
   * when it falls outside the canvas.
   */
  toDocumentPoint(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null;
};

/** Families referenced by a page's text, for font preloading. */
function textFamilies(page: CreativePage) {
  return page.elements
    .filter((element) => element.type === "text")
    .map((element) => element.fontFamily);
}

/** What a rendered fabric object was built from, so we can diff cheaply. */
type RenderedElement = {
  object: FabricObject;
  element: CreativeElement;
  signature: string;
};

/**
 * Everything about an element that can't be applied to an existing fabric
 * object with `set()`. When this string is unchanged between renders the object
 * is patched in place; when it changes the object is rebuilt. Keeping image and
 * vector geometry in here is deliberate — their pixels are baked at the
 * requested size, so a resize genuinely needs a rebuild.
 */
function elementSignature(
  element: CreativeElement,
  context: { pageIndex: number; pageCount: number },
) {
  const box = `${Math.round(element.width)}x${Math.round(element.height)}`;
  switch (element.type) {
    case "text":
      return `text:${element.fontFamily}:${element.fontWeight}`;
    case "shape":
      return `shape:${element.shape}:${box}`;
    case "vector":
      return `vector:${element.assetUrl ?? ""}:${element.svg?.length ?? 0}:${
        element.recolorable ? element.fill : "fixed"
      }:${box}`;
    case "image":
      // Flip and shadow are deliberately absent: they're patched on the object,
      // so dragging a shadow slider doesn't re-rasterise the photo.
      return `image:${element.asset.url}:${JSON.stringify(
        element.effect ?? null,
      )}:${JSON.stringify(element.edgeEffect ?? null)}:${JSON.stringify(
        element.adjustments,
      )}:${element.radius}:${element.fit}:${JSON.stringify(
        element.crop ?? null,
      )}:${box}`;
    case "frame":
      // The frame is rasterised as a whole, so every visual property is
      // structural. Re-tracing a clip and one drawImage is cheap.
      return `frame:${element.shape}:${element.radius}:${element.fit}:${
        element.zoom
      }:${element.offsetX},${element.offsetY}:${element.fill}:${
        element.stroke
      }:${element.strokeWidth}:${element.asset?.url ?? "empty"}:${JSON.stringify(
        element.effect ?? null,
      )}:${JSON.stringify(element.edgeEffect ?? null)}:${JSON.stringify(
        element.adjustments ?? NEUTRAL_ADJUSTMENTS,
      )}:${box}`;
    case "widget":
      return `widget:${JSON.stringify(element.props)}:${context.pageIndex}/${
        context.pageCount
      }:${box}`;
    case "tag":
      return `tag:${element.variant}:${element.badge}:${element.text}:${element.fontFamily}:${element.fontWeight}:${
        element.fontSize
      }:${element.fill}:${element.letterSpacing}:${element.textTransform}:${JSON.stringify(
        element.style,
      )}:${box}`;
    case "drawing":
      // No box: a sketch is drawn at its natural size and scaled by the group,
      // so resizing is a patch rather than a rebuild. Point *values* never
      // change once committed — only the set of strokes does — so hashing each
      // stroke's paint settings and length identifies the geometry without
      // walking thousands of coordinates on every render.
      return `drawing:${element.smoothing}:${drawingFingerprint(element)}`;
    case "video":
      return `video:${element.src}:${element.chromaKeyed}:${element.fit}:${element.radius}:${element.muted}:${box}`;
  }
}

/** Short, cheap identity for a sketch's stroke set. */
function drawingFingerprint(element: CreativeDrawingElement) {
  let hash = 5381;
  for (const stroke of element.strokes) {
    const descriptor = `${stroke.brush}|${stroke.color}|${Math.round(
      stroke.width * 100,
    )}|${Math.round(stroke.opacity * 100)}|${stroke.points.length}`;
    for (let index = 0; index < descriptor.length; index += 1) {
      hash = ((hash << 5) + hash + descriptor.charCodeAt(index)) | 0;
    }
  }
  return `${element.strokes.length}:${hash}`;
}

/** Apply the transform/typography props that don't require a rebuild. */
function patchFabricObject(object: FabricObject, element: CreativeElement) {
  object.set({
    left: element.x,
    top: element.y,
    angle: element.rotation,
    opacity: element.opacity,
    selectable: !element.locked,
    evented: !element.locked,
    lockMovementX: element.locked,
    lockMovementY: element.locked,
  });

  if (element.type === "image") {
    applyImageObjectStyle(object, element);
  }

  if (element.type === "drawing") {
    // The group holds the sketch at its natural size; the element box is just a
    // scale on top, which is what lets a corner-drag resize skip a rebuild.
    applyDrawingScale(object, element);
  }

  if (element.type === "text" && object instanceof Textbox) {
    applyTextStyle(object, element);
  } else if (element.type === "shape") {
    // Corner-drag scaling is folded back into width/height by the reducer, so
    // the object is always re-laid-out at scale 1.
    if (object instanceof Ellipse) {
      object.set({
        rx: element.width / 2,
        ry: element.height / 2,
        scaleX: 1,
        scaleY: 1,
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      });
    } else if (object instanceof Rect) {
      object.set({
        width: element.width,
        height: element.height,
        rx: element.radius,
        ry: element.radius,
        scaleX: 1,
        scaleY: 1,
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      });
    } else if (object instanceof Path) {
      object.set({
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      });
    }
  }

  object.setCoords();
}

/** Flip and shadow ride on the fabric object, so they never re-rasterise. */
function applyImageObjectStyle(
  object: FabricObject,
  element: Extract<CreativeElement, { type: "image" }>,
) {
  object.set({
    flipX: element.flipX,
    flipY: element.flipY,
    shadow: element.shadow?.enabled
      ? new Shadow({
          color: element.shadow.color,
          blur: element.shadow.blur,
          offsetX: element.shadow.offsetX,
          offsetY: element.shadow.offsetY,
        })
      : null,
  });
}

function transformTextCase(
  text: string,
  transform: CreativeTextElement["textTransform"],
) {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(
        /(^|\s)(\p{L})/gu,
        (_match, lead: string, letter: string) => lead + letter.toUpperCase(),
      );
    default:
      return text;
  }
}

/**
 * Map the document's typography fields onto a fabric Textbox. Tracking is
 * stored in px but fabric measures charSpacing in thousandths of an em, so it
 * is converted against the element's own font size.
 */
function applyTextStyle(object: Textbox, element: CreativeTextElement) {
  const outline =
    element.outline?.enabled && element.outline.width > 0
      ? element.outline
      : undefined;
  // While the user is actively editing this textbox, its LIVE text is
  // authoritative — the document copy is stale until editing exits and commits.
  // A re-render mid-edit (e.g. a font-size or resize change) must apply every
  // other style but leave the text alone, or it wipes what they just typed back
  // to the last-saved value.
  const editing = object.isEditing === true;
  object.set({
    ...(editing
      ? {}
      : { text: transformTextCase(element.text, element.textTransform) }),
    width: element.width,
    scaleX: 1,
    scaleY: 1,
    fontSize: element.fontSize,
    fill: element.fill,
    textAlign: element.textAlign,
    lineHeight: element.lineHeight,
    charSpacing: Math.round(
      (element.letterSpacing / Math.max(1, element.fontSize)) * 1000,
    ),
    textBackgroundColor: element.highlight?.enabled
      ? element.highlight.color
      : "",
    // null, not undefined: `set` ignores undefined, so turning the outline off
    // on an already-rendered Textbox has to clear the stroke explicitly.
    stroke: outline ? outline.color : null,
    strokeWidth: outline ? outline.width : 0,
    paintFirst: "stroke",
    shadow: element.shadow?.enabled
      ? new Shadow({
          color: element.shadow.color,
          blur: element.shadow.blur,
          offsetX: element.shadow.offsetX,
          offsetY: element.shadow.offsetY,
        })
      : null,
  });
}

/** Fit point text to its longest explicit line without exceeding the page. */
function fitTextboxToContent(object: Textbox, maxWidth: number) {
  const fontSize = Number(object.fontSize) || 16;
  const longestLine = (object.text ?? "").split("\n").reduce((widest, line) => {
    const measure = new FabricText(line || " ", {
      fontFamily: object.fontFamily,
      fontSize,
      fontWeight: object.fontWeight,
      fontStyle: object.fontStyle,
      charSpacing: object.charSpacing,
    });
    return Math.max(widest, measure.width ?? 0);
  }, 0);
  const width = Math.round(
    Math.min(maxWidth, Math.max(fontSize * 1.5, longestLine + 2)),
  );
  object.set({ width, scaleX: 1 });
  object.initDimensions();
  object.setCoords();
  return {
    width: Math.round(object.width),
    height: Math.max(1, Math.round(object.height)),
  };
}

type FabricStageProps = {
  page: CreativePage;
  /** Consecutive real pages represented by an editor-only spread. */
  spreadPages?: CreativePage[];
  spreadPageWidth?: number;
  fonts: CreativeFont[];
  pageIndex: number;
  pageCount: number;
  width: number;
  height: number;
  selectedElementId?: string;
  selectedElementIds?: string[];
  onSelect(elementId?: string): void;
  onSelectionChange?(elementIds: string[]): void;
  onTransform(
    elementId: string,
    changes: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      fontSize?: number;
    },
  ): void;
  onTransforms?(
    transforms: Array<{
      elementId: string;
      changes: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        fontSize?: number;
      };
    }>,
  ): void;
  onTextChange(
    elementId: string,
    text: string,
    dimensions?: { width: number; height: number },
  ): void;
  /**
   * A free image was released over a frame. The workspace owns the document
   * edit so filling the frame and removing the old image share one undo step.
   */
  onImageFrameDrop?(imageId: string, frameId: string): void;
  /** The element under a secondary click, used by the editor context menu. */
  onContextTarget?(elementId?: string): void;
  /**
   * Freehand drawing settings. Absent means the select tool is active and the
   * canvas behaves exactly as it did before drawing existed.
   */
  drawing?: DrawingSettings;
  /** A finished stroke, in document coordinates. */
  onStrokeCommit?(stroke: CreativeDrawingStroke): void;
  /**
   * The eraser touched this document point — repeatedly, while dragging.
   * Which strokes that hits is a document question, so it is answered by the
   * workspace rather than here.
   */
  onErasePoint?(point: { x: number; y: number }): void;
  /** Snap to canvas and sibling alignment lines while dragging. */
  snapEnabled?: boolean;
  /** Fatter handles and no page-scroll stealing, for finger input. */
  touch?: boolean;
};

export type DrawingSettings = {
  tool: "draw" | "erase";
  brush: CreativeBrush;
  color: string;
  /** Document px. */
  width: number;
  opacity: number;
  smoothing: number;
  /** Eraser reach in document px. */
  eraserRadius: number;
};

export const FabricStage = forwardRef<FabricStageHandle, FabricStageProps>(
  function FabricStage(
    {
      page,
      spreadPages,
      spreadPageWidth,
      fonts,
      pageIndex,
      pageCount,
      width,
      height,
      selectedElementId,
      selectedElementIds,
      onSelect,
      onSelectionChange,
      onTransform,
      onTransforms,
      onTextChange,
      onImageFrameDrop,
      onContextTarget,
      drawing,
      onStrokeCommit,
      onErasePoint,
      snapEnabled = true,
      touch = false,
    },
    ref,
  ) {
    const canvasElementRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<Canvas | null>(null);
    const objectIdsRef = useRef(new WeakMap<FabricObject, string>());
    const renderedRef = useRef(new Map<string, RenderedElement>());
    /** Objects from slides that aren't showing, kept for the trip back. */
    const parkedRef = useRef(new Map<string, FabricObject>());
    const backgroundObjectsRef = useRef<FabricObject[]>([]);
    const backgroundSignatureRef = useRef<string>("");
    const guideObjectsRef = useRef<FabricObject[]>([]);
    const spreadGuideObjectsRef = useRef<FabricObject[]>([]);
    const frameDropPreviewRef = useRef<{
      frameId: string;
      imageId: string;
      overlay: FabricObject;
    } | null>(null);
    const hoveredFrameIdRef = useRef<string | null>(null);
    const selectedElementIdRef = useRef(selectedElementId);
    const selectedElementIdsRef = useRef(selectedElementIds ?? []);
    const pageRef = useRef(page);
    const frameRef = useRef({ width, height });
    const snapEnabledRef = useRef(snapEnabled);
    const renderVersionRef = useRef(0);
    const syncingRef = useRef(false);
    const drawingRef = useRef(drawing);
    const callbacksRef = useRef({
      onSelect,
      onSelectionChange,
      onTransform,
      onTransforms,
      onTextChange,
      onImageFrameDrop,
      onContextTarget,
      onStrokeCommit,
      onErasePoint,
    });

    callbacksRef.current = {
      onSelect,
      onSelectionChange,
      onTransform,
      onTransforms,
      onTextChange,
      onImageFrameDrop,
      onContextTarget,
      onStrokeCommit,
      onErasePoint,
    };
    drawingRef.current = drawing;
    selectedElementIdRef.current = selectedElementId;
    selectedElementIdsRef.current = selectedElementIds ?? [];
    pageRef.current = page;
    frameRef.current = { width, height };
    snapEnabledRef.current = snapEnabled;

    useEffect(() => {
      const element = canvasElementRef.current;
      if (!element) return;

      const canvas = new Canvas(element, {
        width,
        height,
        preserveObjectStacking: true,
        selection: true,
        // Add to a selection with Shift, Ctrl or Cmd click (Fabric defaults to
        // Shift only) — so tapping several elements gathers them for shared edits.
        selectionKey: ["shiftKey", "ctrlKey", "metaKey"],
        // Fabric ignores secondary-button pointer events unless opted in. Let
        // the browser event continue bubbling so Radix can position the menu.
        fireRightClick: true,
        stopContextMenu: false,
        backgroundColor: page.background,
      });
      fabricRef.current = canvas;

      const selectedId = (target?: FabricObject) =>
        target ? objectIdsRef.current.get(target) : undefined;

      const clearGuides = () => {
        if (!guideObjectsRef.current.length) return;
        canvas.remove(...guideObjectsRef.current);
        guideObjectsRef.current = [];
      };

      const clearFrameDropPreview = () => {
        const preview = frameDropPreviewRef.current;
        hoveredFrameIdRef.current = null;
        if (!preview) return;
        canvas.remove(preview.overlay);
        const image = renderedRef.current.get(preview.imageId);
        const frame = renderedRef.current.get(preview.frameId);
        if (image) image.object.set({ opacity: image.element.opacity });
        if (frame) frame.object.set({ opacity: frame.element.opacity });
        frameDropPreviewRef.current = null;
        canvas.requestRenderAll();
      };

      const frameAtPointer = (
        event: MouseEvent | PointerEvent,
        movingId: string,
      ) => {
        const point = canvas.getScenePoint(event);
        return [...renderedRef.current.values()].reverse().find(
          (
            entry,
          ): entry is RenderedElement & {
            element: CreativeFrameElement;
          } =>
            entry.element.type === "frame" &&
            entry.element.id !== movingId &&
            entry.element.visible &&
            !entry.element.locked &&
            point.x >= entry.element.x &&
            point.x <= entry.element.x + entry.element.width &&
            point.y >= entry.element.y &&
            point.y <= entry.element.y + entry.element.height,
        );
      };

      /**
       * Preview the moving image through the frame's real clipping renderer.
       * It uses the already-decoded Fabric image, so crossing a frame never
       * starts another network request or stalls the pointer gesture.
       */
      const showFrameDropPreview = (
        imageEntry: RenderedElement & {
          element: Extract<CreativeElement, { type: "image" }>;
        },
        frameEntry: RenderedElement & { element: CreativeFrameElement },
      ) => {
        const current = frameDropPreviewRef.current;
        if (
          current?.frameId === frameEntry.element.id &&
          current.imageId === imageEntry.element.id
        ) {
          return;
        }
        clearFrameDropPreview();
        if (!(imageEntry.object instanceof FabricImage)) return;

        const source = imageEntry.object.getElement();
        const sourceSize = {
          width:
            "width" in source && typeof source.width === "number"
              ? source.width
              : imageEntry.element.width,
          height:
            "height" in source && typeof source.height === "number"
              ? source.height
              : imageEntry.element.height,
        };
        const previewCanvas = renderFrameCanvas(
          {
            ...frameEntry.element,
            asset: imageEntry.element.asset,
            stroke: studioAccent(),
            strokeWidth: Math.max(frameEntry.element.strokeWidth, 4),
          },
          source,
          sourceSize,
          false,
        );
        const overlay = new FabricImage(previewCanvas, {
          left: frameEntry.element.x,
          top: frameEntry.element.y,
          originX: "left",
          originY: "top",
          angle: frameEntry.element.rotation,
          opacity: 0.92,
          scaleX: frameEntry.element.width / Math.max(1, previewCanvas.width),
          scaleY: frameEntry.element.height / Math.max(1, previewCanvas.height),
          selectable: false,
          evented: false,
          excludeFromExport: true,
          shadow: new Shadow({
            color: "rgba(138, 67, 225, 0.34)",
            blur: 18,
            offsetX: 0,
            offsetY: 0,
          }),
        });
        imageEntry.object.set({ opacity: imageEntry.element.opacity * 0.24 });
        frameEntry.object.set({ opacity: frameEntry.element.opacity * 0.2 });
        canvas.add(overlay);
        frameDropPreviewRef.current = {
          frameId: frameEntry.element.id,
          imageId: imageEntry.element.id,
          overlay,
        };
        hoveredFrameIdRef.current = frameEntry.element.id;
        canvas.requestRenderAll();
      };

      /**
       * Promote the already-decoded, already-styled moving image into the real
       * frame object. The document update that follows will have the same
       * signature, so reconciliation keeps this object instead of downloading
       * and processing the source again after release.
       */
      const commitFrameDropPreview = (
        imageEntry: RenderedElement & {
          element: Extract<CreativeElement, { type: "image" }>;
        },
        frameEntry: RenderedElement & { element: CreativeFrameElement },
      ) => {
        const preview = frameDropPreviewRef.current;
        if (
          !preview ||
          preview.imageId !== imageEntry.element.id ||
          preview.frameId !== frameEntry.element.id ||
          !(imageEntry.object instanceof FabricImage)
        ) {
          return false;
        }

        const source = imageEntry.object.getElement();
        const sourceSize = {
          width:
            "width" in source && typeof source.width === "number"
              ? source.width
              : imageEntry.element.width,
          height:
            "height" in source && typeof source.height === "number"
              ? source.height
              : imageEntry.element.height,
        };
        const nextFrame: CreativeFrameElement = {
          ...frameEntry.element,
          asset: imageEntry.element.asset,
          adjustments: imageEntry.element.adjustments,
          effect: imageEntry.element.effect,
          edgeEffect: imageEntry.element.edgeEffect,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
        };
        const rendered = renderFrameCanvas(
          nextFrame,
          source,
          sourceSize,
          false,
        );
        const object = new FabricImage(rendered, {
          left: nextFrame.x,
          top: nextFrame.y,
          originX: "left",
          originY: "top",
          angle: nextFrame.rotation,
          opacity: nextFrame.opacity,
          scaleX: nextFrame.width / Math.max(1, rendered.width),
          scaleY: nextFrame.height / Math.max(1, rendered.height),
          selectable: !nextFrame.locked,
          evented: !nextFrame.locked,
          lockMovementX: nextFrame.locked,
          lockMovementY: nextFrame.locked,
          transparentCorners: false,
          cornerColor: studioAccent(),
          cornerStyle: "circle",
          borderColor: studioAccent(),
          cornerSize: touch ? 26 : 18,
          padding: touch ? 8 : 4,
        });
        const stackIndex = Math.max(
          0,
          canvas.getObjects().indexOf(frameEntry.object),
        );
        canvas.remove(preview.overlay, frameEntry.object, imageEntry.object);
        canvas.insertAt(stackIndex, object);
        objectIdsRef.current.set(object, nextFrame.id);
        renderedRef.current.delete(imageEntry.element.id);
        renderedRef.current.set(nextFrame.id, {
          object,
          element: nextFrame,
          signature: elementSignature(nextFrame, { pageIndex, pageCount }),
        });
        frameDropPreviewRef.current = null;
        hoveredFrameIdRef.current = null;
        canvas.setActiveObject(object);
        canvas.requestRenderAll();
        return true;
      };

      const publishSelection = (selected: FabricObject[] = []) => {
        if (syncingRef.current) return;
        const ids = selected
          .map((object) => selectedId(object))
          .filter((id): id is string => Boolean(id));
        const groupIds = new Set(
          pageRef.current.elements
            .filter((element) => ids.includes(element.id) && element.groupId)
            .map((element) => element.groupId),
        );
        const expandedIds = groupIds.size
          ? pageRef.current.elements
              .filter(
                (element) =>
                  ids.includes(element.id) ||
                  (element.groupId && groupIds.has(element.groupId)),
              )
              .map((element) => element.id)
          : ids;

        if (
          expandedIds.length > 1 &&
          (expandedIds.length !== ids.length ||
            expandedIds.some((id) => !ids.includes(id)))
        ) {
          const objects = expandedIds.flatMap((id) => {
            const object = renderedRef.current.get(id)?.object;
            return object ? [object] : [];
          });
          if (objects.length > 1) {
            syncingRef.current = true;
            canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
            syncingRef.current = false;
            canvas.requestRenderAll();
          }
        }
        callbacksRef.current.onSelectionChange?.(expandedIds);
        callbacksRef.current.onSelect(
          expandedIds.length === 1 ? expandedIds[0] : undefined,
        );
      };

      canvas.on("selection:created", ({ selected }) => {
        publishSelection(selected);
      });
      canvas.on("selection:updated", ({ selected }) => {
        publishSelection(selected);
      });
      canvas.on("selection:cleared", () => {
        if (!syncingRef.current) {
          callbacksRef.current.onSelectionChange?.([]);
          callbacksRef.current.onSelect(undefined);
        }
      });
      canvas.on("object:moving", ({ target }) => {
        if (!target) return;
        const movingId = selectedId(target);
        const movingEntry = movingId
          ? renderedRef.current.get(movingId)
          : undefined;
        if (movingEntry?.element.type !== "image") {
          clearFrameDropPreview();
        }
        if (!snapEnabledRef.current) return;
        const others = Array.from(renderedRef.current.values())
          .filter((entry) => entry.element.id !== movingId)
          .map((entry) => ({
            x: entry.element.x,
            y: entry.element.y,
            width: entry.element.width,
            height: entry.element.height,
          }));
        const snapped = snapBox(
          {
            x: target.left,
            y: target.top,
            width: target.getScaledWidth(),
            height: target.getScaledHeight(),
          },
          { frame: frameRef.current, others },
        );
        target.set({ left: snapped.x, top: snapped.y });
        clearGuides();
        if (snapped.guides.length) {
          const { width: frameWidth, height: frameHeight } = frameRef.current;
          guideObjectsRef.current = snapped.guides.map(
            (guide) =>
              new Line(
                guide.orientation === "vertical"
                  ? [guide.position, 0, guide.position, frameHeight]
                  : [0, guide.position, frameWidth, guide.position],
                {
                  stroke: studioAccent(),
                  strokeWidth: 1.5,
                  strokeDashArray: [8, 8],
                  selectable: false,
                  evented: false,
                  excludeFromExport: true,
                  objectCaching: false,
                },
              ),
          );
          canvas.add(...guideObjectsRef.current);
        }
      });
      canvas.on("object:moving", ({ target, e }) => {
        if (!target || !e) return;
        const imageId = selectedId(target);
        const imageEntry = imageId
          ? renderedRef.current.get(imageId)
          : undefined;
        if (!imageEntry || imageEntry.element.type !== "image") return;
        const frameEntry = frameAtPointer(
          e as MouseEvent | PointerEvent,
          imageEntry.element.id,
        );
        if (frameEntry) {
          showFrameDropPreview(
            imageEntry as RenderedElement & {
              element: Extract<CreativeElement, { type: "image" }>;
            },
            frameEntry,
          );
        } else clearFrameDropPreview();
      });
      canvas.on("mouse:up", clearGuides);
      canvas.on("mouse:down:before", ({ target, e }) => {
        if (!e || (e as MouseEvent).button !== 2) return;
        const id =
          target instanceof ActiveSelection
            ? selectedId(target.getObjects()[0])
            : selectedId(target);
        callbacksRef.current.onContextTarget?.(id);
        if (!(target instanceof ActiveSelection)) {
          callbacksRef.current.onSelectionChange?.(id ? [id] : []);
          callbacksRef.current.onSelect(id);
        }
        if (target) canvas.setActiveObject(target);
        canvas.requestRenderAll();
      });

      // --- Freehand drawing -------------------------------------------------
      // The in-progress stroke lives only on the fabric canvas; it becomes a
      // document element on release. Drawing therefore costs no re-renders and
      // no history entries until the pointer lifts.
      const sketch: {
        points: number[];
        preview: FabricObject | null;
        frame: number | null;
        erasing: boolean;
      } = { points: [], preview: null, frame: null, erasing: false };

      const dropPreview = () => {
        if (sketch.frame !== null) {
          cancelAnimationFrame(sketch.frame);
          sketch.frame = null;
        }
        if (sketch.preview) {
          canvas.remove(sketch.preview);
          sketch.preview = null;
        }
      };

      const paintPreview = () => {
        sketch.frame = null;
        const settings = drawingRef.current;
        if (!settings || sketch.points.length < 2) return;
        if (sketch.preview) canvas.remove(sketch.preview);
        sketch.preview = createStrokePath(
          {
            brush: settings.brush,
            color: settings.color,
            width: settings.width,
            opacity: settings.opacity,
            points: sketch.points,
          },
          settings.smoothing,
        );
        sketch.preview.set({ excludeFromExport: true });
        canvas.add(sketch.preview);
        canvas.requestRenderAll();
      };

      canvas.on("mouse:down", ({ e }) => {
        const settings = drawingRef.current;
        if (!settings) return;
        const point = canvas.getScenePoint(e);
        if (settings.tool === "erase") {
          sketch.erasing = true;
          callbacksRef.current.onErasePoint?.({ x: point.x, y: point.y });
          return;
        }
        sketch.points = [point.x, point.y];
        paintPreview();
      });

      canvas.on("mouse:move", ({ e }) => {
        const settings = drawingRef.current;
        if (!settings) return;
        // Hover fires this constantly, so nothing is computed until a gesture
        // is actually in progress.
        if (settings.tool === "erase") {
          if (!sketch.erasing) return;
          const erasePoint = canvas.getScenePoint(e);
          callbacksRef.current.onErasePoint?.({
            x: erasePoint.x,
            y: erasePoint.y,
          });
          return;
        }
        if (!sketch.points.length) return;
        const point = canvas.getScenePoint(e);
        sketch.points.push(point.x, point.y);
        // Repainting per pointer event regenerates the whole path each time; at
        // a frame's granularity it stays smooth on a long stroke.
        if (sketch.frame === null) {
          sketch.frame = requestAnimationFrame(paintPreview);
        }
      });

      canvas.on("mouse:up", () => {
        const settings = drawingRef.current;
        sketch.erasing = false;
        if (!settings || settings.tool === "erase") return;
        const points = capStrokePoints(simplifyStrokePoints(sketch.points));
        sketch.points = [];
        dropPreview();
        if (points.length < 2) return;
        callbacksRef.current.onStrokeCommit?.({
          brush: settings.brush,
          color: settings.color,
          width: settings.width,
          opacity: settings.opacity,
          points,
        });
      });

      canvas.on("object:modified", ({ target }) => {
        clearGuides();
        if (!target || syncingRef.current) return;
        if (target instanceof ActiveSelection) {
          const transforms = target.getObjects().flatMap((object) => {
            const id = selectedId(object);
            if (!id) return [];
            const decomposition = util.qrDecompose(
              object.calcTransformMatrix(),
            );
            const entry = renderedRef.current.get(id);
            const fontSize =
              entry?.element.type === "text"
                ? scaledTextFontSize(
                    entry.element.fontSize,
                    decomposition.scaleY,
                  )
                : undefined;
            const origin = object.translateToOriginPoint(
              object.getCenterPoint(),
              "left",
              "top",
            );
            return [
              {
                elementId: id,
                changes: {
                  x: Math.round(origin.x),
                  y: Math.round(origin.y),
                  width: Math.max(
                    1,
                    Math.round(object.width * Math.abs(decomposition.scaleX)),
                  ),
                  height: Math.max(
                    1,
                    Math.round(object.height * Math.abs(decomposition.scaleY)),
                  ),
                  rotation: Math.round(decomposition.angle * 10) / 10,
                  ...(fontSize === undefined ? {} : { fontSize }),
                },
              },
            ];
          });
          callbacksRef.current.onTransforms?.(transforms);
          return;
        }
        const id = selectedId(target);
        if (!id) return;
        const frameId = hoveredFrameIdRef.current;
        const entry = renderedRef.current.get(id);
        if (frameId && entry?.element.type === "image") {
          const frameEntry = renderedRef.current.get(frameId);
          if (frameEntry?.element.type === "frame") {
            commitFrameDropPreview(
              entry as RenderedElement & {
                element: Extract<CreativeElement, { type: "image" }>;
              },
              frameEntry as RenderedElement & {
                element: CreativeFrameElement;
              },
            );
          } else {
            clearFrameDropPreview();
          }
          callbacksRef.current.onImageFrameDrop?.(id, frameId);
          return;
        }
        clearFrameDropPreview();
        const fontSize =
          entry?.element.type === "text"
            ? scaledTextFontSize(entry.element.fontSize, target.scaleY)
            : undefined;
        callbacksRef.current.onTransform(id, {
          x: Math.round(target.left),
          y: Math.round(target.top),
          width: Math.max(1, Math.round(target.getScaledWidth())),
          height: Math.max(1, Math.round(target.getScaledHeight())),
          rotation: Math.round(target.angle * 10) / 10,
          ...(fontSize === undefined ? {} : { fontSize }),
        });
      });
      canvas.on("text:editing:entered", ({ target }) => {
        // Case transforms are a render-time concern; editing must show and
        // return the author's own casing, not the transformed copy.
        const id = selectedId(target);
        const entry = id ? renderedRef.current.get(id) : undefined;
        if (entry?.element.type === "text" && target instanceof Textbox) {
          target.set({ text: entry.element.text });
          if (entry.element.autoWidth) {
            const pageWidth = spreadPageWidth ?? width;
            const localX =
              ((entry.element.x % pageWidth) + pageWidth) % pageWidth;
            fitTextboxToContent(
              target,
              Math.max(entry.element.fontSize * 1.5, pageWidth - localX - 40),
            );
          }
          canvas.requestRenderAll();
        }
      });
      canvas.on("text:changed", ({ target }) => {
        const id = selectedId(target);
        const entry = id ? renderedRef.current.get(id) : undefined;
        if (
          entry?.element.type !== "text" ||
          !entry.element.autoWidth ||
          !(target instanceof Textbox)
        ) {
          return;
        }
        const pageWidth = spreadPageWidth ?? width;
        const localX = ((entry.element.x % pageWidth) + pageWidth) % pageWidth;
        fitTextboxToContent(
          target,
          Math.max(entry.element.fontSize * 1.5, pageWidth - localX - 40),
        );
        canvas.requestRenderAll();
      });
      canvas.on("text:editing:exited", ({ target }) => {
        if (syncingRef.current) return;
        const id = selectedId(target);
        if (!id) return;
        const entry = renderedRef.current.get(id);
        callbacksRef.current.onTextChange(
          id,
          target.text ?? "",
          entry?.element.type === "text" &&
            entry.element.autoWidth &&
            target instanceof Textbox
            ? {
                width: Math.round(target.width),
                height: Math.max(1, Math.round(target.height)),
              }
            : undefined,
        );
      });

      return () => {
        renderVersionRef.current += 1;
        // The pending repaint would otherwise run against a disposed canvas.
        if (sketch.frame !== null) cancelAnimationFrame(sketch.frame);
        canvas.dispose();
        fabricRef.current = null;
        renderedRef.current = new Map();
        parkedRef.current = new Map();
        objectIdsRef.current = new WeakMap();
        backgroundObjectsRef.current = [];
        backgroundSignatureRef.current = "";
        guideObjectsRef.current = [];
        spreadGuideObjectsRef.current = [];
        frameDropPreviewRef.current = null;
        hoveredFrameIdRef.current = null;
      };
    }, [height, width]);

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const renderVersion = ++renderVersionRef.current;

      void (async () => {
        syncingRef.current = true;
        // ActiveSelection stores child coordinates relative to its temporary
        // wrapper. Release it before document coordinates are patched back in.
        if (canvas.getActiveObject() instanceof ActiveSelection) {
          canvas.discardActiveObject();
        }
        const spreadSource =
          spreadPages && spreadPages.length > 1 && spreadPageWidth
            ? { pages: spreadPages, pageWidth: spreadPageWidth }
            : null;
        canvas.backgroundColor = spreadSource
          ? (spreadSource.pages[0]?.background ?? "transparent")
          : page.background;

        const backgroundSignature = spreadSource
          ? `${spreadSource.pages
              .map(
                (candidate) =>
                  `${candidate.id}:${candidate.background}:${JSON.stringify(
                    candidate.backgroundEffect ?? null,
                  )}`,
              )
              .join("|")}:${spreadSource.pageWidth}x${height}`
          : `${page.background}:${JSON.stringify(
              page.backgroundEffect ?? null,
            )}:${width}x${height}`;
        if (backgroundSignature !== backgroundSignatureRef.current) {
          const objects: FabricObject[] = [];
          if (spreadSource) {
            const background = await createSpreadBackgroundObject(
              spreadSource.pages,
              spreadSource.pageWidth,
              height,
            );
            if (background) objects.push(background);
          } else {
            const object = await createBackgroundEffectObject(
              page.backgroundEffect,
              width,
              height,
            );
            if (object) objects.push(object);
          }
          if (
            renderVersion !== renderVersionRef.current ||
            !fabricRef.current
          ) {
            return;
          }
          if (backgroundObjectsRef.current.length)
            canvas.remove(...backgroundObjectsRef.current);
          backgroundObjectsRef.current = objects;
          objects.forEach((object, index) => canvas.insertAt(index, object));

          if (spreadGuideObjectsRef.current.length)
            canvas.remove(...spreadGuideObjectsRef.current);
          spreadGuideObjectsRef.current = spreadSource
            ? spreadSource.pages.slice(1).map(
                (_, index) =>
                  new Line(
                    [
                      (index + 1) * spreadSource.pageWidth,
                      0,
                      (index + 1) * spreadSource.pageWidth,
                      height,
                    ],
                    {
                      stroke: "rgba(255,255,255,0.94)",
                      strokeWidth: Math.max(2, width / 900),
                      strokeDashArray: [
                        Math.max(10, width / 90),
                        Math.max(8, width / 120),
                      ],
                      selectable: false,
                      evented: false,
                      excludeFromExport: true,
                      shadow: new Shadow({
                        color: "rgba(0,0,0,0.45)",
                        blur: 2,
                      }),
                    },
                  ),
              )
            : [];
          if (spreadGuideObjectsRef.current.length)
            canvas.add(...spreadGuideObjectsRef.current);
          backgroundSignatureRef.current = backgroundSignature;
        }

        // Text needs its faces to measure correctly, but a slow or dead font
        // fetch must not hold the whole slide hostage: wait briefly, draw, then
        // reflow if the faces land afterwards.
        const fontsReady = Promise.all([
          Promise.allSettled(fonts.map(registerCreativeFont)),
          ensureFontsForFamilies(textFamilies(page)),
        ]);
        await Promise.race([
          fontsReady,
          new Promise((resolve) => window.setTimeout(resolve, FONT_WAIT_MS)),
        ]);

        const visible = page.elements.filter((element) => element.visible);
        const visibleIds = new Set(visible.map((element) => element.id));

        // Leaving a slide parks its objects rather than destroying them.
        // Rebuilding an image, frame or vector means refetching and
        // re-rasterising it, which is what made cycling between slides cost
        // seconds a time.
        for (const [id, entry] of renderedRef.current) {
          if (!visibleIds.has(id)) {
            canvas.remove(entry.object);
            park(parkedRef.current, `${id}:${entry.signature}`, entry.object);
            renderedRef.current.delete(id);
          }
        }

        const restack = () => {
          const offset = backgroundObjectsRef.current.length;
          visible.forEach((element, index) => {
            const entry = renderedRef.current.get(element.id);
            if (entry) canvas.moveObjectTo(entry.object, index + offset);
          });
          spreadGuideObjectsRef.current.forEach((guide) =>
            canvas.bringObjectToFront(guide),
          );
        };

        const mount = (
          element: CreativeElement,
          object: FabricObject,
          signature: string,
          previous?: FabricObject,
        ) => {
          if (previous) canvas.remove(previous);
          objectIdsRef.current.set(object, element.id);
          renderedRef.current.set(element.id, { object, element, signature });
          canvas.add(object);
          // A slide's worth of elements, so re-stacking on every arrival is
          // cheap — and it keeps the order right while the rest are still
          // coming in.
          restack();
          canvas.requestRenderAll();
        };

        // Each element is mounted the moment it is ready instead of waiting for
        // the slowest one. Awaiting them all together meant one large photo left
        // the entire slide blank until it decoded.
        await Promise.all(
          visible.map(async (element) => {
            const signature = elementSignature(element, {
              pageIndex,
              pageCount,
            });
            const existing = renderedRef.current.get(element.id);
            if (existing && existing.signature === signature) {
              patchFabricObject(existing.object, element);
              existing.element = element;
              return;
            }

            const parked = unpark(
              parkedRef.current,
              `${element.id}:${signature}`,
            );
            if (parked) {
              patchFabricObject(parked, element);
              if (renderVersion !== renderVersionRef.current) return;
              mount(element, parked, signature, existing?.object);
              return;
            }

            try {
              const object = await createFabricObject(element, {
                pageIndex,
                pageCount,
                touch,
              });
              if (
                renderVersion !== renderVersionRef.current ||
                !fabricRef.current
              ) {
                return;
              }
              mount(element, object, signature, existing?.object);
            } catch {
              // One unreachable asset leaves its slot empty rather than taking
              // the rest of the slide with it.
            }
          }),
        );
        if (renderVersion !== renderVersionRef.current || !fabricRef.current) {
          return;
        }

        restack();

        // Sweep orphaned element objects. An object the canvas still holds that
        // was mounted for an element (so it carries an id) but is no longer the
        // tracked object for any element is an orphan — left by a superseded
        // render, or by a document with duplicate element ids (the id-keyed map
        // only tracks the last one). Untracked, the parking pass can never find
        // them, so they linger and bleed onto other slides when switching fast.
        // Backgrounds, guides and previews carry no id, so they're untouched.
        const tracked = new Set<FabricObject>();
        for (const entry of renderedRef.current.values()) {
          tracked.add(entry.object);
        }
        for (const object of canvas.getObjects()) {
          if (objectIdsRef.current.has(object) && !tracked.has(object)) {
            canvas.remove(object);
          }
        }

        // Faces that arrived after we drew: text measured in a fallback, so
        // re-apply its styling once they are in and let it reflow.
        void fontsReady.then(() => {
          if (
            renderVersion !== renderVersionRef.current ||
            !fabricRef.current
          ) {
            return;
          }
          for (const entry of renderedRef.current.values()) {
            if (entry.element.type === "text") {
              patchFabricObject(entry.object, entry.element);
            }
          }
          canvas.requestRenderAll();
        });

        const selectedObjects = selectedElementIdsRef.current.flatMap((id) => {
          const object = renderedRef.current.get(id)?.object;
          return object ? [object] : [];
        });
        const active =
          selectedObjects.length > 1
            ? new ActiveSelection(selectedObjects, { canvas })
            : (selectedObjects[0] ??
              (selectedElementIdRef.current
                ? renderedRef.current.get(selectedElementIdRef.current)?.object
                : undefined));
        if (active) {
          if (canvas.getActiveObject() !== active)
            canvas.setActiveObject(active);
        } else if (canvas.getActiveObject()) {
          canvas.discardActiveObject();
        }

        canvas.requestRenderAll();
        syncingRef.current = false;
      })().catch(() => {
        syncingRef.current = false;
      });
    }, [
      fonts,
      height,
      page,
      pageCount,
      pageIndex,
      spreadPageWidth,
      spreadPages,
      touch,
      width,
    ]);

    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas || syncingRef.current) return;
      syncingRef.current = true;
      try {
        const objects = (selectedElementIds ?? []).flatMap((id) => {
          const object = renderedRef.current.get(id)?.object;
          return object ? [object] : [];
        });
        const current = canvas.getActiveObject();

        // If the canvas already holds exactly this multi-selection, leave it
        // alone. Rebuilding an ActiveSelection from objects that are already
        // its children makes Fabric read their group-relative coords as
        // absolute and flings the members apart — the "grouped items jump far
        // apart on tap" bug.
        if (objects.length > 1 && current instanceof ActiveSelection) {
          const desiredIds = objects.flatMap((object) => {
            const id = objectIdsRef.current.get(object);
            return id ? [id] : [];
          });
          const currentIds = new Set(
            current
              .getObjects()
              .map((object) => objectIdsRef.current.get(object)),
          );
          if (
            desiredIds.length === currentIds.size &&
            desiredIds.every((id) => currentIds.has(id))
          ) {
            return;
          }
        }

        const object =
          objects.length > 1
            ? new ActiveSelection(objects, { canvas })
            : (objects[0] ??
              (selectedElementId
                ? renderedRef.current.get(selectedElementId)?.object
                : undefined));
        if (object && current !== object) {
          // Release any live ActiveSelection first so its children return to
          // absolute coords before being re-parented into the new selection —
          // otherwise the relative coords are misread as absolute.
          if (current instanceof ActiveSelection) canvas.discardActiveObject();
          canvas.setActiveObject(object);
          canvas.requestRenderAll();
        } else if (!object && current) {
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
      } finally {
        syncingRef.current = false;
      }
    }, [selectedElementId, selectedElementIds]);

    // While a brush is active the canvas must not select or drag anything: a
    // stroke that starts on top of an element would otherwise move it instead.
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = Boolean(drawing);
      canvas.selection = !active;
      canvas.skipTargetFind = active;
      canvas.defaultCursor = active ? "crosshair" : "default";
      if (active && canvas.getActiveObject()) canvas.discardActiveObject();
      canvas.requestRenderAll();
    }, [drawing]);

    useEffect(() => {
      const canvas = fabricRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const resize = () => {
        const bounds = container.getBoundingClientRect();
        const scale = Math.min(bounds.width / width, bounds.height / height);
        canvas.setDimensions(
          {
            width: Math.max(1, Math.floor(width * scale)),
            height: Math.max(1, Math.floor(height * scale)),
          },
          { cssOnly: true },
        );
      };

      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
      return () => observer.disconnect();
    }, [height, width]);

    useImperativeHandle(
      ref,
      () => ({
        exportPng: async () => {
          const canvas = fabricRef.current;
          if (!canvas) throw new Error("The creative canvas is not ready.");
          // Snap guides are ordinary canvas objects, so they'd be baked into
          // the PNG if a drag was interrupted by the export.
          if (guideObjectsRef.current.length) {
            canvas.remove(...guideObjectsRef.current);
            guideObjectsRef.current = [];
            canvas.requestRenderAll();
          }
          const output = canvas.toCanvasElement(1);
          return canvasToBlob(output);
        },
        toDocumentPoint: (clientX, clientY) => {
          const element = canvasElementRef.current;
          if (!element) return null;
          // The canvas is displayed scaled to fit, so the ratio between its
          // CSS box and the document size is the conversion factor.
          const bounds = element.getBoundingClientRect();
          if (bounds.width === 0 || bounds.height === 0) return null;
          if (
            clientX < bounds.left ||
            clientX > bounds.right ||
            clientY < bounds.top ||
            clientY > bounds.bottom
          ) {
            return null;
          }
          return {
            x: ((clientX - bounds.left) / bounds.width) * width,
            y: ((clientY - bounds.top) / bounds.height) * height,
          };
        },
      }),
      [height, width],
    );

    return (
      <div
        ref={containerRef}
        className="flex size-full min-h-0 items-center justify-center overflow-hidden"
        // Without this a finger drag on the canvas scrolls the page instead of
        // moving the element under it.
        style={touch ? { touchAction: "none" } : undefined}
      >
        <canvas ref={canvasElementRef} aria-label={`Editing ${page.name}`} />
      </div>
    );
  },
);

/**
 * Render any page to a PNG without mounting it, so exporting a carousel does
 * not mean stepping the editor through every slide. Uses the same object
 * factories as the live stage, so what is exported is what was on screen.
 */
/**
 * Build (and render once) an off-DOM StaticCanvas for a single page, using the
 * exact same object factories as the live editor and the still export. The
 * caller owns the returned canvas and MUST `dispose()` it. Video elements it
 * contains render as playing `<video>`-backed images, so re-calling
 * `renderAll()` over time captures motion — this is what the video encoder
 * drives frame by frame.
 */
export async function buildCreativePageCanvas(input: {
  page: CreativePage;
  fonts: CreativeFont[];
  pageIndex: number;
  pageCount: number;
  width: number;
  height: number;
}): Promise<StaticCanvas> {
  const { page, fonts, pageIndex, pageCount, width, height } = input;
  const canvas = new StaticCanvas(undefined, {
    width,
    height,
    backgroundColor: page.background,
    renderOnAddRemove: false,
  });

  const backgroundEffect = await createBackgroundEffectObject(
    page.backgroundEffect,
    width,
    height,
  );
  if (backgroundEffect) canvas.add(backgroundEffect);

  await Promise.all([
    Promise.allSettled(fonts.map(registerCreativeFont)),
    ensureFontsForFamilies(textFamilies(page)),
  ]);
  const objects = await Promise.all(
    page.elements
      .filter((element) => element.visible)
      .map(async (element) => {
        try {
          return await createFabricObject(element, {
            pageIndex,
            pageCount,
            decorateEmptyFrames: false,
          });
        } catch {
          return null;
        }
      }),
  );
  for (const object of objects) {
    if (object) canvas.add(object);
  }

  canvas.renderAll();
  return canvas;
}

export async function renderCreativePageToBlob(input: {
  page: CreativePage;
  fonts: CreativeFont[];
  pageIndex: number;
  pageCount: number;
  width: number;
  height: number;
  /** Render smaller previews without changing document-space geometry. */
  multiplier?: number;
}): Promise<Blob> {
  const { multiplier = 1, ...rest } = input;
  const canvas = await buildCreativePageCanvas(rest);
  try {
    return canvasToBlob(canvas.toCanvasElement(multiplier));
  } finally {
    canvas.dispose();
  }
}

type RenderContext = {
  pageIndex: number;
  pageCount: number;
  /** Editor-only affordance; exports render empty frames as a flat fill. */
  decorateEmptyFrames?: boolean;
  /** Enlarged handles so transform corners are reachable with a fingertip. */
  touch?: boolean;
};

type ImagePixelStyle = {
  width: number;
  height: number;
  adjustments?: CreativeImageAdjustments;
  effect?: Extract<CreativeElement, { type: "image" }>["effect"];
  edgeEffect?: Extract<CreativeElement, { type: "image" }>["edgeEffect"];
  radius?: number;
};

/**
 * Run the non-destructive image pipeline once for both free images and frames.
 * Keeping one path is what guarantees a styled image does not change its look
 * when it crosses the frame boundary.
 */
function processImagePixels(
  initialSource: CanvasImageSource,
  style: ImagePixelStyle,
) {
  let source = initialSource;
  let processed = false;
  const graded = applyImageAdjustments(
    source,
    style.width,
    style.height,
    style.adjustments ?? NEUTRAL_ADJUSTMENTS,
    style.radius ?? 0,
  );
  if (graded) {
    source = graded;
    processed = true;
  }
  if (style.effect?.enabled) {
    const effect = style.effect;
    try {
      source =
        effect.type === "dither"
          ? applyDitherEffect(source, style.width, style.height, effect)
          : effect.type === "pixelate"
            ? applyPixelateEffect(source, style.width, style.height, effect)
            : applyAsciiEffect(source, style.width, style.height, effect);
      processed = true;
    } catch {
      // Keep the original image visible if a remote source blocks pixel reads.
    }
  }
  if (style.edgeEffect?.enabled) {
    try {
      source = applyImageEdgeEffect(
        source,
        style.width,
        style.height,
        style.edgeEffect,
      );
      processed = true;
    } catch {
      // Keep the source editable when a remote image blocks pixel reads.
    }
  }
  return { source, processed };
}

async function createFabricObject(
  element: CreativeElement,
  context: RenderContext,
) {
  const shared = {
    left: element.x,
    top: element.y,
    originX: "left" as const,
    originY: "top" as const,
    angle: element.rotation,
    opacity: element.opacity,
    selectable: !element.locked,
    evented: !element.locked,
    lockMovementX: element.locked,
    lockMovementY: element.locked,
    transparentCorners: false,
    cornerColor: studioAccent(),
    cornerStyle: "circle" as const,
    borderColor: studioAccent(),
    cornerSize: context.touch ? 26 : 18,
    padding: context.touch ? 8 : 4,
  };

  if (element.type === "text") {
    const fontFamily = resolveCanvasFontFamily(element.fontFamily);
    if (typeof document !== "undefined" && document.fonts) {
      try {
        await document.fonts.load(
          `${element.fontWeight} ${element.fontSize}px ${fontFamily}`,
        );
      } catch {
        // Fabric can still render with the browser's fallback font.
      }
    }
    const textbox = new Textbox(element.text, {
      ...shared,
      width: element.width,
      fontFamily,
      fontWeight: element.fontWeight,
    });
    // Everything else comes from the one styling path shared with in-place
    // patching, so a created and a patched Textbox can never drift.
    applyTextStyle(textbox, element);
    return textbox;
  }

  if (element.type === "shape" && element.shape === "ellipse") {
    return new Ellipse({
      ...shared,
      rx: element.width / 2,
      ry: element.height / 2,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
    });
  }

  if (element.type === "shape") {
    if (element.shape !== "rectangle") {
      const path = new Path(
        shapeSvgPath(element.shape, element.width, element.height),
        {
          ...shared,
          fill: element.fill,
          stroke: element.stroke,
          strokeWidth: element.strokeWidth,
          strokeUniform: true,
        },
      );
      return path;
    }
    return new Rect({
      ...shared,
      width: element.width,
      height: element.height,
      rx: element.radius,
      ry: element.radius,
      fill: element.fill,
      stroke: element.stroke,
      strokeWidth: element.strokeWidth,
    });
  }

  if (element.type === "vector") {
    const sourceSvg =
      element.svg && element.svg.trim()
        ? element.svg
        : await fetchVectorSvg(element.assetUrl, element.name);
    const svg = element.recolorable
      ? sourceSvg.replaceAll("currentColor", element.fill)
      : sourceSvg;
    const parsed = await loadSVGFromString(svg);
    const objects = parsed.objects.filter(
      (object): object is FabricObject => object !== null,
    );
    if (objects.length === 0) {
      throw new Error("The vector does not contain any renderable objects.");
    }
    const vector = util.groupSVGElements(objects, parsed.options);
    const naturalWidth = vector.width || 1;
    const naturalHeight = vector.height || 1;
    vector.set({
      ...shared,
      scaleX: element.width / naturalWidth,
      scaleY: element.height / naturalHeight,
    });
    return vector;
  }

  if (element.type === "widget") {
    return createPagerObject(element, context, shared);
  }

  if (element.type === "drawing") {
    return createDrawingObject(element, shared);
  }

  if (element.type === "tag") {
    return createTagObject(element, shared);
  }

  if (element.type === "video") {
    // A video element renders as a FabricImage backed by a live <video>: it
    // auto-plays muted+looped, a repaint pump advances its frames, and object
    // caching is off so Fabric re-reads the video each frame instead of
    // freezing on a cached (often blank) first frame.
    const video = document.createElement("video");
    video.loop = element.loop;
    // Muted by default on the canvas; unmuting a clip lets it preview sound.
    video.muted = element.muted ?? true;
    video.playsInline = true;
    video.autoplay = true;

    // Green-screen clips are keyed live in the browser (WebM alpha decoding is
    // browser-dependent and can flatten transparency to black). For those,
    // always load the raw MP4 and set crossOrigin so WebGL can read its pixels.
    // Existing documents may still store a _keyed.webm URL, so normalize those
    // to their raw counterpart here. Never fall back to the keyed WebM.
    const rawSrc = rawGreenScreenSource(element.src);
    const wantsKey = element.chromaKeyed;
    if (wantsKey) video.crossOrigin = "anonymous";
    const primarySrc = wantsKey ? rawSrc : element.src;
    const fallbackSrc = rawSrc;
    let triedFallback = false;
    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => {
        if (!triedFallback && fallbackSrc !== primarySrc) {
          triedFallback = true;
          video.src = fallbackSrc;
          return;
        }
        resolve();
      };
      video.src = primarySrc;
      setTimeout(resolve, 8000);
    });
    video.play().catch(() => {});

    const vw = video.videoWidth || element.width;
    const vh = video.videoHeight || element.height;

    // When keying, the Fabric image is fed by a WebGL-keyed canvas the pump
    // refreshes each frame. If WebGL is unavailable the keyer is null and we
    // fall back to the raw (green) video so something still renders.
    const keyer = wantsKey ? createChromaKeyer(video, vw, vh) : null;
    const source = (keyer?.canvas ?? video) as unknown as HTMLImageElement;

    const fabricImg = new FabricImage(source, {
      ...shared,
      // A <video> has no naturalWidth/height and its width/height attributes
      // default to 0, so pin the intrinsic size and scale it to the element
      // box. (A keyed canvas is already vw×vh.)
      width: vw,
      height: vh,
      scaleX: element.width / Math.max(1, vw),
      scaleY: element.height / Math.max(1, vh),
    });
    if (element.radius > 0) {
      fabricImg.set({
        clipPath: new Rect({
          width: vw,
          height: vh,
          rx: element.radius * (vw / element.width),
          ry: element.radius * (vh / element.height),
          originX: "center",
          originY: "center",
          absolutePositioned: false,
        }),
      });
    }

    // Drive playback/keying: on each decoded frame, re-key (if keying) then
    // repaint. Object caching stays on so a paused clip still shows a frame;
    // marking dirty busts that cache so playback updates. Stops (and frees the
    // GL context) once the object leaves the canvas.
    const frameHost = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    let seenCanvas = false;
    const pump = () => {
      const host = fabricImg.canvas;
      if (host) {
        seenCanvas = true;
        keyer?.render();
        fabricImg.dirty = true;
        host.requestRenderAll();
      } else if (seenCanvas) {
        keyer?.dispose();
        return;
      }
      if (frameHost.requestVideoFrameCallback) {
        frameHost.requestVideoFrameCallback(pump);
      } else {
        requestAnimationFrame(pump);
      }
    };
    if (frameHost.requestVideoFrameCallback) {
      frameHost.requestVideoFrameCallback(pump);
    } else {
      requestAnimationFrame(pump);
    }

    return fabricImg;
  }

  if (element.type === "frame") {
    let source: CanvasImageSource | null = null;
    let sourceSize = { width: element.width, height: element.height };
    if (element.asset) {
      try {
        const loaded = await FabricImage.fromURL(element.asset.url, {
          crossOrigin: "anonymous",
        });
        const original = loaded.getElement() as CanvasImageSource;
        const styled = processImagePixels(original, {
          width: element.width,
          height: element.height,
          adjustments: element.adjustments,
          effect: element.effect,
          edgeEffect: element.edgeEffect,
        });
        source = styled.source;
        sourceSize = {
          width:
            "width" in source && typeof source.width === "number"
              ? source.width
              : loaded.width || element.width,
          height:
            "height" in source && typeof source.height === "number"
              ? source.height
              : loaded.height || element.height,
        };
      } catch {
        // Fall back to the empty placeholder if the image can't be fetched.
      }
    }
    const rendered = renderFrameCanvas(
      element,
      source,
      sourceSize,
      context.decorateEmptyFrames ?? true,
    );
    return new FabricImage(rendered, {
      ...shared,
      scaleX: element.width / Math.max(1, rendered.width),
      scaleY: element.height / Math.max(1, rendered.height),
    });
  }

  let image: FabricImage;
  try {
    image = await FabricImage.fromURL(
      element.asset.url,
      { crossOrigin: "anonymous" },
      shared,
    );
  } catch (error) {
    const label = element.asset.filename ?? element.asset.mediaId ?? element.id;
    const reason =
      error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new Error(
      `image "${label}" could not be loaded from ${element.asset.url}${reason}`,
    );
  }
  // The element box is a window onto the picture: cover fills the box and
  // crops the overflow, contain letterboxes, and crop.zoom/offset pan within
  // it — the same model frames use. A box at the picture's own aspect with an
  // identity crop is the common case and draws the picture directly.
  const windowed = windowImageToBox(image, element);
  const styled = processImagePixels(
    windowed ?? (image.getElement() as CanvasImageSource),
    element,
  );
  const renderedSource = styled.source;
  const { processed } = styled;
  if (processed) {
    const renderedWidth =
      "width" in renderedSource && typeof renderedSource.width === "number"
        ? renderedSource.width
        : element.width;
    const renderedHeight =
      "height" in renderedSource && typeof renderedSource.height === "number"
        ? renderedSource.height
        : element.height;
    const processedImage = new FabricImage(
      renderedSource as HTMLCanvasElement | HTMLImageElement,
      {
        ...shared,
        scaleX: element.width / Math.max(1, renderedWidth),
        scaleY: element.height / Math.max(1, renderedHeight),
      },
    );
    applyImageObjectStyle(processedImage, element);
    return processedImage;
  }
  if (windowed) {
    const windowedImage = new FabricImage(windowed, {
      ...shared,
      scaleX: element.width / Math.max(1, windowed.width),
      scaleY: element.height / Math.max(1, windowed.height),
    });
    applyImageObjectStyle(windowedImage, element);
    return windowedImage;
  }
  const naturalWidth = image.width || 1;
  const naturalHeight = image.height || 1;
  image.set({
    scaleX: element.width / naturalWidth,
    scaleY: element.height / naturalHeight,
  });
  applyImageObjectStyle(image, element);
  return image;
}

/**
 * Rasterise a picture into its element box honouring fit and crop. Returns
 * null when the box already matches the picture (nothing to crop), so the
 * plain scaled image path keeps its crispness and its cheap re-layout.
 */
function windowImageToBox(
  image: FabricImage,
  element: Extract<CreativeElement, { type: "image" }>,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const naturalWidth = image.width || 1;
  const naturalHeight = image.height || 1;
  const crop = element.crop ?? { zoom: 1, offsetX: 0, offsetY: 0 };
  const aspectMismatch =
    Math.abs(naturalWidth / naturalHeight - element.width / element.height) >
    0.002;
  const cropped =
    Math.abs(crop.zoom - 1) > 0.001 ||
    Math.abs(crop.offsetX) > 0.001 ||
    Math.abs(crop.offsetY) > 0.001;
  if (!aspectMismatch && !cropped) return null;

  const maxDimension = 2_048;
  const scale = Math.min(
    1,
    maxDimension / Math.max(element.width, element.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(element.width * scale));
  canvas.height = Math.max(1, Math.round(element.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  const placement = frameImagePlacement({
    frameWidth: element.width,
    frameHeight: element.height,
    imageWidth: naturalWidth,
    imageHeight: naturalHeight,
    fit: element.fit,
    zoom: crop.zoom,
    offsetX: crop.offsetX,
    offsetY: crop.offsetY,
  });
  context.drawImage(
    image.getElement() as CanvasImageSource,
    placement.x * scale,
    placement.y * scale,
    placement.width * scale,
    placement.height * scale,
  );
  return canvas;
}

/** Trace a frame silhouette into the current path, in canvas pixels. */
function traceFrameShape(
  context: CanvasRenderingContext2D,
  shape: CreativeFrameShape,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();

  const polygon = framePolygonPoints(shape, width, height);
  if (polygon) {
    polygon.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    return;
  }

  const curve = FRAME_CURVES[shape];
  if (curve) {
    context.moveTo(curve.start[0] * width, curve.start[1] * height);
    for (const [c1x, c1y, c2x, c2y, x, y] of curve.curves) {
      context.bezierCurveTo(
        c1x * width,
        c1y * height,
        c2x * width,
        c2y * height,
        x * width,
        y * height,
      );
    }
    context.closePath();
    return;
  }

  switch (shape) {
    case "circle":
      context.ellipse(
        width / 2,
        height / 2,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2,
      );
      break;
    case "arch": {
      // A semicircular top that degrades to a rounded top when the frame is
      // wider than it is tall.
      const arc = Math.min(width / 2, height);
      context.moveTo(0, height);
      context.lineTo(0, arc);
      context.arc(width / 2, arc, width / 2, Math.PI, 0);
      context.lineTo(width, height);
      break;
    }
    case "rounded": {
      const corner = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
      if (typeof context.roundRect === "function") {
        context.roundRect(0, 0, width, height, corner);
      } else {
        // roundRect is Safari 16.4+; arcTo covers older engines.
        context.moveTo(corner, 0);
        context.arcTo(width, 0, width, height, corner);
        context.arcTo(width, height, 0, height, corner);
        context.arcTo(0, height, 0, 0, corner);
        context.arcTo(0, 0, width, 0, corner);
      }
      break;
    }
    case "squircle": {
      const corner = Math.min(width, height) * 0.28;
      context.roundRect(0, 0, width, height, corner);
      break;
    }
    case "pill":
      context.roundRect(0, 0, width, height, Math.min(width, height) / 2);
      break;
    default:
      context.rect(0, 0, width, height);
  }
  context.closePath();
}

/**
 * Rasterise a frame: its silhouette clips the image (or a placeholder fill),
 * with the border stroked afterwards so it isn't halved by the clip.
 *
 * Compositing to an offscreen canvas rather than assembling a Fabric group
 * keeps the frame a single object — selection, export, and the effects pipeline
 * all treat it like any other image.
 */
function renderFrameCanvas(
  element: CreativeFrameElement,
  source: CanvasImageSource | null,
  sourceSize: { width: number; height: number },
  decorateWhenEmpty: boolean,
) {
  const maxDimension = 2_048;
  const scale = Math.min(
    1,
    maxDimension / Math.max(element.width, element.height),
  );
  const width = Math.max(1, Math.round(element.width * scale));
  const height = Math.max(1, Math.round(element.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const aperture = frameContentBox(element.shape, width, height);

  if (aperture) {
    context.fillStyle =
      element.shape === "filmstrip" ? "#242326" : element.fill;
    context.fillRect(0, 0, width, height);
    if (element.shape === "filmstrip") {
      drawFilmSprockets(context, width, height);
    }
  }

  context.save();
  if (aperture) {
    context.beginPath();
    context.rect(aperture.x, aperture.y, aperture.width, aperture.height);
    context.closePath();
  } else {
    traceFrameShape(
      context,
      element.shape,
      width,
      height,
      element.radius * scale,
    );
  }
  context.clip();

  if (source) {
    const placement = frameImagePlacement({
      frameWidth: aperture?.width ?? width,
      frameHeight: aperture?.height ?? height,
      imageWidth: sourceSize.width,
      imageHeight: sourceSize.height,
      fit: element.fit,
      zoom: element.zoom,
      offsetX: element.offsetX,
      offsetY: element.offsetY,
    });
    context.drawImage(
      source,
      placement.x + (aperture?.x ?? 0),
      placement.y + (aperture?.y ?? 0),
      placement.width,
      placement.height,
    );
  } else {
    context.fillStyle = aperture ? "#D8D1C7" : element.fill;
    context.fillRect(
      aperture?.x ?? 0,
      aperture?.y ?? 0,
      aperture?.width ?? width,
      aperture?.height ?? height,
    );
  }
  context.restore();

  if (!source && decorateWhenEmpty) {
    drawEmptyFrameHint(context, element, width, height, scale, aperture);
  }

  const strokeWidth = element.strokeWidth * scale;
  if (strokeWidth > 0 && element.stroke !== "transparent") {
    context.save();
    // Inset by half the stroke so the border sits fully inside the frame
    // instead of being cut off at the canvas edge.
    context.translate(width / 2, height / 2);
    context.scale(
      Math.max(0, (width - strokeWidth) / width),
      Math.max(0, (height - strokeWidth) / height),
    );
    context.translate(-width / 2, -height / 2);
    traceFrameShape(
      context,
      element.shape,
      width,
      height,
      element.radius * scale,
    );
    context.lineWidth = strokeWidth;
    context.strokeStyle = element.stroke;
    context.stroke();
    context.restore();
  }

  return canvas;
}

function drawFilmSprockets(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const count = Math.max(4, Math.round(width / Math.max(18, height * 0.16)));
  const gap = width / count;
  const holeWidth = gap * 0.45;
  const holeHeight = height * 0.075;
  context.fillStyle = "#F4F0E8";
  for (let index = 0; index < count; index += 1) {
    const x = index * gap + (gap - holeWidth) / 2;
    context.fillRect(x, height * 0.045, holeWidth, holeHeight);
    context.fillRect(x, height * 0.88, holeWidth, holeHeight);
  }
}

/**
 * Dashed outline and a plus, so an empty frame reads as "drop an image here".
 * Editor-only — exports render the placeholder fill alone.
 */
function drawEmptyFrameHint(
  context: CanvasRenderingContext2D,
  element: CreativeFrameElement,
  width: number,
  height: number,
  scale: number,
  aperture: ReturnType<typeof frameContentBox>,
) {
  const ink = contrastInk(element.fill);
  context.save();
  context.globalAlpha = 0.5;
  context.strokeStyle = ink;
  context.lineWidth = Math.max(1, 2 * scale);
  context.setLineDash([10 * scale, 8 * scale]);
  if (aperture) {
    context.beginPath();
    context.rect(aperture.x, aperture.y, aperture.width, aperture.height);
  } else {
    traceFrameShape(
      context,
      element.shape,
      width,
      height,
      element.radius * scale,
    );
  }
  context.stroke();

  const arm =
    Math.min(aperture?.width ?? width, aperture?.height ?? height) * 0.09;
  const centerX = aperture ? aperture.x + aperture.width / 2 : width / 2;
  const centerY = aperture ? aperture.y + aperture.height / 2 : height / 2;
  context.setLineDash([]);
  context.lineWidth = Math.max(1, 3 * scale);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(centerX - arm, centerY);
  context.lineTo(centerX + arm, centerY);
  context.moveTo(centerX, centerY - arm);
  context.lineTo(centerX, centerY + arm);
  context.stroke();
  context.restore();
}

/** Readable ink for a placeholder fill, without pulling in a colour library. */
function contrastInk(background: string) {
  const hex = background.trim().replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return "#1D1B20";
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character + character)
          .join("")
      : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  if (Number.isNaN(red + green + blue)) return "#1D1B20";
  const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
  return luminance > 0.6 ? "#1D1B20" : "#F6F1E8";
}

/**
 * Apply colour grading and corner rounding, returning a canvas when anything
 * was done and null when the image should be used untouched.
 *
 * Grading runs before the dither/edge treatments so those sample graded pixels,
 * which is what makes "warm + dither" look like one coherent effect rather than
 * two stacked ones.
 */
function applyImageAdjustments(
  source: CanvasImageSource,
  requestedWidth: number,
  requestedHeight: number,
  adjustments: CreativeImageAdjustments,
  radius: number,
) {
  if (isNeutralAdjustments(adjustments) && radius <= 0) return null;

  const maxDimension = 2_048;
  const scale = Math.min(
    1,
    maxDimension / Math.max(requestedWidth, requestedHeight),
  );
  const width = Math.max(1, Math.round(requestedWidth * scale));
  const height = Math.max(1, Math.round(requestedHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const corner = Math.max(
    0,
    Math.min(radius * scale, Math.min(width, height) / 2),
  );
  if (corner > 0) {
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(0, 0, width, height, corner);
    } else {
      context.moveTo(corner, 0);
      context.arcTo(width, 0, width, height, corner);
      context.arcTo(width, height, 0, height, corner);
      context.arcTo(0, height, 0, 0, corner);
      context.arcTo(0, 0, width, 0, corner);
    }
    context.closePath();
    context.clip();
  }

  // `filter` is the fast path — one composited draw instead of a pixel loop.
  // Older engines silently ignore it, which degrades to an ungraded image
  // rather than a broken one.
  const filter = cssFilterString(adjustments);
  if (filter !== "none") context.filter = filter;
  context.drawImage(source, 0, 0, width, height);
  context.filter = "none";

  const warmth = warmthOverlay(adjustments.warmth);
  if (warmth) {
    context.save();
    context.globalCompositeOperation = "soft-light";
    context.globalAlpha = warmth.alpha;
    context.fillStyle = warmth.color;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (adjustments.vignette > 0) {
    const gradient = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.25,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${adjustments.vignette.toFixed(3)})`);
    context.save();
    context.globalCompositeOperation = "multiply";
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  return canvas;
}

/**
 * Blocky downsampling.
 *
 * Done as a draw-down/draw-up rather than a pixel loop: the browser's own
 * downscale averages a block far faster than JS can, and turning smoothing off
 * on the way back up is what makes the blocks hard-edged instead of a blur.
 *
 * `nearest` skips the averaging on the way down too, so each block takes one
 * sample from the source — the difference between a censor mosaic and a retro
 * sprite.
 */
function applyPixelateEffect(
  source: CanvasImageSource,
  width: number,
  height: number,
  effect: CreativePixelateEffect,
): HTMLCanvasElement {
  const cell = Math.max(2, Math.round(effect.cellSize));
  const columns = Math.max(1, Math.floor(width / cell));
  const rows = Math.max(1, Math.floor(height / cell));

  const small = document.createElement("canvas");
  small.width = columns;
  small.height = rows;
  const smallContext = small.getContext("2d");
  if (!smallContext) throw new Error("Pixelate needs a 2D context.");
  smallContext.imageSmoothingEnabled = effect.sampling === "average";
  smallContext.drawImage(source, 0, 0, columns, rows);

  if (effect.levels > 0) {
    // Quantised at the small size: one pass over `columns * rows` pixels rather
    // than the full image, for an identical result once scaled back up.
    const data = smallContext.getImageData(0, 0, columns, rows);
    const steps = effect.levels;
    const size = 255 / steps;
    for (let index = 0; index < data.data.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data.data[index + channel] ?? 0;
        data.data[index + channel] = Math.min(
          255,
          Math.round(Math.round(value / size) * size),
        );
      }
    }
    smallContext.putImageData(data, 0, 0);
  }

  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(width));
  output.height = Math.max(1, Math.round(height));
  const context = output.getContext("2d");
  if (!context) throw new Error("Pixelate needs a 2D context.");
  // Hard edges on the way back up, whichever sampling was used going down.
  context.imageSmoothingEnabled = false;
  context.drawImage(small, 0, 0, output.width, output.height);
  return output;
}

function applyImageEdgeEffect(
  source: CanvasImageSource,
  requestedWidth: number,
  requestedHeight: number,
  effect: NonNullable<
    Extract<CreativeElement, { type: "image" }>["edgeEffect"]
  >,
) {
  const maxDimension = 1_536;
  const scale = Math.min(
    1,
    maxDimension / Math.max(requestedWidth, requestedHeight),
  );
  const width = Math.max(1, Math.round(requestedWidth * scale));
  const height = Math.max(1, Math.round(requestedHeight * scale));
  const edgeWidth = Math.max(1, Math.round(effect.width * scale));
  const padding = Math.min(
    Math.floor(Math.min(width, height) * 0.22),
    Math.max(edgeWidth + 2, Math.round(edgeWidth * 1.4)),
  );
  const contentWidth = Math.max(1, width - padding * 2);
  const contentHeight = Math.max(1, height - padding * 2);
  const content = document.createElement("canvas");
  content.width = width;
  content.height = height;
  const contentContext = content.getContext("2d");
  if (!contentContext) return content;
  contentContext.drawImage(
    source,
    padding,
    padding,
    contentWidth,
    contentHeight,
  );

  const silhouette = document.createElement("canvas");
  silhouette.width = width;
  silhouette.height = height;
  const silhouetteContext = silhouette.getContext("2d");
  if (!silhouetteContext) return content;
  silhouetteContext.drawImage(content, 0, 0);
  silhouetteContext.globalCompositeOperation = "source-in";
  silhouetteContext.fillStyle = effect.color;
  silhouetteContext.fillRect(0, 0, width, height);
  silhouetteContext.globalCompositeOperation = "source-over";

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) return content;

  const paper = document.createElement("canvas");
  paper.width = width;
  paper.height = height;
  const paperContext = paper.getContext("2d");
  if (!paperContext) return content;

  const samples = 20;
  for (let index = 0; index < samples; index += 1) {
    const angle = (index / samples) * Math.PI * 2;
    paperContext.drawImage(
      silhouette,
      Math.cos(angle) * edgeWidth,
      Math.sin(angle) * edgeWidth,
    );
  }

  if (effect.style === "torn-paper") {
    roughenPaperEdge(
      paperContext,
      width,
      height,
      edgeWidth,
      effect.roughness,
      effect.seed,
    );

    context.save();
    context.globalAlpha = 0.28;
    context.shadowColor = "rgba(24, 20, 28, 0.7)";
    context.shadowBlur = Math.max(2, edgeWidth * 0.7);
    context.shadowOffsetY = Math.max(1, edgeWidth * 0.22);
    context.drawImage(paper, 0, 0);
    context.restore();
  }

  context.drawImage(paper, 0, 0);
  context.drawImage(content, 0, 0);
  return output;
}

function roughenPaperEdge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  edgeWidth: number,
  roughness: number,
  seed: number,
) {
  const pixels = context.getImageData(0, 0, width, height);
  const { data } = pixels;
  const distance = new Uint16Array(width * height);
  const far = 65_535;

  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = data[index * 4 + 3] > 3 ? far : 0;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;

      let nearest = far;
      if (x > 0) nearest = Math.min(nearest, distance[index - 1] + 1);
      if (y > 0) nearest = Math.min(nearest, distance[index - width] + 1);
      distance[index] = nearest;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;

      let nearest = distance[index];
      if (x < width - 1) {
        nearest = Math.min(nearest, distance[index + 1] + 1);
      }
      if (y < height - 1) {
        nearest = Math.min(nearest, distance[index + width] + 1);
      }
      distance[index] = nearest;
    }
  }

  const tearDepth = Math.max(
    2,
    Math.round(edgeWidth * (0.22 + roughness * 0.7)),
  );
  const noiseScale = Math.max(
    2,
    Math.round(edgeWidth * (0.11 + roughness * 0.15)),
  );

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const pixelDistance = distance[index];
      if (pixelDistance === 0 || pixelDistance > tearDepth + 2) continue;

      const boundary = 0.4 + paperNoise(x, y, seed, noiseScale) * tearDepth;
      const alphaIndex = index * 4 + 3;

      if (pixelDistance <= boundary) {
        data[alphaIndex] = 0;
      } else if (pixelDistance < boundary + 1) {
        data[alphaIndex] = Math.round(
          data[alphaIndex] * (pixelDistance - boundary),
        );
      }
    }
  }

  context.putImageData(pixels, 0, 0);
}

function paperNoise(x: number, y: number, seed: number, scale: number) {
  const gridX = Math.floor(x / scale);
  const gridY = Math.floor(y / scale);
  const localX = x / scale - gridX;
  const localY = y / scale - gridY;
  const smoothX = localX * localX * (3 - 2 * localX);
  const smoothY = localY * localY * (3 - 2 * localY);
  const topLeft = paperNoiseHash(gridX, gridY, seed);
  const topRight = paperNoiseHash(gridX + 1, gridY, seed);
  const bottomLeft = paperNoiseHash(gridX, gridY + 1, seed);
  const bottomRight = paperNoiseHash(gridX + 1, gridY + 1, seed);
  const top = topLeft + (topRight - topLeft) * smoothX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * smoothX;

  return top + (bottom - top) * smoothY;
}

function paperNoiseHash(x: number, y: number, seed: number) {
  let hash = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295;
}

/**
 * One fabric Path for a stroke, in the sketch's local coordinates.
 *
 * Exported through `createDrawingObject` and the live preview both, so an
 * in-progress stroke is drawn by exactly the same code as a committed one —
 * the alternative is ink that subtly shifts the moment you lift the pointer.
 */
export function createStrokePath(
  stroke: CreativeDrawingStroke,
  smoothing: number,
) {
  const { path, filled, preset } = strokeGeometry(stroke, smoothing);
  return new Path(path, {
    // Fabric needs an explicit null to mean "no paint"; undefined leaves the
    // previous value in place.
    fill: filled ? stroke.color : null,
    stroke: filled ? null : stroke.color,
    strokeWidth: filled ? 0 : stroke.width,
    strokeLineCap: preset.lineCap,
    strokeLineJoin: preset.lineJoin,
    opacity: stroke.opacity,
    globalCompositeOperation: preset.blend ?? "source-over",
    objectCaching: false,
    selectable: false,
    evented: false,
  });
}

/**
 * A sketch as a group of vector paths. Grouped rather than rasterised so it
 * stays crisp when scaled up, and scaled from the group's *own* measured size
 * so the drawn result cannot drift from fabric's idea of the bounds.
 */
function createDrawingObject(
  element: CreativeDrawingElement,
  shared: Record<string, unknown>,
) {
  const paths = element.strokes.map((stroke) =>
    createStrokePath(stroke, element.smoothing),
  );
  const group = new Group(paths, {
    ...shared,
    subTargetCheck: false,
    interactive: false,
  });
  // Fabric lays a group out from its children on construction, so the box and
  // scale are applied afterwards rather than through the constructor.
  group.set({ left: element.x, top: element.y });
  applyDrawingScale(group, element);
  return group;
}

/**
 * Scale a sketch's group from *our* bounds rather than fabric's measured ones.
 *
 * Both describe the ink's bounding box, but fabric's includes the bulge a
 * smoothed bézier makes beyond its control points. Dividing by fabric's number
 * would make the ratio change slightly every time a stroke is added, rescaling
 * the whole sketch by a fraction of a percent on each one — visible as ink that
 * creeps while you draw. Our bounds are the ones `refitDrawing` holds the scale
 * against, so using them here makes the mapping exactly stable across appends.
 */
function applyDrawingScale(
  object: FabricObject,
  element: CreativeDrawingElement,
) {
  const natural = drawingStrokeBounds(element.strokes);
  object.set({
    scaleX: element.width / natural.width,
    scaleY: element.height / natural.height,
  });
  object.setCoords();
}

/**
 * A name tag: a pill stretched to the element box with the handle centred in it.
 *
 * The box is authoritative rather than the text, so dragging a tag's handles
 * resizes the pill and leaves the type alone — resizing a tag should not silently
 * restyle the creator's handle. The editor keeps the box hugging the text by
 * re-measuring whenever the text or font changes.
 */
async function createTagObject(
  element: CreativeTagElement,
  shared: Record<string, unknown>,
) {
  const fontFamily = resolveCanvasFontFamily(element.fontFamily);
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await document.fonts.load(
        `${element.fontWeight} ${element.fontSize}px ${fontFamily}`,
      );
    } catch {
      // Fabric falls back to a system face.
    }
  }

  const objects: FabricObject[] = [];
  if (element.style.background) {
    // A radius past half the height would distort; clamped, so the stored 999
    // simply reads as "full pill" at any height.
    const radius = Math.min(element.style.radius, element.height / 2);
    objects.push(
      new Rect({
        left: 0,
        top: 0,
        width: element.width,
        height: element.height,
        rx: radius,
        ry: radius,
        fill: element.style.background,
        objectCaching: false,
        selectable: false,
        evented: false,
      }),
    );
  }

  // A location pill reads as a location because of the pin; the handle's tick is
  // the same idea. Drawn as vector paths so they scale with the tag and need no
  // asset to load.
  const glyphSize = element.fontSize * 0.78;
  const hasPin = element.variant === "location";
  const hasBadge = element.variant === "handle" && element.badge;
  const textShift = hasPin
    ? glyphSize * 0.75
    : hasBadge
      ? -glyphSize * 0.75
      : 0;

  if (hasPin) {
    const pin = new Path(PIN_PATH, {
      fill: element.fill,
      objectCaching: false,
      selectable: false,
      evented: false,
    });
    const scale = glyphSize / (pin.height || 1);
    pin.set({
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      left: element.style.paddingX + (pin.width * scale) / 2,
      top: element.height / 2,
    });
    objects.push(pin);
  }

  objects.push(
    new FabricText(transformTextCase(element.text, element.textTransform), {
      left: element.width / 2 + textShift,
      top: element.height / 2,
      originX: "center",
      originY: "center",
      fontFamily,
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      fill: element.fill,
      charSpacing: Math.round(
        (element.letterSpacing / Math.max(1, element.fontSize)) * 1000,
      ),
      objectCaching: false,
      selectable: false,
      evented: false,
    }),
  );

  if (hasBadge) {
    const radius = glyphSize / 2;
    const centre = element.width - element.style.paddingX - radius;
    objects.push(
      new Circle({
        radius,
        fill: element.fill,
        originX: "center",
        originY: "center",
        left: centre,
        top: element.height / 2,
        objectCaching: false,
        selectable: false,
        evented: false,
      }),
    );
    const tick = new Path(TICK_PATH, {
      // Punched out of the disc, so it reads on any tag colour.
      fill: element.style.background ?? "#FFFFFF",
      objectCaching: false,
      selectable: false,
      evented: false,
    });
    const tickScale = (radius * 1.05) / (tick.height || 1);
    tick.set({
      scaleX: tickScale,
      scaleY: tickScale,
      originX: "center",
      originY: "center",
      left: centre,
      top: element.height / 2,
    });
    objects.push(tick);
  }

  const group = new Group(objects, {
    ...shared,
    subTargetCheck: false,
    interactive: false,
  });
  group.set({ left: element.x, top: element.y });
  group.setCoords();
  return group;
}

/** Map pin, drawn once at a nominal size and scaled to the tag's type size. */
const PIN_PATH =
  "M 8 0 C 3.6 0 0 3.6 0 8 c 0 5.6 8 14 8 14 s 8 -8.4 8 -14 C 16 3.6 12.4 0 8 0 z m 0 11 a 3 3 0 1 1 0 -6 a 3 3 0 0 1 0 6 z";
/** Verified tick, punched out of a filled disc. */
const TICK_PATH = "M 0 6 L 4.2 10.2 L 12 2.4 L 10 0.4 L 4.2 6.2 L 2 4 z";

function createPagerObject(
  element: Extract<CreativeElement, { type: "widget" }>,
  context: { pageIndex: number; pageCount: number },
  shared: Record<string, unknown>,
) {
  const { props } = element;
  const count =
    props.countMode === "auto"
      ? Math.max(2, Math.min(20, context.pageCount))
      : props.count;
  const requestedIndex =
    props.activeMode === "auto" ? context.pageIndex : props.activeIndex;
  const activeIndex = Math.max(0, Math.min(count - 1, requestedIndex));
  const objects: FabricObject[] = [];
  let cursor = 0;

  for (let index = 0; index < count; index += 1) {
    const active = index === activeIndex;
    if (props.variant === "numbers") {
      const width = props.size * 1.65;
      objects.push(
        new FabricText(String(index + 1), {
          left: cursor + width / 2,
          top: props.size / 2,
          originX: "center",
          originY: "center",
          fontFamily: "Arial",
          fontSize: props.size,
          fontWeight: active ? "700" : "500",
          fill: active ? props.activeColor : props.inactiveColor,
        }),
      );
      if (active) {
        objects.push(
          new Rect({
            left: cursor,
            top: props.size + props.size * 0.35,
            width,
            height: Math.max(3, props.size * 0.16),
            rx: props.size,
            ry: props.size,
            fill: props.activeColor,
          }),
        );
      }
      cursor += width + props.gap;
      continue;
    }

    if (props.variant === "bars") {
      const width = props.size * 2.5;
      const height = Math.max(4, props.size * 0.45);
      objects.push(
        new Rect({
          left: cursor,
          top: 0,
          width,
          height,
          rx: height / 2,
          ry: height / 2,
          fill: active ? props.activeColor : props.inactiveColor,
        }),
      );
      cursor += width + props.gap;
      continue;
    }

    if (props.variant === "stretch" && active) {
      const width = props.size * 2.4;
      objects.push(
        new Rect({
          left: cursor,
          top: 0,
          width,
          height: props.size,
          rx: props.size / 2,
          ry: props.size / 2,
          fill: props.activeColor,
        }),
      );
      cursor += width + props.gap;
      continue;
    }

    objects.push(
      new Circle({
        left: cursor,
        top: 0,
        radius: props.size / 2,
        fill: active ? props.activeColor : props.inactiveColor,
      }),
    );
    cursor += props.size + props.gap;
  }

  const pager = new Group(objects, shared);
  const naturalWidth = pager.width || 1;
  const naturalHeight = pager.height || 1;
  pager.set({
    scaleX: element.width / naturalWidth,
    scaleY: element.height / naturalHeight,
  });
  return pager;
}

async function createBackgroundEffectObject(
  effect: CreativeBackgroundEffect | undefined,
  width: number,
  height: number,
) {
  if (!effect || effect.type === "none" || typeof document === "undefined") {
    return null;
  }

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d");
  if (!context) return null;

  if (effect.type === "cutting-mat") {
    // The mat paints its own surface colour edge to edge, so it is opaque by
    // nature — unlike the pattern effects, which sit over the page background.
    const mat = { ...DEFAULT_CUTTING_MAT, ...(effect.mat ?? {}) };
    await ensureCatalogueFont(mat.fontFamily);
    drawCuttingMat(context, width, height, mat);
  } else if (effect.type === "texture") {
    const image = await loadTextureImage(TEXTURE_URLS[effect.texture]).catch(
      () => null,
    );
    if (!image) return null;
    drawTextureEffect(context, image, effect, width, height);
  } else {
    drawBackgroundEffect(context, effect, width, height);
  }
  return new FabricImage(source, {
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    selectable: false,
    evented: false,
    excludeFromExport: false,
  });
}

/**
 * Flatten each real page's colour and effect into one opaque spread layer.
 *
 * Fabric rectangles used as per-page fills can inherit stale scaling while
 * the interactive canvas changes between one and several pages. A single
 * bitmap has the spread's exact dimensions, so no page can expose the editor
 * surface beneath it and patterned pages stay aligned to their own bounds.
 */
async function createSpreadBackgroundObject(
  pages: CreativePage[],
  pageWidth: number,
  height: number,
) {
  if (typeof document === "undefined") return null;
  const source = document.createElement("canvas");
  source.width = pageWidth * pages.length;
  source.height = height;
  const context = source.getContext("2d");
  if (!context) return null;

  for (const [index, page] of pages.entries()) {
    const left = index * pageWidth;
    context.fillStyle = page.background;
    context.fillRect(left, 0, pageWidth, height);
    const effect = await createBackgroundEffectObject(
      page.backgroundEffect,
      pageWidth,
      height,
    );
    if (effect) {
      context.drawImage(effect.getElement(), left, 0, pageWidth, height);
    }
  }

  return new FabricImage(source, {
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    selectable: false,
    evented: false,
    excludeFromExport: false,
  });
}

function drawTextureEffect(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  effect: CreativeBackgroundEffect,
  width: number,
  height: number,
) {
  const scale = Math.max(0.25, Math.min(2.4, effect.size / 100));
  const tileWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const tileHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  context.save();
  context.globalAlpha = effect.opacity;
  for (let y = 0; y < height; y += tileHeight) {
    for (let x = 0; x < width; x += tileWidth) {
      context.drawImage(image, x, y, tileWidth, tileHeight);
    }
  }
  context.restore();
}

function loadTextureImage(url: string) {
  const cached = textureImageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Texture ${url} could not load.`));
    image.src = url;
  });
  textureImageCache.set(url, promise);
  return promise;
}

function drawBackgroundEffect(
  context: CanvasRenderingContext2D,
  effect: CreativeBackgroundEffect,
  width: number,
  height: number,
) {
  const step = safePatternStep(effect.size + effect.gap, width, height);
  const random = seededRandom(effect.seed);
  context.save();
  context.globalAlpha = effect.opacity;
  context.strokeStyle = effect.color;
  context.fillStyle = effect.color;
  context.lineWidth = Math.max(1, effect.size / 24);

  if (effect.type === "grid") {
    for (let x = 0; x <= width; x += step) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  } else if (effect.type === "dots") {
    const radius = Math.max(1.5, effect.size * 0.1);
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (effect.type === "flicker") {
    const squareSize = Math.max(2, Math.min(effect.size, step));
    for (let y = effect.gap; y < height; y += step) {
      for (let x = effect.gap; x < width; x += step) {
        const chance = random();
        if (chance > 0.12 + effect.intensity * 0.78) continue;
        context.globalAlpha =
          effect.opacity * (0.15 + random() * effect.intensity * 0.85);
        context.fillStyle =
          random() > 0.82 ? effect.secondaryColor : effect.color;
        context.fillRect(x, y, squareSize, squareSize);
      }
    }
  } else if (effect.type === "diagonal") {
    const diagonalStep = Math.max(10, step);
    for (
      let offset = -height;
      offset < width + height;
      offset += diagonalStep
    ) {
      context.beginPath();
      context.moveTo(offset, height);
      context.lineTo(offset + height, 0);
      context.stroke();
    }
  } else if (effect.type === "checker") {
    const cellSize = Math.max(8, step);
    for (let row = 0, y = 0; y < height; row += 1, y += cellSize) {
      for (let column = 0, x = 0; x < width; column += 1, x += cellSize) {
        const primary = (row + column) % 2 === 0;
        context.globalAlpha =
          effect.opacity * (primary ? 1 : Math.max(0.1, effect.intensity));
        context.fillStyle = primary ? effect.color : effect.secondaryColor;
        context.fillRect(x, y, cellSize, cellSize);
      }
    }
  } else if (effect.type === "rings") {
    const radiusStep = Math.max(10, step);
    const maxRadius = Math.hypot(width, height) / 2;
    for (let radius = radiusStep; radius < maxRadius; radius += radiusStep) {
      context.beginPath();
      context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (effect.type === "shape-grid") {
    const shapeSize = Math.max(4, Math.min(effect.size, step));
    for (let row = 0, y = step / 2; y < height; row += 1, y += step) {
      for (let column = 0, x = step / 2; x < width; column += 1, x += step) {
        drawPatternShape(
          context,
          effect.shape,
          x,
          y,
          shapeSize,
          (row + column) % 2 === 0,
        );
        if (random() < effect.intensity * 0.16) {
          context.fillStyle = effect.secondaryColor;
          context.globalAlpha = effect.opacity * 0.8;
          context.fill();
          context.globalAlpha = effect.opacity;
        }
        context.strokeStyle = effect.color;
        context.stroke();
      }
    }
  }

  context.restore();
}

function drawPatternShape(
  context: CanvasRenderingContext2D,
  shape: CreativeBackgroundEffect["shape"],
  x: number,
  y: number,
  size: number,
  flipped: boolean,
) {
  context.beginPath();
  if (shape === "circle") {
    context.arc(x, y, size / 2, 0, Math.PI * 2);
  } else if (shape === "hexagon") {
    for (let side = 0; side < 6; side += 1) {
      const angle = (Math.PI / 3) * side;
      const pointX = x + (size / 2) * Math.cos(angle);
      const pointY = y + (size / 2) * Math.sin(angle);
      if (side === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
  } else if (shape === "triangle") {
    const direction = flipped ? -1 : 1;
    context.moveTo(x, y - (direction * size) / 2);
    context.lineTo(x + size / 2, y + (direction * size) / 2);
    context.lineTo(x - size / 2, y + (direction * size) / 2);
    context.closePath();
  } else {
    context.rect(x - size / 2, y - size / 2, size, size);
  }
}

function safePatternStep(step: number, width: number, height: number) {
  let safeStep = Math.max(8, step);
  while (Math.ceil(width / safeStep) * Math.ceil(height / safeStep) > 8_000) {
    safeStep *= 1.2;
  }
  return safeStep;
}

function seededRandom(seed: number) {
  let value = seed | 0;
  return () => {
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

async function fetchVectorSvg(assetUrl: string | undefined, name: string) {
  if (!assetUrl) throw new Error(`${name} is missing its vector source.`);
  const cached = vectorSourceCache.get(assetUrl);
  if (cached) return cached;
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`${name} could not be loaded (${response.status}).`);
  }
  const svg = await response.text();
  if (
    svg.length > 250_000 ||
    !/<svg\b/i.test(svg) ||
    /<(?:script|foreignObject|iframe|image)\b/i.test(svg)
  ) {
    throw new Error(`${name} returned an invalid vector.`);
  }
  vectorSourceCache.set(assetUrl, svg);
  return svg;
}

/**
 * The Studio's accent, resolved to a real colour.
 *
 * Selection handles and snap guides are painted onto a canvas, which cannot read
 * a CSS variable — so the token is resolved here rather than duplicating the hex.
 * The fallback matches `--studio-accent` for the server render, where there is no
 * computed style to read.
 */
function studioAccent() {
  if (typeof document === "undefined") return "#EF7B16";
  return (
    getComputedStyle(document.body)
      .getPropertyValue("--studio-accent")
      .trim() || "#EF7B16"
  );
}

function resolveCanvasFontFamily(fontFamily: string) {
  if (typeof document === "undefined") return fontFamily;
  const variable =
    fontFamily === "Outfit"
      ? "--font-outfit"
      : fontFamily === "Geist Sans"
        ? "--font-geist-sans"
        : fontFamily === "Geist Mono"
          ? "--font-geist-mono"
          : undefined;
  if (!variable) return fontFamily;
  return (
    getComputedStyle(document.body).getPropertyValue(variable).trim() ||
    fontFamily
  );
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not export this slide."));
    }, "image/png");
  });
}
