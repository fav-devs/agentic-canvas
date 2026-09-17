/**
 * The Studio document format and its command reducer.
 *
 * Shared because three places need one definition of a design: the editor that
 * produces them, the agent tools that author and edit them, and anything
 * server-side that reasons about one.
 *
 * Deliberately a single file with no relative imports. agents-service ships
 * transpile-only (esbuild, bundle: false), so this module is loaded by Node ESM
 * at runtime — where an extensionless relative import cannot resolve, and a
 * ".js" specifier has no ".js" file behind it. No relative imports, no
 * resolution to get wrong in any of the three toolchains that read it.
 */

import { z } from "zod";

export const creativeCanvasSchema = z.object({
  width: z.number().int().min(320).max(4096),
  height: z.number().int().min(320).max(4096),
  colorSpace: z.literal("srgb"),
});

const creativeElementBase = {
  id: z.string().min(1),
  /**
   * Copies with the same sync id are one logical element shown on several
   * pages. Every copy keeps a fresh element id for rendering and selection,
   * while edits to one are fanned out to the rest.
   */
  syncId: z.string().min(1).max(120).optional(),
  /** Members with the same group id are selected and transformed as one unit. */
  groupId: z.string().min(1).nullable().optional(),
  /** Repeated on members so flat groups can be named without becoming nodes. */
  groupName: z.string().min(1).max(120).nullable().optional(),
  /**
   * Copies with the same seamless id are one visual layer crossing carousel seams.
   * Each page stores its own clipped projection so ordinary per-page export
   * remains exact and needs no special panorama renderer.
   */
  seamlessId: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(8192),
  height: z.number().positive().max(8192),
  rotation: z.number().finite().min(-3600).max(3600),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  locked: z.boolean(),
};

/** Drop shadow behind an element. */
export const creativeShadowSchema = z.object({
  enabled: z.boolean(),
  color: z.string().min(1).max(100),
  blur: z.number().min(0).max(120),
  offsetX: z.number().min(-200).max(200),
  offsetY: z.number().min(-200).max(200),
});

/** Stroke drawn behind the glyph fill (paintFirst: stroke). */
export const creativeTextShadowSchema = creativeShadowSchema;

export const creativeTextOutlineSchema = z.object({
  enabled: z.boolean(),
  color: z.string().min(1).max(100),
  width: z.number().min(0).max(40),
});

/** Marker-pen fill drawn behind each text line. */
export const creativeTextHighlightSchema = z.object({
  enabled: z.boolean(),
  color: z.string().min(1).max(100),
});

export const creativeTextElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("text"),
  text: z.string().max(10_000),
  /**
   * Point-text behavior: the box follows the longest line until the user
   * explicitly resizes it. Defaults off so existing authored layouts retain
   * their intentional wrapping widths.
   */
  autoWidth: z.boolean().default(false),
  fontFamily: z.string().min(1).max(120),
  fontSize: z.number().positive().max(512),
  fontWeight: z.enum(["400", "500", "600", "700", "800"]),
  fill: z.string().min(1).max(100),
  textAlign: z.enum(["left", "center", "right"]),
  // Typography refinements. Defaulted rather than required so documents saved
  // before these existed still parse.
  lineHeight: z.number().min(0.5).max(3).default(1.16),
  /** Tracking in px at the element's font size; converted to fabric charSpacing. */
  letterSpacing: z.number().min(-40).max(200).default(0),
  textTransform: z
    .enum(["none", "uppercase", "lowercase", "capitalize"])
    .default("none"),
  shadow: creativeTextShadowSchema.optional(),
  outline: creativeTextOutlineSchema.optional(),
  highlight: creativeTextHighlightSchema.optional(),
});

export const creativeShapeElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("shape"),
  shape: z.enum([
    "rectangle",
    "ellipse",
    "triangle",
    "diamond",
    "pentagon",
    "hexagon",
    "octagon",
    "star",
    "heart",
    "cross",
    "arrow-right",
    "speech-bubble",
    "cloud",
    "burst",
  ]),
  fill: z.string().min(1).max(100),
  stroke: z.string().min(1).max(100),
  strokeWidth: z.number().min(0).max(128),
  radius: z.number().min(0).max(4096),
});

export const creativeDitherEffectSchema = z.object({
  type: z.literal("dither"),
  enabled: z.boolean(),
  mode: z.enum(["monochrome", "color"]),
  cellSize: z.number().int().min(1).max(64),
  strength: z.number().min(0).max(1),
  contrast: z.number().min(0.5).max(3),
  brightness: z.number().min(0.25).max(2),
});

/**
 * Blocky downsampling.
 *
 * `sampling` is the difference between the two looks people mean by
 * "pixelated": averaging a block gives the soft mosaic used to censor a face,
 * while taking a single sample from it gives the hard-edged retro look. Same
 * cell size, very different result, so it is a choice rather than a constant.
 */
export const creativePixelateEffectSchema = z.object({
  type: z.literal("pixelate"),
  enabled: z.boolean(),
  /** Block size in canvas pixels. */
  cellSize: z.number().int().min(2).max(160).default(16),
  sampling: z.enum(["average", "nearest"]).default("average"),
  /**
   * Quantise each channel to this many steps, for an indexed-colour look.
   * 0 leaves colour alone — the common case, and why it isn't a range floor.
   */
  levels: z.number().int().min(0).max(64).default(0),
});

/**
 * The image as text.
 *
 * `charset` is ordered darkest-to-lightest ink coverage, so picking a glyph is
 * just indexing by the cell's brightness. `color` decides whether the glyphs are
 * one ink (terminal) or sampled from the photo (coloured ASCII) — the same
 * charset reads completely differently between the two.
 */
export const creativeAsciiEffectSchema = z.object({
  type: z.literal("ascii"),
  enabled: z.boolean(),
  /** Cell size in canvas pixels; also the glyph size. */
  cellSize: z.number().int().min(4).max(64).default(14),
  charset: z
    .enum(["classic", "blocks", "binary", "dots", "braille"])
    .default("classic"),
  color: z.enum(["ink", "source"]).default("ink"),
  ink: z.string().min(1).max(100).default("#7CFFB2"),
  background: z.string().min(1).max(100).default("#04070D"),
  /** Swap which end of the charset the bright cells use. */
  invert: z.boolean().default(false),
});

/** One effect at a time: they are different ways of re-rendering the pixels. */
export const creativeImageEffectSchema = z.discriminatedUnion("type", [
  creativeDitherEffectSchema,
  creativePixelateEffectSchema,
  creativeAsciiEffectSchema,
]);

export const creativeImageEdgeEffectSchema = z.object({
  enabled: z.boolean(),
  style: z.enum(["outline", "torn-paper"]),
  color: z.string().min(1).max(100),
  width: z.number().int().min(1).max(128),
  roughness: z.number().min(0).max(1),
  seed: z.number().int().min(0).max(2_147_483_647),
});

/** Colour grading applied to an image before any dither/edge treatment. */
export const creativeImageAdjustmentsSchema = z.object({
  brightness: z.number().min(0).max(2).default(1),
  contrast: z.number().min(0).max(2).default(1),
  saturation: z.number().min(0).max(2).default(1),
  warmth: z.number().min(-1).max(1).default(0),
  blur: z.number().min(0).max(40).default(0),
  vignette: z.number().min(0).max(1).default(0),
});

export const creativeMediaAssetSchema = z.object({
  mediaId: z.string().min(1),
  url: z.string().min(1),
  backendUrl: z.string().min(1).optional(),
  filename: z.string().min(1).max(512).optional(),
});

/**
 * Which part of a picture shows through its window.
 *
 * Same model the frame element uses — zoom over the cover/contain base, pan
 * normalised to -1..1 — so there is one crop concept in the document rather than
 * two that drift. Normalised pan is what makes resizing the window safe: the
 * offset means "this fraction of the available slack", so it stays meaningful at
 * any window size.
 */
export const creativeImageCropSchema = z.object({
  zoom: z.number().min(0.1).max(6).default(1),
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
});

export const creativeImageElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("image"),
  asset: creativeMediaAssetSchema,
  fit: z.enum(["cover", "contain"]),
  // Defaulted rather than required so images saved before cropping still parse.
  crop: creativeImageCropSchema.default(() =>
    creativeImageCropSchema.parse({}),
  ),
  effect: creativeImageEffectSchema.optional(),
  edgeEffect: creativeImageEdgeEffectSchema.optional(),
  // Defaulted rather than required so images saved before grading still parse.
  adjustments: creativeImageAdjustmentsSchema.default(() =>
    creativeImageAdjustmentsSchema.parse({}),
  ),
  radius: z.number().min(0).max(2048).default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  shadow: creativeShadowSchema.optional(),
});

/**
 * A shaped placeholder that holds an image. Empty until one is dropped in, at
 * which point the image is clipped to the frame's silhouette; the crop lives on
 * the frame (zoom + normalised pan) so resizing the frame never breaks it.
 */
export const creativeFrameElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("frame"),
  shape: z.enum([
    "rectangle",
    "rounded",
    "circle",
    "arch",
    "triangle",
    "diamond",
    "hexagon",
    "star",
    "heart",
    "blob",
    "postage",
    "postage-circle",
    "squircle",
    "pill",
    "pentagon",
    "octagon",
    "burst",
    "cloud",
    "shield",
    "ticket",
    "polaroid",
    "polaroid-landscape",
    "photo-border",
    "filmstrip",
  ]),
  /** Corner radius for the `rounded` shape only. */
  radius: z.number().min(0).max(512).default(48),
  asset: creativeMediaAssetSchema.optional(),
  fit: z.enum(["cover", "contain"]).default("cover"),
  /** Non-destructive image styling retained when an image enters the frame. */
  adjustments: creativeImageAdjustmentsSchema.optional(),
  effect: creativeImageEffectSchema.optional(),
  edgeEffect: creativeImageEdgeEffectSchema.optional(),
  zoom: z.number().min(0.1).max(6).default(1),
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
  /** Placeholder colour shown while the frame is empty. */
  fill: z.string().min(1).max(100).default("#DED7CC"),
  stroke: z.string().min(1).max(100).default("transparent"),
  strokeWidth: z.number().min(0).max(64).default(0),
});

export const creativeVectorElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("vector"),
  /**
   * Inline SVG, when we have it. An empty string is normalised to absent
   * rather than rejected: the renderer falls back to fetching `assetUrl`, so
   * "no inline copy" is a perfectly renderable state — and rejecting it made a
   * whole document unparseable, which stopped the editor opening it at all.
   */
  svg: z
    .string()
    .max(250_000)
    .optional()
    .transform((value) => (value && value.trim() ? value : undefined)),
  assetUrl: z.string().min(1).max(2048).optional(),
  fill: z.string().min(1).max(100),
  recolorable: z.boolean(),
  source: z.object({
    provider: z.enum(["iconify", "open-doodles", "agentic-canvas", "svgl"]),
    assetId: z.string().min(1).max(200),
    license: z.string().min(1).max(80),
    author: z.string().min(1).max(200).optional(),
    sourceUrl: z.string().url().optional(),
  }),
});

/** The brush a stroke was laid down with; drives how it is drawn. */
export const creativeBrushSchema = z.enum([
  "pen",
  "marker",
  "pencil",
  "highlighter",
  "paint",
]);

/**
 * One freehand mark. Self-describing — brush, colour and width ride on the
 * stroke rather than the element, so a sketch can mix pens without being split
 * into a separate layer per colour.
 */
export const creativeDrawingStrokeSchema = z.object({
  brush: creativeBrushSchema,
  color: z.string().min(1).max(100),
  /** Width in the element's local units, not document pixels. */
  width: z.number().positive().max(400),
  opacity: z.number().min(0).max(1),
  /**
   * Flat `[x, y, x, y, …]` in the element's local space. Flat because a stroke
   * is hundreds of points and `{x, y}` objects triple the JSON we autosave.
   * A two-entry array is a legitimate stroke: a single dot.
   */
  points: z
    .array(z.number().finite())
    .min(2)
    .max(8000)
    .refine((points) => points.length % 2 === 0, {
      message: "points must hold an even number of coordinates",
    }),
});

/**
 * A freehand sketch: many strokes under one layer.
 *
 * Points are local, and the natural bounds are *derived* from them rather than
 * stored, so the element box is purely a display transform — the same way a
 * vector maps its natural SVG size onto width/height. That is what makes
 * corner-drag resizing and `document.resize` work on a drawing without
 * rewriting a single point.
 */
export const creativeDrawingElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("drawing"),
  strokes: z.array(creativeDrawingStrokeSchema).min(1).max(800),
  /** 0 draws the raw polyline, 1 fully rounds the corners. */
  smoothing: z.number().min(0).max(1).default(0.55),
});

export const creativePagerPropsSchema = z.object({
  variant: z.enum(["dots", "stretch", "bars", "numbers"]),
  countMode: z.enum(["auto", "fixed"]),
  count: z.number().int().min(2).max(20),
  activeMode: z.enum(["auto", "fixed"]),
  activeIndex: z.number().int().min(0).max(19),
  activeColor: z.string().min(1).max(100),
  inactiveColor: z.string().min(1).max(100),
  size: z.number().min(4).max(80),
  gap: z.number().min(0).max(100),
});

export const creativeWidgetElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("widget"),
  widget: z.literal("pager"),
  syncId: z.string().min(1).max(120),
  props: creativePagerPropsSchema,
});

/** The pill behind a name tag. No background is a valid look: bare text. */
export const creativeTagStyleSchema = z.object({
  background: z.string().min(1).max(100).optional(),
  paddingX: z.number().min(0).max(200).default(24),
  paddingY: z.number().min(0).max(200).default(12),
  /**
   * The renderer clamps this to half the tag's height, so the default is simply
   * "as round as it can be" — a full pill — rather than a real measurement.
   */
  radius: z.number().min(0).max(999).default(999),
});

/**
 * A patch to a tag's style.
 *
 * Deliberately *not* `creativeTagStyleSchema.partial()`: that schema carries
 * defaults, so parsing `{ background }` through it fills in the padding and
 * radius defaults and silently resets values the caller never mentioned. Absent
 * means "leave alone"; an explicit null on the background removes the pill.
 */
export const creativeTagStylePatchSchema = z.object({
  background: z.string().min(1).max(100).nullable().optional(),
  paddingX: z.number().min(0).max(200).optional(),
  paddingY: z.number().min(0).max(200).optional(),
  radius: z.number().min(0).max(999).optional(),
});

/**
 * A name tag: the creator's handle, shown on every slide.
 *
 * Like the pager it is a *smart* element — one thing the reader sees on each
 * page, stored as a copy per page sharing a `syncId`. Editing the text, the
 * font, or the position on any slide changes all of them, because as far as the
 * person using it is concerned there is only one tag.
 */
export const creativeTagElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("tag"),
  /** Shared across pages: what makes the copies one element. */
  syncId: z.string().min(1).max(120),
  /**
   * Which kind of tag this is. All three are the same primitive — a short piece
   * of text in a pill, placed once and shown on every slide — so they are one
   * element with a variant rather than three renderers to keep in step.
   */
  variant: z.enum(["handle", "location", "plate"]).default("handle"),
  /** The verified tick. Only drawn on the handle variant. */
  badge: z.boolean().default(false),
  text: z.string().min(1).max(200),
  fontFamily: z.string().min(1).max(120),
  fontSize: z.number().positive().max(256),
  fontWeight: z.enum(["400", "500", "600", "700", "800"]),
  fill: z.string().min(1).max(100),
  letterSpacing: z.number().min(-40).max(200).default(0),
  textTransform: z
    .enum(["none", "uppercase", "lowercase", "capitalize"])
    .default("none"),
  style: creativeTagStyleSchema,
});

export const creativeBackgroundEffectSchema = z.object({
  type: z.enum([
    "none",
    "grid",
    "dots",
    "flicker",
    "diagonal",
    "checker",
    "rings",
    "shape-grid",
    "texture",
    "cutting-mat",
  ]),
  color: z.string().min(1).max(100),
  secondaryColor: z.string().min(1).max(100),
  size: z.number().min(4).max(240),
  gap: z.number().min(0).max(120),
  opacity: z.number().min(0).max(1),
  intensity: z.number().min(0).max(1),
  seed: z.number().int(),
  shape: z.enum(["square", "hexagon", "circle", "triangle"]),
  direction: z.enum(["diagonal", "up", "right", "down", "left"]),
  speed: z.number().min(0.1).max(5),
  /**
   * Cutting-mat settings. Nested rather than flattened into the shared fields
   * because none of them mean anything to the other effects.
   */
  mat: z
    .object({
      unit: z.enum(["cm", "in"]).default("cm"),
      columns: z.number().int().min(4).max(160).default(50),
      background: z.string().min(1).max(100).default("#00332A"),
      line: z.string().min(1).max(100).default("#E5E55A"),
      showGrid: z.boolean().default(true),
      gridOpacity: z.number().min(0).max(1).default(1),
      showEdgeTicks: z.boolean().default(true),
      showLabels: z.boolean().default(true),
      fontFamily: z.string().min(1).max(120).default("Geist Mono"),
      showRadii: z.boolean().default(true),
      radii: z.array(z.number().min(1).max(200)).max(6).default([10, 20, 30]),
      showRadiusTicks: z.boolean().default(true),
      tickSpacing: z.number().min(1).max(45).default(5),
      showAngles: z.boolean().default(true),
    })
    .optional(),
  texture: z
    .enum([
      "fabric-of-squares",
      "grid-noise",
      "inflicted",
      "debut-light",
      "groovepaper",
    ])
    .default("fabric-of-squares"),
});

/**
 * A video clip on the canvas (green screen meme, background video, etc.).
 * Renders as a looping `<video>` element on the fabric canvas. The keyed variant
 * (transparent WebM) composites over whatever is behind it.
 */
export const creativeVideoElementSchema = z.object({
  ...creativeElementBase,
  type: z.literal("video"),
  /** The video file URL (mp4 or transparent WebM). */
  src: z.string().min(1),
  /** Optional: the original (non-keyed) URL for preview thumbnails. */
  originalSrc: z.string().optional(),
  /** Whether the green has been removed (transparent WebM). */
  chromaKeyed: z.boolean().default(false),
  /** Loop playback on the canvas. */
  loop: z.boolean().default(true),
  fit: z.enum(["cover", "contain"]).default("contain"),
  radius: z.number().min(0).max(2048).default(0),
  /** Muted on the canvas AND omitted from the exported video's soundtrack. */
  muted: z.boolean().optional(),
  /** Meme metadata from cortex (for attribution + search). */
  memeCaption: z.string().optional(),
  memeAudioId: z.string().optional(),
});

export const creativeElementSchema = z.discriminatedUnion("type", [
  creativeTextElementSchema,
  creativeShapeElementSchema,
  creativeImageElementSchema,
  creativeFrameElementSchema,
  creativeVectorElementSchema,
  creativeWidgetElementSchema,
  creativeDrawingElementSchema,
  creativeTagElementSchema,
  creativeVideoElementSchema,
]);

export const creativePageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  background: z.string().min(1).max(100),
  backgroundEffect: creativeBackgroundEffectSchema.optional(),
  // Hidden pages stay in the document (editable, reorderable) but are excluded
  // from exports, downloads, the public share view and the compose handoff.
  hidden: z.boolean().optional(),
  // Video mode: how long this scene is held in the exported video, in ms.
  // Ignored for image/carousel exports. Defaults applied at export time.
  durationMs: z.number().int().min(200).max(60000).optional(),
  elements: z.array(creativeElementSchema).max(100),
});

export const creativeFontSchema = z.object({
  id: z.string().min(1),
  family: z.string().min(1).max(120),
  url: z.string().min(1).max(2048),
  backendUrl: z.string().min(1).max(2048).optional(),
  filename: z.string().min(1).max(512),
  mimeType: z.enum(["font/woff", "font/woff2", "font/ttf", "font/otf"]),
});

/** A library track mixed across the full length of a video export. */
export const creativeSoundtrackSchema = z.object({
  audioId: z.string().min(1),
  /** Kept in the document so the editor can label a saved track immediately. */
  title: z.string().max(300).nullable().optional(),
  artist: z.string().max(300).nullable().optional(),
  volume: z.number().min(0).max(1).default(0.6),
});

export const creativeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  projectId: z.string().min(1),
  profileId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  kind: z.enum(["carousel", "image", "video"]),
  title: z.string().min(1).max(200),
  canvas: creativeCanvasSchema,
  pages: z.array(creativePageSchema).min(1).max(20),
  fonts: z.array(creativeFontSchema).max(30).default([]),
  /** Optional music bed for video projects. It supersedes scene clip audio. */
  soundtrack: creativeSoundtrackSchema.optional(),
  metadata: z.object({
    createdBy: z.enum(["user", "agent", "workflow"]),
    seed: z.number().int().optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreativeCanvas = z.infer<typeof creativeCanvasSchema>;
export type CreativeTextElement = z.infer<typeof creativeTextElementSchema>;
export type CreativeTextShadow = z.infer<typeof creativeTextShadowSchema>;
export type CreativeTextOutline = z.infer<typeof creativeTextOutlineSchema>;
export type CreativeTextHighlight = z.infer<typeof creativeTextHighlightSchema>;
export type CreativeShapeElement = z.infer<typeof creativeShapeElementSchema>;
export type CreativeImageElement = z.infer<typeof creativeImageElementSchema>;
export type CreativeImageEffect = z.infer<typeof creativeImageEffectSchema>;
export type CreativeImageCrop = z.infer<typeof creativeImageCropSchema>;
export type CreativeDitherEffect = z.infer<typeof creativeDitherEffectSchema>;
export type CreativePixelateEffect = z.infer<
  typeof creativePixelateEffectSchema
>;
export type CreativeAsciiEffect = z.infer<typeof creativeAsciiEffectSchema>;
export type CreativeShadow = z.infer<typeof creativeShadowSchema>;
export type CreativeImageAdjustments = z.infer<
  typeof creativeImageAdjustmentsSchema
>;
export type CreativeImageEdgeEffect = z.infer<
  typeof creativeImageEdgeEffectSchema
>;
export type CreativeMediaAsset = z.infer<typeof creativeMediaAssetSchema>;
export type CreativeFrameElement = z.infer<typeof creativeFrameElementSchema>;
export type CreativeVectorElement = z.infer<typeof creativeVectorElementSchema>;
export type CreativePagerProps = z.infer<typeof creativePagerPropsSchema>;
export type CreativeWidgetElement = z.infer<typeof creativeWidgetElementSchema>;
export type CreativeTagElement = z.infer<typeof creativeTagElementSchema>;
export type CreativeVideoElement = z.infer<typeof creativeVideoElementSchema>;
export type CreativeTagStyle = z.infer<typeof creativeTagStyleSchema>;
export type CreativeTagVariant = CreativeTagElement["variant"];

/**
 * Elements that are conceptually one thing but drawn on every page. The copies
 * share a `syncId`; anything that edits, moves or removes one must do the same
 * to its siblings, or "appears on every page" quietly stops being true.
 */
export type CreativeSmartElement = CreativeElement & { syncId: string };

export function isSmartElement(
  element: CreativeElement,
): element is CreativeSmartElement {
  return typeof element.syncId === "string" && element.syncId.length > 0;
}

export type CreativeBrush = z.infer<typeof creativeBrushSchema>;
export type CreativeDrawingStroke = z.infer<typeof creativeDrawingStrokeSchema>;
export type CreativeDrawingElement = z.infer<
  typeof creativeDrawingElementSchema
>;
export type CreativeBackgroundEffect = z.infer<
  typeof creativeBackgroundEffectSchema
>;
export type CreativeElement = z.infer<typeof creativeElementSchema>;
export type CreativePage = z.infer<typeof creativePageSchema>;
export type CreativeFont = z.infer<typeof creativeFontSchema>;
export type CreativeSoundtrack = z.infer<typeof creativeSoundtrackSchema>;
export type CreativeDocument = z.infer<typeof creativeDocumentSchema>;

export const CREATIVE_PRESETS = {
  portrait: { width: 1080, height: 1350, colorSpace: "srgb" },
  square: { width: 1080, height: 1080, colorSpace: "srgb" },
  story: { width: 1080, height: 1920, colorSpace: "srgb" },
  landscape: { width: 1200, height: 675, colorSpace: "srgb" },
} as const satisfies Record<string, CreativeCanvas>;

export type CreativePreset = keyof typeof CREATIVE_PRESETS;

export const CREATIVE_PRESET_LABELS: Record<
  CreativePreset,
  { label: string; detail: string }
> = {
  portrait: { label: "Portrait", detail: "4:5 · feed carousel" },
  square: { label: "Square", detail: "1:1 · feed" },
  story: { label: "Story", detail: "9:16 · story & reel" },
  landscape: { label: "Landscape", detail: "16:9 · X & LinkedIn" },
};

/** The preset a canvas matches, if any — used to highlight the active size. */
export function matchCreativePreset(
  canvas: CreativeCanvas,
): CreativePreset | undefined {
  return (Object.keys(CREATIVE_PRESETS) as CreativePreset[]).find(
    (preset) =>
      CREATIVE_PRESETS[preset].width === canvas.width &&
      CREATIVE_PRESETS[preset].height === canvas.height,
  );
}

export function createCreativeId(prefix: string) {
  return `${prefix}_${createUuid()}`;
}

function createUuid() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createStarterCreativeDocument(input: {
  profileId: string;
  preset?: CreativePreset;
  title?: string;
  kind?: "carousel" | "image" | "video";
}): CreativeDocument {
  const now = new Date().toISOString();
  const canvas = CREATIVE_PRESETS[input.preset ?? "portrait"];
  const kind = input.kind ?? "carousel";
  // One empty slide, deliberately. This used to arrive with a headline, a body
  // line and an accent bar as a worked example, but placeholder copy nobody
  // asked for is work to delete before work can start - and it made a new design
  // look like it already had content in it.
  //
  // Built untyped and parsed on the way out so schema defaults are filled in
  // from one place rather than restated here.
  const document = {
    schemaVersion: 1,
    id: createCreativeId("document"),
    projectId: createCreativeId("project"),
    profileId: input.profileId,
    revision: 0,
    kind,
    title:
      input.title?.trim() ||
      (kind === "video"
        ? "Untitled video"
        : kind === "image"
          ? "Untitled image"
          : "Untitled carousel"),
    canvas: { ...canvas },
    fonts: [],
    pages: [
      {
        id: createCreativeId("page"),
        name: "Slide 1",
        background: "#F2EDE4",
        elements: [],
      },
    ],
    metadata: { createdBy: "user" },
    createdAt: now,
    updatedAt: now,
  };

  return creativeDocumentSchema.parse(document);
}
const baseElementChangesSchema = z.object({
  groupId: z.string().min(1).nullable().optional(),
  groupName: z.string().min(1).max(120).nullable().optional(),
  name: z.string().min(1).max(120).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().max(8192).optional(),
  height: z.number().positive().max(8192).optional(),
  rotation: z.number().finite().min(-3600).max(3600).optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
});

const commandMeta = {
  id: z.string().min(1),
  actor: z.enum(["user", "agent", "workflow"]),
};

export const creativeCommandSchema = z.discriminatedUnion("type", [
  z.object({
    ...commandMeta,
    type: z.literal("document.rename"),
    title: z.string().min(1).max(200),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("document.resize"),
    canvas: creativeCanvasSchema,
    /** Scale every element to the new frame instead of leaving it in place. */
    scaleContent: z.boolean().default(true),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("document.soundtrack.set"),
    /** Null removes the music bed and restores scene clip audio on export. */
    soundtrack: creativeSoundtrackSchema.nullable(),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("font.add"),
    font: creativeFontSchema,
  }),
  z.object({
    ...commandMeta,
    type: z.literal("page.add"),
    page: creativePageSchema,
    afterPageId: z.string().min(1).optional(),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("page.update"),
    pageId: z.string().min(1),
    changes: z.object({
      name: z.string().min(1).max(120).optional(),
      background: z.string().min(1).max(100).optional(),
      backgroundEffect: creativeBackgroundEffectSchema.optional(),
      hidden: z.boolean().optional(),
      durationMs: z.number().int().min(200).max(60000).optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("page.remove"),
    pageId: z.string().min(1),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("page.reorder"),
    pageId: z.string().min(1),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.add"),
    pageId: z.string().min(1),
    element: creativeElementSchema,
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: baseElementChangesSchema,
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.syncAcrossPages"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.makePageSpecific"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("text.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: z.object({
      text: z.string().max(10_000).optional(),
      autoWidth: z.boolean().optional(),
      fontFamily: z.string().min(1).max(120).optional(),
      fontSize: z.number().positive().max(512).optional(),
      fontWeight: z.enum(["400", "500", "600", "700", "800"]).optional(),
      fill: z.string().min(1).max(100).optional(),
      textAlign: z.enum(["left", "center", "right"]).optional(),
      lineHeight: z.number().min(0.5).max(3).optional(),
      letterSpacing: z.number().min(-40).max(200).optional(),
      textTransform: z
        .enum(["none", "uppercase", "lowercase", "capitalize"])
        .optional(),
      shadow: creativeTextShadowSchema.optional(),
      outline: creativeTextOutlineSchema.optional(),
      highlight: creativeTextHighlightSchema.optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("shape.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: z.object({
      shape: z
        .enum([
          "rectangle",
          "ellipse",
          "triangle",
          "diamond",
          "pentagon",
          "hexagon",
          "octagon",
          "star",
          "heart",
          "cross",
          "arrow-right",
          "speech-bubble",
          "cloud",
          "burst",
        ])
        .optional(),
      fill: z.string().min(1).max(100).optional(),
      stroke: z.string().min(1).max(100).optional(),
      strokeWidth: z.number().min(0).max(128).optional(),
      radius: z.number().min(0).max(4096).optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("image.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: z.object({
      crop: creativeImageCropSchema.optional(),
      fit: z.enum(["cover", "contain"]).optional(),
      effect: creativeImageEffectSchema.optional(),
      edgeEffect: creativeImageEdgeEffectSchema.optional(),
      asset: creativeMediaAssetSchema.optional(),
      adjustments: creativeImageAdjustmentsSchema.optional(),
      radius: z.number().min(0).max(2048).optional(),
      flipX: z.boolean().optional(),
      flipY: z.boolean().optional(),
      shadow: creativeShadowSchema.optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("video.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: z.object({
      src: z.string().min(1).optional(),
      originalSrc: z.string().optional(),
      chromaKeyed: z.boolean().optional(),
      loop: z.boolean().optional(),
      fit: z.enum(["cover", "contain"]).optional(),
      radius: z.number().min(0).max(2048).optional(),
      muted: z.boolean().optional(),
      memeCaption: z.string().optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("frame.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: z.object({
      shape: creativeFrameElementSchema.shape.shape.optional(),
      radius: z.number().min(0).max(512).optional(),
      fit: z.enum(["cover", "contain"]).optional(),
      adjustments: creativeImageAdjustmentsSchema.optional(),
      effect: creativeImageEffectSchema.optional(),
      edgeEffect: creativeImageEdgeEffectSchema.optional(),
      zoom: z.number().min(0.1).max(6).optional(),
      offsetX: z.number().min(-1).max(1).optional(),
      offsetY: z.number().min(-1).max(1).optional(),
      fill: z.string().min(1).max(100).optional(),
      stroke: z.string().min(1).max(100).optional(),
      strokeWidth: z.number().min(0).max(64).optional(),
      /** Null clears the frame back to an empty placeholder. */
      asset: creativeMediaAssetSchema.nullable().optional(),
      /**
       * Keep the current crop when swapping the asset. Set when the new image
       * is the same picture (a background-removal cutout), where resetting the
       * pan and zoom would throw away framing the user had already chosen.
       */
      keepCrop: z.boolean().optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("vector.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: z.object({
      fill: z.string().min(1).max(100).optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("widget.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    changes: creativePagerPropsSchema.partial(),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("tag.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    /** Applied to the tag on every page, not just this one. */
    changes: z.object({
      variant: z.enum(["handle", "location", "plate"]).optional(),
      badge: z.boolean().optional(),
      text: z.string().min(1).max(200).optional(),
      fontFamily: z.string().min(1).max(120).optional(),
      fontSize: z.number().positive().max(256).optional(),
      fontWeight: z.enum(["400", "500", "600", "700", "800"]).optional(),
      fill: z.string().min(1).max(100).optional(),
      letterSpacing: z.number().min(-40).max(200).optional(),
      textTransform: z
        .enum(["none", "uppercase", "lowercase", "capitalize"])
        .optional(),
      style: creativeTagStylePatchSchema.optional(),
    }),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("drawing.stroke.add"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    /**
     * Points and width in *document* units. The reducer maps them into the
     * element's local space, so a caller only ever has to think in the
     * coordinates it drew in.
     */
    stroke: creativeDrawingStrokeSchema,
  }),
  z.object({
    ...commandMeta,
    type: z.literal("drawing.stroke.remove"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    /** Erasing a whole sketch removes the element rather than emptying it. */
    indices: z.array(z.number().int().nonnegative()).min(1).max(800),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("drawing.update"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    /** Restyles every stroke in the sketch; `width` is in document units. */
    changes: z.object({
      brush: creativeBrushSchema.optional(),
      color: z.string().min(1).max(100).optional(),
      width: z.number().positive().max(400).optional(),
      opacity: z.number().min(0).max(1).optional(),
      smoothing: z.number().min(0).max(1).optional(),
    }),
  }),
  /**
   * Deterministic layout helpers. The agent computes positions badly and
   * a person aligns by eye; both get exact geometry from these instead.
   */
  z.object({
    ...commandMeta,
    type: z.literal("element.align"),
    pageId: z.string().min(1),
    /** Two or more ids align to their selection box; one id aligns to the canvas. */
    elementIds: z.array(z.string().min(1)).min(1).max(100),
    edge: z.enum(["left", "centerX", "right", "top", "centerY", "bottom"]),
    /** Force canvas as the reference even for several elements. */
    toCanvas: z.boolean().default(false),
    /** Inset from the canvas edge when aligning to the canvas. */
    margin: z.number().min(0).max(1000).default(0),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.distribute"),
    pageId: z.string().min(1),
    elementIds: z.array(z.string().min(1)).min(3).max(100),
    axis: z.enum(["horizontal", "vertical"]),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("layout.stack"),
    pageId: z.string().min(1),
    /** In stacking order; the first keeps its position. */
    elementIds: z.array(z.string().min(1)).min(2).max(100),
    axis: z.enum(["vertical", "horizontal"]).default("vertical"),
    gap: z.number().min(0).max(1000).default(24),
    /** Cross-axis alignment: start (left/top), center, end. */
    align: z.enum(["start", "center", "end"]).default("start"),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("layout.grid"),
    pageId: z.string().min(1),
    elementIds: z.array(z.string().min(1)).min(2).max(100),
    columns: z.number().int().min(1).max(12),
    /** Cell size; omit to size cells to the largest element. */
    cellWidth: z.number().positive().max(8192).optional(),
    cellHeight: z.number().positive().max(8192).optional(),
    gap: z.number().min(0).max(1000).default(24),
    /** Top-left origin of the grid; omit to keep the first element's position. */
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.remove"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.reorder"),
    pageId: z.string().min(1),
    elementId: z.string().min(1),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    ...commandMeta,
    type: z.literal("element.reorderMany"),
    pageId: z.string().min(1),
    elementIds: z.array(z.string().min(1)).min(1).max(100),
    /** Insertion point after the moving elements have been removed. */
    index: z.number().int().nonnegative(),
  }),
  z.object({
    ...commandMeta,
    // Deep-clone an existing element onto other pages VERBATIM — same asset,
    // position and size, with a fresh id per copy. The exact-duplicate primitive
    // for "put this same graphic/element on every slide", so it never has to be
    // rebuilt (and mis-guessed) from scratch.
    type: z.literal("element.copyToPages"),
    sourcePageId: z.string().min(1),
    elementId: z.string().min(1),
    targetPageIds: z.array(z.string().min(1)).min(1).max(100),
  }),
]);

export type CreativeCommand = z.infer<typeof creativeCommandSchema>;
export type CreativeCommandInput = CreativeCommand extends infer T
  ? T extends CreativeCommand
    ? Omit<T, "id" | "actor">
    : never
  : never;

export type CreativeCommandBatch = {
  expectedRevision: number;
  commands: CreativeCommand[];
};

export class CreativeRevisionConflictError extends Error {
  constructor(expected: number, actual: number) {
    super(
      `Creative document revision conflict: expected ${expected}, found ${actual}`,
    );
    this.name = "CreativeRevisionConflictError";
  }
}

export function applyCreativeCommands(
  document: CreativeDocument,
  batch: CreativeCommandBatch,
): CreativeDocument {
  if (batch.expectedRevision !== document.revision) {
    throw new CreativeRevisionConflictError(
      batch.expectedRevision,
      document.revision,
    );
  }
  if (batch.commands.length === 0) return document;

  const parsedCommands = batch.commands.map((command) =>
    creativeCommandSchema.parse(command),
  );
  let next = structuredClone(document);

  for (const command of parsedCommands) {
    next = applyCommand(next, command);
  }

  return {
    ...next,
    revision: document.revision + 1,
    updatedAt: new Date().toISOString(),
  };
}

function applyCommand(
  document: CreativeDocument,
  command: CreativeCommand,
): CreativeDocument {
  switch (command.type) {
    case "document.rename":
      return { ...document, title: command.title };
    case "document.resize":
      return resizeDocument(document, command.canvas, command.scaleContent);
    case "document.soundtrack.set":
      return { ...document, soundtrack: command.soundtrack ?? undefined };
    case "font.add":
      return {
        ...document,
        fonts: [
          ...document.fonts.filter(
            (font) =>
              font.id !== command.font.id &&
              font.family.toLowerCase() !== command.font.family.toLowerCase(),
          ),
          command.font,
        ],
      };
    case "page.add":
      return {
        ...document,
        pages: insertAfter(document.pages, command.page, command.afterPageId),
      };
    case "page.update":
      return updatePage(document, command.pageId, (page) => ({
        ...page,
        ...command.changes,
      }));
    case "page.remove":
      if (document.pages.length === 1) {
        throw new Error("A creative document must contain at least one page");
      }
      return {
        ...document,
        pages: requireChange(
          document.pages.filter((page) => page.id !== command.pageId),
          document.pages,
          "Page",
        ),
      };
    case "page.reorder":
      return {
        ...document,
        pages: moveItem(document.pages, command.pageId, command.index),
      };
    case "element.add":
      return updatePage(document, command.pageId, (page) => ({
        ...page,
        elements: [...page.elements, command.element],
      }));
    case "element.update":
      return updateElement(
        document,
        command.pageId,
        command.elementId,
        (element) => ({
          ...element,
          ...command.changes,
        }),
      );
    case "element.syncAcrossPages":
      return syncElementAcrossPages(
        document,
        command.pageId,
        command.elementId,
      );
    case "element.makePageSpecific":
      return makeElementPageSpecific(
        document,
        command.pageId,
        command.elementId,
      );
    case "text.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "text",
        (element) => ({
          ...element,
          ...command.changes,
        }),
      );
    case "shape.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "shape",
        (element) => ({
          ...element,
          ...command.changes,
        }),
      );
    case "image.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "image",
        (element) => ({
          ...element,
          ...command.changes,
        }),
      );
    case "video.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "video",
        (element) => ({
          ...element,
          ...command.changes,
        }),
      );
    case "frame.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "frame",
        (element) => {
          const { asset, keepCrop, ...rest } = command.changes;
          const next = { ...element, ...rest };
          if (asset === undefined) return next;
          // An explicit null empties the frame; anything else fills it and
          // resets the crop, since the old pan/zoom described a different image
          // — unless the caller says the picture is the same one.
          const crop = keepCrop ? {} : { zoom: 1, offsetX: 0, offsetY: 0 };
          return asset === null
            ? { ...next, ...crop, asset: undefined }
            : { ...next, ...crop, asset };
        },
      );
    case "vector.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "vector",
        (element) => ({
          ...element,
          ...command.changes,
        }),
      );
    case "widget.update":
      return updateSmartElement(
        document,
        command.pageId,
        command.elementId,
        "widget",
        (element) => ({
          ...element,
          props: { ...element.props, ...command.changes },
        }),
      );
    case "tag.update":
      return updateSmartElement(
        document,
        command.pageId,
        command.elementId,
        "tag",
        (element) => {
          const { style: patch, ...rest } = command.changes;
          const style = { ...element.style };
          // Applied field by field so an absent key means "unchanged" and an
          // explicit null on the background means "no pill".
          if (patch) {
            if (patch.background !== undefined) {
              if (patch.background === null) delete style.background;
              else style.background = patch.background;
            }
            if (patch.paddingX !== undefined) style.paddingX = patch.paddingX;
            if (patch.paddingY !== undefined) style.paddingY = patch.paddingY;
            if (patch.radius !== undefined) style.radius = patch.radius;
          }
          return { ...element, ...rest, style };
        },
      );
    case "drawing.stroke.add":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "drawing",
        (element) => appendDrawingStroke(element, command.stroke),
      );
    case "drawing.stroke.remove":
      return removeDrawingStrokes(
        document,
        command.pageId,
        command.elementId,
        command.indices,
      );
    case "drawing.update":
      return updateTypedElement(
        document,
        command.pageId,
        command.elementId,
        "drawing",
        (element) => restyleDrawing(element, command.changes),
      );
    case "element.align":
      return updatePage(document, command.pageId, (page) =>
        alignElements(page, document.canvas, command),
      );
    case "element.distribute":
      return updatePage(document, command.pageId, (page) =>
        distributeElements(page, command.elementIds, command.axis),
      );
    case "layout.stack":
      return updatePage(document, command.pageId, (page) =>
        stackElements(page, command),
      );
    case "layout.grid":
      return updatePage(document, command.pageId, (page) =>
        gridElements(page, command),
      );
    case "element.remove":
      return updatePage(document, command.pageId, (page) => ({
        ...page,
        elements: requireChange(
          page.elements.filter((element) => element.id !== command.elementId),
          page.elements,
          "Element",
        ),
      }));
    case "element.reorder":
      return updatePage(document, command.pageId, (page) => ({
        ...page,
        elements: moveItem(page.elements, command.elementId, command.index),
      }));
    case "element.reorderMany":
      return updatePage(document, command.pageId, (page) => {
        const movingIds = new Set(command.elementIds);
        const moving = page.elements.filter((element) =>
          movingIds.has(element.id),
        );
        if (moving.length !== movingIds.size) {
          throw new Error("One or more layers could not be found");
        }
        const remaining = page.elements.filter(
          (element) => !movingIds.has(element.id),
        );
        const index = Math.min(command.index, remaining.length);
        return {
          ...page,
          elements: [
            ...remaining.slice(0, index),
            ...moving,
            ...remaining.slice(index),
          ],
        };
      });
    case "element.copyToPages": {
      const sourcePage = document.pages.find(
        (page) => page.id === command.sourcePageId,
      );
      const source = sourcePage?.elements.find(
        (element) => element.id === command.elementId,
      );
      if (!source) {
        throw new Error("The element to copy could not be found");
      }
      const targets = new Set(command.targetPageIds);
      return {
        ...document,
        pages: document.pages.map((page) => {
          if (!targets.has(page.id) || page.id === command.sourcePageId) {
            return page;
          }
          // An independent copy, not a synced instance: fresh id, and any
          // seamless link dropped so it lives only on this page.
          const clone = {
            ...structuredClone(source),
            id: createCreativeId(source.type),
          } as CreativeElement & { seamlessId?: string; syncId?: string };
          delete clone.seamlessId;
          // Pager/tag schemas require a sync id even if only one copy exists.
          // Ordinary elements can become truly page-specific by dropping it.
          if (clone.type === "widget" || clone.type === "tag") {
            clone.syncId = createCreativeId(clone.type);
          } else {
            delete clone.syncId;
          }
          return { ...page, elements: [...page.elements, clone] };
        }),
      };
    }
  }
}

/**
 * Change the canvas frame. With `scaleContent` every element is remapped into
 * the new frame proportionally (uniform scale for type/stroke so glyphs and
 * corner radii keep their proportions, axis scale for position/extent).
 */
function resizeDocument(
  document: CreativeDocument,
  canvas: CreativeCanvas,
  scaleContent: boolean,
): CreativeDocument {
  if (
    canvas.width === document.canvas.width &&
    canvas.height === document.canvas.height
  ) {
    return { ...document, canvas };
  }
  if (!scaleContent) return { ...document, canvas };

  const ratioX = canvas.width / document.canvas.width;
  const ratioY = canvas.height / document.canvas.height;
  const uniform = Math.min(ratioX, ratioY);
  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    ...document,
    canvas,
    pages: document.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => {
        const scaled = {
          ...element,
          x: round(element.x * ratioX),
          y: round(element.y * ratioY),
          width: Math.max(1, round(element.width * ratioX)),
          height: Math.max(1, round(element.height * ratioY)),
        };
        if (scaled.type === "text") {
          return {
            ...scaled,
            fontSize: Math.max(1, round(scaled.fontSize * uniform)),
            letterSpacing: round(scaled.letterSpacing * uniform),
          };
        }
        if (scaled.type === "shape") {
          return {
            ...scaled,
            strokeWidth: round(scaled.strokeWidth * uniform),
            radius: round(scaled.radius * uniform),
          };
        }
        if (scaled.type === "widget") {
          return {
            ...scaled,
            props: {
              ...scaled.props,
              size: Math.min(
                80,
                Math.max(4, round(scaled.props.size * uniform)),
              ),
              gap: Math.min(
                100,
                Math.max(0, round(scaled.props.gap * uniform)),
              ),
            },
          };
        }
        return scaled;
      }),
    })),
  };
}

/**
 * Apply a change to every copy of a smart element.
 *
 * The copies exist only so the thing can be drawn on each page; editing one has
 * to edit all of them or they drift apart and the illusion of a single element
 * breaks. Generic over the smart kinds so the pager and the name tag cannot
 * develop different sync behaviour by accident.
 */
function updateSmartElement<T extends CreativeSmartElement["type"]>(
  document: CreativeDocument,
  pageId: string,
  elementId: string,
  type: T,
  apply: (element: Extract<CreativeElement, { type: T }>) => CreativeElement,
): CreativeDocument {
  const page = document.pages.find((candidate) => candidate.id === pageId);
  const target = page?.elements.find((element) => element.id === elementId);
  if (!target) throw new Error(`Element ${elementId} was not found`);
  if (target.type !== type) {
    throw new Error(`Element ${elementId} is not a ${type} element`);
  }
  const { syncId } = target as CreativeSmartElement;

  return {
    ...document,
    pages: document.pages.map((candidate) => ({
      ...candidate,
      elements: candidate.elements.map((element) =>
        element.type === type &&
        (element as CreativeSmartElement).syncId === syncId
          ? apply(element as Extract<CreativeElement, { type: T }>)
          : element,
      ),
    })),
  };
}

/* ---------- deterministic layout ---------- */

type Box = { x: number; y: number; width: number; height: number };

function pickElements(page: CreativePage, ids: string[]): CreativeElement[] {
  const byId = new Map(page.elements.map((element) => [element.id, element]));
  return ids.map((id) => {
    const element = byId.get(id);
    if (!element) throw new Error(`Element ${id} was not found on this page`);
    return element;
  });
}

function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

function applyPositions(
  page: CreativePage,
  positions: Map<string, { x?: number; y?: number }>,
): CreativePage {
  return {
    ...page,
    elements: page.elements.map((element) => {
      const next = positions.get(element.id);
      if (!next) return element;
      return {
        ...element,
        ...(next.x !== undefined ? { x: Math.round(next.x) } : {}),
        ...(next.y !== undefined ? { y: Math.round(next.y) } : {}),
      };
    }),
  };
}

function alignElements(
  page: CreativePage,
  canvas: CreativeCanvas,
  command: {
    elementIds: string[];
    edge: "left" | "centerX" | "right" | "top" | "centerY" | "bottom";
    toCanvas: boolean;
    margin: number;
  },
): CreativePage {
  const elements = pickElements(page, command.elementIds);
  const useCanvas = command.toCanvas || elements.length === 1;
  const reference: Box = useCanvas
    ? {
        x: command.margin,
        y: command.margin,
        width: canvas.width - command.margin * 2,
        height: canvas.height - command.margin * 2,
      }
    : unionBox(elements);
  const positions = new Map<string, { x?: number; y?: number }>();
  for (const element of elements) {
    switch (command.edge) {
      case "left":
        positions.set(element.id, { x: reference.x });
        break;
      case "centerX":
        positions.set(element.id, {
          x: reference.x + (reference.width - element.width) / 2,
        });
        break;
      case "right":
        positions.set(element.id, {
          x: reference.x + reference.width - element.width,
        });
        break;
      case "top":
        positions.set(element.id, { y: reference.y });
        break;
      case "centerY":
        positions.set(element.id, {
          y: reference.y + (reference.height - element.height) / 2,
        });
        break;
      case "bottom":
        positions.set(element.id, {
          y: reference.y + reference.height - element.height,
        });
        break;
    }
  }
  return applyPositions(page, positions);
}

/** Equal gaps between elements, keeping the first and last where they are. */
function distributeElements(
  page: CreativePage,
  ids: string[],
  axis: "horizontal" | "vertical",
): CreativePage {
  const elements = pickElements(page, ids);
  const horizontal = axis === "horizontal";
  const sorted = [...elements].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = horizontal
    ? last.x + last.width - first.x
    : last.y + last.height - first.y;
  const total = sorted.reduce(
    (sum, e) => sum + (horizontal ? e.width : e.height),
    0,
  );
  const gap = (span - total) / (sorted.length - 1);
  const positions = new Map<string, { x?: number; y?: number }>();
  let cursor = horizontal ? first.x : first.y;
  for (const element of sorted) {
    positions.set(element.id, horizontal ? { x: cursor } : { y: cursor });
    cursor += (horizontal ? element.width : element.height) + gap;
  }
  return applyPositions(page, positions);
}

/** Lay elements one after another with a fixed gap; the first keeps its spot. */
function stackElements(
  page: CreativePage,
  command: {
    elementIds: string[];
    axis: "vertical" | "horizontal";
    gap: number;
    align: "start" | "center" | "end";
  },
): CreativePage {
  const elements = pickElements(page, command.elementIds);
  const vertical = command.axis === "vertical";
  const first = elements[0]!;
  const crossSize = Math.max(
    ...elements.map((e) => (vertical ? e.width : e.height)),
  );
  const positions = new Map<string, { x?: number; y?: number }>();
  let cursor = vertical ? first.y : first.x;
  for (const element of elements) {
    const size = vertical ? element.width : element.height;
    const offset =
      command.align === "center"
        ? (crossSize - size) / 2
        : command.align === "end"
          ? crossSize - size
          : 0;
    positions.set(
      element.id,
      vertical
        ? { x: first.x + offset, y: cursor }
        : { x: cursor, y: first.y + offset },
    );
    cursor += (vertical ? element.height : element.width) + command.gap;
  }
  return applyPositions(page, positions);
}

/** Place elements into an N-column grid of equal cells, in the order given. */
function gridElements(
  page: CreativePage,
  command: {
    elementIds: string[];
    columns: number;
    cellWidth?: number;
    cellHeight?: number;
    gap: number;
    x?: number;
    y?: number;
  },
): CreativePage {
  const elements = pickElements(page, command.elementIds);
  const cellWidth =
    command.cellWidth ?? Math.max(...elements.map((e) => e.width));
  const cellHeight =
    command.cellHeight ?? Math.max(...elements.map((e) => e.height));
  const originX = command.x ?? elements[0]!.x;
  const originY = command.y ?? elements[0]!.y;
  const positions = new Map<string, { x?: number; y?: number }>();
  elements.forEach((element, index) => {
    const column = index % command.columns;
    const row = Math.floor(index / command.columns);
    const cellX = originX + column * (cellWidth + command.gap);
    const cellY = originY + row * (cellHeight + command.gap);
    // Centre each element inside its cell.
    positions.set(element.id, {
      x: cellX + (cellWidth - element.width) / 2,
      y: cellY + (cellHeight - element.height) / 2,
    });
  });
  return applyPositions(page, positions);
}

function updatePage(
  document: CreativeDocument,
  pageId: string,
  updater: (page: CreativePage) => CreativePage,
) {
  let found = false;
  const pages = document.pages.map((page) => {
    if (page.id !== pageId) return page;
    found = true;
    return updater(page);
  });
  if (!found) throw new Error(`Page ${pageId} was not found`);
  return { ...document, pages };
}

function updateElement(
  document: CreativeDocument,
  pageId: string,
  elementId: string,
  updater: (element: CreativeElement) => CreativeElement,
) {
  const sourcePage = document.pages.find((page) => page.id === pageId);
  const source = sourcePage?.elements.find(
    (element) => element.id === elementId,
  );
  if (!source) throw new Error(`Element ${elementId} was not found`);

  if (isSmartElement(source)) {
    return {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        elements: page.elements.map((element) =>
          isSmartElement(element) &&
          element.syncId === source.syncId &&
          element.type === source.type
            ? updater(element)
            : element,
        ),
      })),
    };
  }

  return updatePage(document, pageId, (page) => {
    let found = false;
    const elements = page.elements.map((element) => {
      if (element.id !== elementId) return element;
      found = true;
      return updater(element);
    });
    if (!found) throw new Error(`Element ${elementId} was not found`);
    return { ...page, elements };
  });
}

function syncElementAcrossPages(
  document: CreativeDocument,
  pageId: string,
  elementId: string,
): CreativeDocument {
  const sourcePage = document.pages.find((page) => page.id === pageId);
  if (!sourcePage) throw new Error(`Page ${pageId} was not found`);
  const source = sourcePage.elements.find(
    (element) => element.id === elementId,
  );
  if (!source) throw new Error(`Element ${elementId} was not found`);
  if (source.seamlessId) {
    throw new Error("A seamless element cannot also be shown on every page");
  }
  if (isSmartElement(source)) return document;

  const syncId = createCreativeId("sync");
  const sourceIndex = sourcePage.elements.findIndex(
    (element) => element.id === elementId,
  );

  return {
    ...document,
    pages: document.pages.map((page) => {
      if (page.id === pageId) {
        return {
          ...page,
          elements: page.elements.map((element) =>
            element.id === elementId ? { ...element, syncId } : element,
          ),
        };
      }

      const clone = {
        ...structuredClone(source),
        id: createCreativeId(source.type),
        syncId,
      } as CreativeElement;
      const index = Math.min(sourceIndex, page.elements.length);
      return {
        ...page,
        elements: [
          ...page.elements.slice(0, index),
          clone,
          ...page.elements.slice(index),
        ],
      };
    }),
  };
}

function makeElementPageSpecific(
  document: CreativeDocument,
  pageId: string,
  elementId: string,
): CreativeDocument {
  const sourcePage = document.pages.find((page) => page.id === pageId);
  if (!sourcePage) throw new Error(`Page ${pageId} was not found`);
  const source = sourcePage.elements.find(
    (element) => element.id === elementId,
  );
  if (!source) throw new Error(`Element ${elementId} was not found`);
  if (!isSmartElement(source)) return document;
  if (source.type === "widget" || source.type === "tag") {
    throw new Error("This built-in element is always shown on every page");
  }

  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      // Detach only the chosen instance. Siblings on every other page keep the
      // shared sync id and continue behaving as one linked element.
      elements: page.elements.map((element) => {
        if (page.id !== pageId || element.id !== elementId) return element;
        const pageSpecific = {
          ...element,
          syncId: undefined,
        } as CreativeElement & { syncId?: string };
        delete pageSpecific.syncId;
        return pageSpecific;
      }),
    })),
  };
}

function updateTypedElement<T extends CreativeElement["type"]>(
  document: CreativeDocument,
  pageId: string,
  elementId: string,
  type: T,
  updater: (element: Extract<CreativeElement, { type: T }>) => CreativeElement,
) {
  return updateElement(document, pageId, elementId, (element) => {
    if (element.type !== type) {
      throw new Error(`Element ${elementId} is not a ${type} element`);
    }
    return updater(element as Extract<CreativeElement, { type: T }>);
  });
}

/**
 * A sketch rolls over to a new element at this many strokes. The schema's cap
 * is the same number, so a client that respects this never has a command
 * rejected mid-drawing.
 */
export const CREATIVE_DRAWING_STROKE_LIMIT = 800;

/**
 * Natural extent of a stroke set, in local units, padded by half of each
 * stroke's width so the ink itself is inside the box rather than the centre
 * line of the ink. Never zero-sized: a single dot is a legitimate stroke.
 */
export function drawingStrokeBounds(strokes: CreativeDrawingStroke[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    const pad = stroke.width / 2;
    for (let index = 0; index + 1 < stroke.points.length; index += 2) {
      const x = stroke.points[index] ?? 0;
      const y = stroke.points[index + 1] ?? 0;
      if (x - pad < minX) minX = x - pad;
      if (y - pad < minY) minY = y - pad;
      if (x + pad > maxX) maxX = x + pad;
      if (y + pad > maxY) maxY = y + pad;
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/**
 * How the element box currently maps onto the strokes: px per local unit on
 * each axis. Both are positive, because the box has a positive size and the
 * natural bounds are never zero.
 */
function drawingPlacement(element: CreativeDrawingElement) {
  const natural = drawingStrokeBounds(element.strokes);
  return {
    natural,
    scaleX: element.width / natural.width,
    scaleY: element.height / natural.height,
  };
}

type DrawingPlacement = ReturnType<typeof drawingPlacement>;

/**
 * Re-fit the box around a changed stroke set *without moving the ink already on
 * screen*: the px-per-local-unit scale is held at what it was, and the origin
 * shifts by exactly as far as the natural origin moved. Without this, drawing a
 * stroke that extends the sketch leftwards would visibly slide every earlier
 * stroke, because the box would grow while the strokes stayed put.
 */
function refitDrawing(
  element: CreativeDrawingElement,
  placement: DrawingPlacement,
): CreativeDrawingElement {
  const natural = drawingStrokeBounds(element.strokes);
  return {
    ...element,
    x: element.x + (natural.minX - placement.natural.minX) * placement.scaleX,
    y: element.y + (natural.minY - placement.natural.minY) * placement.scaleY,
    width: Math.max(1, natural.width * placement.scaleX),
    height: Math.max(1, natural.height * placement.scaleY),
  };
}

/**
 * Build the element for a sketch's first stroke. Local space starts out equal
 * to document space (scale 1), which is what makes the append maths below a
 * no-op for the common case.
 *
 * `stroke` carries document coordinates, as it came off the pointer.
 */
export function createDrawingElement(input: {
  stroke: CreativeDrawingStroke;
  id?: string;
  name?: string;
  smoothing?: number;
}): CreativeDrawingElement {
  const bounds = drawingStrokeBounds([input.stroke]);
  return {
    id: input.id ?? createCreativeId("drawing"),
    name: input.name ?? "Drawing",
    type: "drawing",
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    strokes: [input.stroke],
    smoothing: input.smoothing ?? 0.55,
  };
}

/**
 * Add a stroke given in document coordinates.
 *
 * Rotation is deliberately not undone here: the editor only ever appends to a
 * sketch it created in the current session, which is unrotated. A rotated
 * sketch gets a fresh element instead of silently accumulating skewed points.
 */
function appendDrawingStroke(
  element: CreativeDrawingElement,
  stroke: CreativeDrawingStroke,
): CreativeDrawingElement {
  if (element.strokes.length >= CREATIVE_DRAWING_STROKE_LIMIT) {
    throw new Error(
      `A drawing holds at most ${CREATIVE_DRAWING_STROKE_LIMIT} strokes; start a new one`,
    );
  }

  const placement = drawingPlacement(element);
  const { natural, scaleX, scaleY } = placement;
  const points: number[] = [];
  for (let index = 0; index + 1 < stroke.points.length; index += 2) {
    const x = stroke.points[index] ?? 0;
    const y = stroke.points[index + 1] ?? 0;
    points.push(
      (x - element.x) / scaleX + natural.minX,
      (y - element.y) / scaleY + natural.minY,
    );
  }

  // Width is a single number against two axes; a non-uniformly scaled sketch
  // has no exact answer, so use the mean rather than favouring one axis.
  const uniform = (scaleX + scaleY) / 2 || 1;
  return refitDrawing(
    {
      ...element,
      strokes: [
        ...element.strokes,
        { ...stroke, points, width: Math.max(0.01, stroke.width / uniform) },
      ],
    },
    placement,
  );
}

/** Restyle every stroke in a sketch. `width` arrives in document units. */
function restyleDrawing(
  element: CreativeDrawingElement,
  changes: {
    brush?: CreativeBrush;
    color?: string;
    width?: number;
    opacity?: number;
    smoothing?: number;
  },
): CreativeDrawingElement {
  const placement = drawingPlacement(element);
  const uniform = (placement.scaleX + placement.scaleY) / 2 || 1;
  const localWidth =
    changes.width === undefined
      ? undefined
      : Math.max(0.01, changes.width / uniform);

  const strokes = element.strokes.map((stroke) => ({
    ...stroke,
    ...(changes.brush === undefined ? {} : { brush: changes.brush }),
    ...(changes.color === undefined ? {} : { color: changes.color }),
    ...(changes.opacity === undefined ? {} : { opacity: changes.opacity }),
    ...(localWidth === undefined ? {} : { width: localWidth }),
  }));

  // A width change moves the padded bounds, so the box has to be re-fitted.
  return refitDrawing(
    {
      ...element,
      strokes,
      ...(changes.smoothing === undefined
        ? {}
        : { smoothing: changes.smoothing }),
    },
    placement,
  );
}

/**
 * Erase strokes by index. Removing the last one removes the element: an empty
 * sketch has no bounds to speak of, and leaving a zero-stroke element behind
 * would be an invisible, unselectable layer.
 */
function removeDrawingStrokes(
  document: CreativeDocument,
  pageId: string,
  elementId: string,
  indices: number[],
): CreativeDocument {
  const drop = new Set(indices);
  const page = document.pages.find((candidate) => candidate.id === pageId);
  const target = page?.elements.find((element) => element.id === elementId);
  if (!target) throw new Error(`Element ${elementId} was not found`);
  if (target.type !== "drawing") {
    throw new Error(`Element ${elementId} is not a drawing element`);
  }

  const kept = target.strokes.filter((_, index) => !drop.has(index));
  if (kept.length === target.strokes.length) {
    throw new Error("None of those strokes exist");
  }
  if (kept.length === 0) {
    return updatePage(document, pageId, (existing) => ({
      ...existing,
      elements: existing.elements.filter((element) => element.id !== elementId),
    }));
  }

  const placement = drawingPlacement(target);
  return updateTypedElement(document, pageId, elementId, "drawing", (element) =>
    refitDrawing({ ...element, strokes: kept }, placement),
  );
}

function insertAfter<T extends { id: string }>(
  values: T[],
  value: T,
  afterId?: string,
) {
  if (!afterId) return [...values, value];
  const index = values.findIndex((item) => item.id === afterId);
  if (index < 0) throw new Error(`Item ${afterId} was not found`);
  return [...values.slice(0, index + 1), value, ...values.slice(index + 1)];
}

function moveItem<T extends { id: string }>(
  values: T[],
  id: string,
  targetIndex: number,
) {
  const currentIndex = values.findIndex((item) => item.id === id);
  if (currentIndex < 0) throw new Error(`Item ${id} was not found`);
  const next = [...values];
  const [item] = next.splice(currentIndex, 1);
  // findIndex already proved the item exists; this satisfies the compiler
  // without an assertion that would outlive the reason it was safe.
  if (item === undefined) return next;
  next.splice(Math.min(targetIndex, next.length), 0, item);
  return next;
}

function requireChange<T>(next: T[], previous: T[], label: string) {
  if (next.length === previous.length)
    throw new Error(`${label} was not found`);
  return next;
}

/* ------------------------------------------------------------------ *
 * SVG sanitiser (inlined: this package is loaded as TS source by plain Node
 * in production, which resolves neither extensionless nor directory imports).
 * ------------------------------------------------------------------ */

/**
 * Sanitise agent-authored SVG before it becomes a `vector` element.
 *
 * The vector element already accepts inline SVG (up to 250 KB) and the editor
 * and render worker draw it; this is the guard that lets a model AUTHOR one:
 * no scripts, no event handlers, no foreign objects, no external references
 * (an external <image>/<use> would be a network request from every viewer),
 * a root <svg> with a usable viewBox, and a size cap. Regex-based on purpose:
 * it runs in the browser, in the agent service, and in the backend without a
 * DOM. It rejects rather than repairs anything it cannot classify.
 */

export interface SanitizedSvg {
  svg: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
}

export type SanitizeSvgResult =
  { ok: true; value: SanitizedSvg } | { ok: false; reason: string };

export const SVG_MAX_BYTES = 120_000;

const FORBIDDEN_TAGS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "handler",
  "listener",
];

function stripComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/g, "");
}

export function sanitizeSvg(input: string): SanitizeSvgResult {
  if (typeof input !== "string")
    return { ok: false, reason: "SVG must be a string" };
  let svg = stripComments(input).trim();
  if (!svg) return { ok: false, reason: "SVG is empty" };
  if (new TextEncoder().encode(svg).length > SVG_MAX_BYTES) {
    return {
      ok: false,
      reason: `SVG is larger than ${SVG_MAX_BYTES / 1000} KB; simplify it`,
    };
  }
  // Drop an XML prolog / doctype (a DOCTYPE with entities is a classic vector).
  svg = svg
    .replace(/^<\?xml[^>]*\?>\s*/i, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(svg))
    return { ok: false, reason: "DOCTYPE/ENTITY declarations are not allowed" };

  const rootMatch = svg.match(/^<svg\b([^>]*)>/i);
  if (!rootMatch)
    return {
      ok: false,
      reason: "SVG must start with a single <svg> root element",
    };
  if (!/<\/svg>\s*$/i.test(svg))
    return { ok: false, reason: "SVG must end with </svg>" };

  for (const tag of FORBIDDEN_TAGS) {
    const re = new RegExp(`<\\s*/?\\s*${tag}\\b`, "i");
    if (re.test(svg))
      return { ok: false, reason: `<${tag}> is not allowed in a drawn vector` };
  }
  if (/\son[a-z]+\s*=/i.test(svg))
    return {
      ok: false,
      reason: "Event handler attributes (on*) are not allowed",
    };
  if (/javascript\s*:/i.test(svg))
    return { ok: false, reason: "javascript: URLs are not allowed" };
  if (/\s(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) {
    return {
      ok: false,
      reason:
        "External references are not allowed; href may only point to an #id inside the SVG",
    };
  }
  if (/url\(\s*["']?(?!#)/i.test(svg)) {
    return {
      ok: false,
      reason:
        "url() may only reference an #id inside the SVG (no external images or fonts)",
    };
  }
  if (/@import|<style[^>]*src=/i.test(svg))
    return { ok: false, reason: "External stylesheets are not allowed" };

  // Root attributes: keep a viewBox we understand; synthesise one from width/height.
  const attrs = rootMatch[1] ?? "";
  const readNumber = (name: string): number | null => {
    const m = attrs.match(
      new RegExp(`\\b${name}\\s*=\\s*["']\\s*([0-9.]+)(?:px)?\\s*["']`, "i"),
    );
    return m ? Number(m[1]) : null;
  };
  let viewBox: SanitizedSvg["viewBox"] | null = null;
  const vb = attrs.match(
    /\bviewBox\s*=\s*["']\s*([-0-9.]+)[\s,]+([-0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i,
  );
  if (vb) {
    viewBox = {
      minX: Number(vb[1]),
      minY: Number(vb[2]),
      width: Number(vb[3]),
      height: Number(vb[4]),
    };
  } else {
    const w = readNumber("width");
    const h = readNumber("height");
    if (w && h) viewBox = { minX: 0, minY: 0, width: w, height: h };
  }
  if (!viewBox || !(viewBox.width > 0) || !(viewBox.height > 0)) {
    return {
      ok: false,
      reason: 'The root <svg> needs a viewBox like viewBox="0 0 400 200"',
    };
  }

  // Normalise the root: keep viewBox and xmlns, drop fixed width/height so the
  // element's box controls the size, drop anything script-adjacent.
  let root = attrs
    .replace(/\s(?:width|height)\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\sxmlns(?::\w+)?\s*=\s*["'][^"']*["']/gi, "");
  if (!/\bviewBox\s*=/i.test(root)) {
    root += ` viewBox="${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}"`;
  }
  const usesXlink = /xlink:href/i.test(svg);
  const rootTag = `<svg xmlns="http://www.w3.org/2000/svg"${usesXlink ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ""}${root.trimEnd() ? " " + root.trim() : ""}>`;
  svg = rootTag + svg.slice(rootMatch[0].length);

  return { ok: true, value: { svg, viewBox } };
}
