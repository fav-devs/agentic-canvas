/**
 * Colour grading for image and frame elements.
 *
 * The adjustments map onto a canvas `filter` string plus two composited passes
 * (warmth, vignette) that CSS filters can't express. Keeping the maths here
 * means the live canvas, the export, and the preset swatches all grade an image
 * the same way.
 */

export type CreativeImageAdjustments = {
  /** 1 = unchanged for the multiplicative three. */
  brightness: number;
  contrast: number;
  saturation: number;
  /** -1 cool … 0 neutral … 1 warm. */
  warmth: number;
  /** Gaussian blur radius in px, at the rasterised size. */
  blur: number;
  /** 0 = off … 1 = heavy corner falloff. */
  vignette: number;
};

export const NEUTRAL_ADJUSTMENTS: CreativeImageAdjustments = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  warmth: 0,
  blur: 0,
  vignette: 0,
};

export type ImageFilterPreset = {
  id: string;
  label: string;
  adjustments: CreativeImageAdjustments;
};

/** One-click looks. `original` is the identity, so it doubles as "remove". */
export const IMAGE_FILTER_PRESETS: ImageFilterPreset[] = [
  { id: "original", label: "Original", adjustments: NEUTRAL_ADJUSTMENTS },
  {
    id: "vivid",
    label: "Vivid",
    adjustments: { ...NEUTRAL_ADJUSTMENTS, saturation: 1.45, contrast: 1.12 },
  },
  {
    id: "warm",
    label: "Warm",
    adjustments: { ...NEUTRAL_ADJUSTMENTS, warmth: 0.55, brightness: 1.04 },
  },
  {
    id: "cool",
    label: "Cool",
    adjustments: { ...NEUTRAL_ADJUSTMENTS, warmth: -0.5, saturation: 1.1 },
  },
  {
    id: "mono",
    label: "Mono",
    adjustments: { ...NEUTRAL_ADJUSTMENTS, saturation: 0, contrast: 1.15 },
  },
  {
    id: "fade",
    label: "Fade",
    adjustments: {
      ...NEUTRAL_ADJUSTMENTS,
      contrast: 0.82,
      saturation: 0.78,
      brightness: 1.08,
    },
  },
  {
    id: "vintage",
    label: "Vintage",
    adjustments: {
      ...NEUTRAL_ADJUSTMENTS,
      warmth: 0.4,
      saturation: 0.72,
      contrast: 0.92,
      vignette: 0.35,
    },
  },
  {
    id: "noir",
    label: "Noir",
    adjustments: {
      ...NEUTRAL_ADJUSTMENTS,
      saturation: 0,
      contrast: 1.45,
      brightness: 0.94,
      vignette: 0.45,
    },
  },
  {
    id: "dreamy",
    label: "Dreamy",
    adjustments: {
      ...NEUTRAL_ADJUSTMENTS,
      blur: 2.5,
      brightness: 1.06,
      saturation: 1.15,
    },
  },
];

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The part of a grade a canvas `filter` can do. Returns "none" when nothing
 * applies, so callers can skip the whole pass.
 */
export function cssFilterString(adjustments: CreativeImageAdjustments) {
  const parts: string[] = [];
  if (adjustments.brightness !== 1) {
    parts.push(`brightness(${round(adjustments.brightness)})`);
  }
  if (adjustments.contrast !== 1) {
    parts.push(`contrast(${round(adjustments.contrast)})`);
  }
  if (adjustments.saturation !== 1) {
    parts.push(`saturate(${round(adjustments.saturation)})`);
  }
  if (adjustments.blur > 0) parts.push(`blur(${round(adjustments.blur)}px)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

/** Nothing to render — lets the pipeline skip rasterising entirely. */
export function isNeutralAdjustments(adjustments: CreativeImageAdjustments) {
  return (
    adjustments.brightness === 1 &&
    adjustments.contrast === 1 &&
    adjustments.saturation === 1 &&
    adjustments.warmth === 0 &&
    adjustments.blur === 0 &&
    adjustments.vignette === 0
  );
}

/** Which preset a grade corresponds to, for highlighting the active swatch. */
export function matchImageFilterPreset(adjustments: CreativeImageAdjustments) {
  return IMAGE_FILTER_PRESETS.find((preset) =>
    (
      Object.keys(NEUTRAL_ADJUSTMENTS) as Array<keyof CreativeImageAdjustments>
    ).every((key) => preset.adjustments[key] === adjustments[key]),
  )?.id;
}

/** Overlay colour for the warmth pass; null when neutral. */
export function warmthOverlay(warmth: number) {
  if (warmth === 0) return null;
  return {
    color: warmth > 0 ? "#FF8A3D" : "#3D8AFF",
    alpha: Math.min(0.45, Math.abs(warmth) * 0.4),
  };
}
