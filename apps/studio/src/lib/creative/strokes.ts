/**
 * Freehand stroke geometry: turning the points a pointer produced into
 * something drawable, and answering "did the eraser touch this stroke?".
 *
 * Two rendering strategies live here, because brushes genuinely differ:
 *
 * - Pen, marker, pencil and highlighter are *stroked centre lines*. One path,
 *   one width, and the browser draws the ink.
 * - Paint has to vary in width along its length, which a stroked path cannot
 *   do. It is built as a closed *outline* instead — the two sides of the nib
 *   walked out and back — and filled.
 *
 * All of it is pure and deterministic, including the pencil's grain, so the
 * live preview and the committed stroke can never disagree about what a stroke
 * looks like.
 */

import type {
  CreativeBrush,
  CreativeDrawingStroke,
} from "@/lib/creative/document";

export type BrushPreset = {
  label: string;
  /** What the size slider means for this brush, in document px. */
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  defaultOpacity: number;
  lineCap: "round" | "butt";
  lineJoin: "round" | "miter";
  /** Filled outline with a varying nib rather than a stroked centre line. */
  outline: boolean;
  /** Grain, as a fraction of stroke width. */
  jitter: number;
  /**
   * Highlighter ink has to sit *under* what it marks up rather than covering
   * it, which is what multiply gets us.
   */
  blend?: "multiply";
  hint: string;
};

export const BRUSH_PRESETS: Record<CreativeBrush, BrushPreset> = {
  pen: {
    label: "Pen",
    defaultWidth: 8,
    minWidth: 1,
    maxWidth: 80,
    defaultOpacity: 1,
    lineCap: "round",
    lineJoin: "round",
    outline: false,
    jitter: 0,
    hint: "Clean, even line",
  },
  marker: {
    label: "Marker",
    defaultWidth: 22,
    minWidth: 4,
    maxWidth: 160,
    defaultOpacity: 0.92,
    lineCap: "round",
    lineJoin: "round",
    outline: false,
    jitter: 0,
    hint: "Thick and confident",
  },
  pencil: {
    label: "Pencil",
    defaultWidth: 5,
    minWidth: 1,
    maxWidth: 40,
    defaultOpacity: 0.85,
    lineCap: "round",
    lineJoin: "round",
    outline: false,
    jitter: 0.22,
    hint: "Slight grain",
  },
  highlighter: {
    label: "Highlighter",
    defaultWidth: 34,
    minWidth: 8,
    maxWidth: 200,
    defaultOpacity: 0.35,
    lineCap: "butt",
    lineJoin: "miter",
    outline: false,
    jitter: 0,
    blend: "multiply",
    hint: "Translucent, marks up",
  },
  paint: {
    label: "Paint",
    defaultWidth: 26,
    minWidth: 4,
    maxWidth: 200,
    defaultOpacity: 1,
    lineCap: "round",
    lineJoin: "round",
    outline: true,
    jitter: 0,
    hint: "Tapers with speed",
  },
};

export const BRUSH_ORDER: CreativeBrush[] = [
  "pen",
  "marker",
  "pencil",
  "highlighter",
  "paint",
];

type Point = { x: number; y: number };

/** Flat `[x, y, …]` to points, dropping a trailing odd coordinate. */
export function toPoints(flat: number[]): Point[] {
  const points: Point[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    points.push({ x: flat[index] ?? 0, y: flat[index + 1] ?? 0 });
  }
  return points;
}

export function toFlat(points: Point[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

/** Trim to 2 decimals — a stroke is hundreds of points and we autosave them. */
function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Drop points that add nothing, so a slow drag doesn't store 3000 samples of
 * the same 200px line. Endpoints are always kept; everything else must be at
 * least `tolerance` from the previously kept point.
 */
export function simplifyStrokePoints(
  flat: number[],
  tolerance = 1.4,
): number[] {
  const points = toPoints(flat);
  if (points.length <= 2) return toFlat(points).map(round);

  const kept: Point[] = [];
  const first = points[0];
  if (!first) return [];
  kept.push(first);

  const minimum = tolerance * tolerance;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const previous = kept[kept.length - 1];
    if (!point || !previous) continue;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    if (dx * dx + dy * dy >= minimum) kept.push(point);
  }

  const last = points[points.length - 1];
  if (last) kept.push(last);
  return toFlat(kept).map(round);
}

/**
 * Cap a stroke at the schema's limit by thinning it evenly rather than
 * truncating it — a clipped stroke would end in mid-air.
 */
export function capStrokePoints(
  flat: number[],
  maxCoordinates = 8000,
): number[] {
  if (flat.length <= maxCoordinates) return flat;
  const points = toPoints(flat);
  const target = Math.floor(maxCoordinates / 2);
  const step = points.length / target;
  const thinned: Point[] = [];
  for (let index = 0; index < target - 1; index += 1) {
    const point = points[Math.floor(index * step)];
    if (point) thinned.push(point);
  }
  const last = points[points.length - 1];
  if (last) thinned.push(last);
  return toFlat(thinned);
}

/** Deterministic ±1 from a point index, so grain is stable across renders. */
function grain(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

/**
 * Roughen a stroke so a pencil reads as graphite rather than ink. Applied at
 * render time from the stored points, so the grain costs nothing to store.
 */
export function applyGrain(points: Point[], amount: number): Point[] {
  if (amount <= 0) return points;
  return points.map((point, index) => ({
    x: point.x + grain(index, 1) * amount,
    y: point.y + grain(index, 2) * amount,
  }));
}

/**
 * A smoothed centre line as SVG path data.
 *
 * Catmull-Rom through the points, converted to cubic béziers. `smoothing` 0
 * gives the raw polyline; 1 gives fully rounded corners.
 */
export function centerlinePath(points: Point[], smoothing = 0.55): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (!first) return "";

  // A single sample is a dot. A hair-length segment with a round cap renders
  // as one; a zero-length subpath does not reliably draw anything.
  if (points.length === 1) {
    return `M ${round(first.x)} ${round(first.y)} l 0.01 0`;
  }

  const k = Math.max(0, Math.min(1, smoothing)) / 6;
  let path = `M ${round(first.x)} ${round(first.y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const start = points[index];
    const end = points[index + 1];
    const next = points[index + 2] ?? points[index + 1];
    if (!previous || !start || !end || !next) continue;

    const c1x = start.x + (end.x - previous.x) * k;
    const c1y = start.y + (end.y - previous.y) * k;
    const c2x = end.x - (next.x - start.x) * k;
    const c2y = end.y - (next.y - start.y) * k;
    path += ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(
      end.x,
    )} ${round(end.y)}`;
  }

  return path;
}

/**
 * Per-point nib radius for the paint brush: thin at both ends, and thinner
 * where the pointer moved fast — the two things that make a brush stroke look
 * brushed instead of extruded.
 */
export function taperProfile(points: Point[], width: number): number[] {
  const radius = width / 2;
  if (points.length === 0) return [];
  if (points.length === 1) return [radius];

  const speeds: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1] ?? points[index];
    if (!current || !previous) {
      speeds.push(0);
      continue;
    }
    speeds.push(Math.hypot(current.x - previous.x, current.y - previous.y));
  }
  const fastest = Math.max(1, ...speeds);

  // Ends taper over a fixed fraction of the stroke so short marks still show
  // a point rather than being uniformly thin.
  const rampLength = Math.max(1, Math.floor(points.length * 0.18));

  return points.map((_, index) => {
    const fromStart = Math.min(1, index / rampLength);
    const fromEnd = Math.min(1, (points.length - 1 - index) / rampLength);
    const ends = Math.min(fromStart, fromEnd);
    // Fast strokes thin to 55% at most; slow strokes stay full width.
    const speed = 1 - 0.45 * ((speeds[index] ?? 0) / fastest);
    return Math.max(radius * 0.12, radius * speed * (0.35 + 0.65 * ends));
  });
}

/** Unit normals per point, averaged across the two adjoining segments. */
function normals(points: Point[]): Point[] {
  return points.map((point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1] ?? point;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
  });
}

/**
 * A closed, fillable outline for a variable-width stroke: up one side of the
 * nib and back down the other.
 */
export function outlinePath(
  points: Point[],
  width: number,
  smoothing = 0.55,
): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (!first) return "";

  if (points.length === 1) {
    // A dab: a circle of the nib's radius, as two arcs.
    const r = Math.max(0.25, width / 2);
    return (
      `M ${round(first.x - r)} ${round(first.y)} ` +
      `a ${round(r)} ${round(r)} 0 1 0 ${round(r * 2)} 0 ` +
      `a ${round(r)} ${round(r)} 0 1 0 ${round(-r * 2)} 0 Z`
    );
  }

  const radii = taperProfile(points, width);
  const unit = normals(points);
  const left: Point[] = [];
  const right: Point[] = [];

  points.forEach((point, index) => {
    const normal = unit[index] ?? { x: 0, y: 0 };
    const radius = radii[index] ?? width / 2;
    left.push({
      x: point.x + normal.x * radius,
      y: point.y + normal.y * radius,
    });
    right.push({
      x: point.x - normal.x * radius,
      y: point.y - normal.y * radius,
    });
  });

  const forward = centerlinePath(left, smoothing);
  const back = centerlinePath(right.reverse(), smoothing);
  // Replace the return leg's "M" with an "L" so the two sides form one closed
  // region instead of two disjoint subpaths.
  return `${forward} L${back.slice(1)} Z`;
}

/** The path data and paint settings a stroke should be drawn with. */
export function strokeGeometry(
  stroke: Pick<CreativeDrawingStroke, "brush" | "width" | "points">,
  smoothing: number,
) {
  const preset = BRUSH_PRESETS[stroke.brush];
  const raw = toPoints(stroke.points);
  const points = applyGrain(raw, preset.jitter * stroke.width);

  if (preset.outline) {
    return {
      path: outlinePath(points, stroke.width, smoothing),
      filled: true as const,
      preset,
    };
  }
  return {
    path: centerlinePath(points, smoothing),
    filled: false as const,
    preset,
  };
}

/** Squared distance from a point to a segment, for eraser hit-testing. */
function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return (point.x - a.x) ** 2 + (point.y - a.y) ** 2;
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  );
  const projectedX = a.x + t * dx;
  const projectedY = a.y + t * dy;
  return (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;
}

/**
 * Whether an eraser of `radius` centred at `point` touches this stroke. Tests
 * the stroke's own width too, so a fat marker is caught from further away than
 * a thin pen — which is what the eye expects.
 *
 * `point`, `radius` and the stroke's points must all be in the same space.
 */
export function strokeHit(
  stroke: Pick<CreativeDrawingStroke, "width" | "points">,
  point: Point,
  radius: number,
): boolean {
  const points = toPoints(stroke.points);
  const reach = radius + stroke.width / 2;
  const reachSquared = reach * reach;
  if (points.length === 1) {
    const only = points[0];
    if (!only) return false;
    return (point.x - only.x) ** 2 + (point.y - only.y) ** 2 <= reachSquared;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    if (distanceToSegment(point, a, b) <= reachSquared) return true;
  }
  return false;
}

/** Indices of every stroke the eraser touches, for one remove command. */
export function strokesHit(
  strokes: Pick<CreativeDrawingStroke, "width" | "points">[],
  point: Point,
  radius: number,
): number[] {
  const hits: number[] = [];
  strokes.forEach((stroke, index) => {
    if (strokeHit(stroke, point, radius)) hits.push(index);
  });
  return hits;
}
