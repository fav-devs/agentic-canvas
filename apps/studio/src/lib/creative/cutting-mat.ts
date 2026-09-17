/**
 * Cutting-mat background.
 *
 * Geometry follows the self-healing-mat convention: a measured grid with three
 * line weights, ruler ticks in the margin, numbers on all four edges, quarter
 * radius arcs from the bottom-left origin, and dashed angle guides.
 *
 * One deliberate departure from a standalone mat generator: a mat there sets
 * the image size, whereas here the slide size is already fixed. So the user
 * picks how many units span the slide and the rest — row count, pixels per
 * unit, margin — is derived to fill it exactly. That keeps the mat looking
 * right on portrait, square, or story without anyone doing arithmetic.
 */

export type CuttingMatUnit = "cm" | "in";

export type CuttingMatPreset = {
  id: string;
  name: string;
  background: string;
  line: string;
};

/** The mat colourways, kept close to the ones people recognise. */
export const CUTTING_MAT_PRESETS: CuttingMatPreset[] = [
  { id: "classic", name: "Classic", background: "#00332A", line: "#E5E55A" },
  {
    id: "monochrome",
    name: "Monochrome",
    background: "#000000",
    line: "#7F7F7F",
  },
  { id: "neutral", name: "Neutral", background: "#5A5A5A", line: "#C5C5C5" },
  { id: "dark-red", name: "Dark red", background: "#3D0000", line: "#FF2E2E" },
  { id: "blue", name: "Blue", background: "#002F9E", line: "#EDEEFD" },
  {
    id: "warm-orange",
    name: "Warm orange",
    background: "#FF3F0A",
    line: "#000000",
  },
  { id: "pink", name: "Pink", background: "#CA6395", line: "#FFFFFF" },
  { id: "teal", name: "Teal", background: "#095848", line: "#30F8AB" },
];

export type CuttingMatSettings = {
  unit: CuttingMatUnit;
  /** Units spanning the slide; everything else is derived from this. */
  columns: number;
  background: string;
  line: string;
  showGrid: boolean;
  /** 0…1, applied to the minor/medium grid only — majors stay legible. */
  gridOpacity: number;
  showEdgeTicks: boolean;
  showLabels: boolean;
  fontFamily: string;
  showRadii: boolean;
  radii: number[];
  showRadiusTicks: boolean;
  /** Degrees between radius ticks. */
  tickSpacing: number;
  showAngles: boolean;
};

export const DEFAULT_CUTTING_MAT: CuttingMatSettings = {
  unit: "cm",
  columns: 50,
  background: "#00332A",
  line: "#E5E55A",
  showGrid: true,
  gridOpacity: 1,
  showEdgeTicks: true,
  showLabels: true,
  fontFamily: "Geist Mono",
  showRadii: true,
  radii: [10, 20, 30],
  showRadiusTicks: true,
  tickSpacing: 5,
  showAngles: true,
};

/** Angles the mat marks out, in degrees from the bottom edge. */
export const CUTTING_MAT_ANGLES = [15, 30, 45, 60];

export type CuttingMatMetrics = {
  /** Pixels per minor division. */
  step: number;
  /** Margin holding the rulers and numbers. */
  margin: number;
  columns: number;
  rows: number;
  /** Every Nth division is a major line. */
  major: number;
  /** Every Nth division is a medium line (0 when the unit has none). */
  medium: number;
  /** Multiplier from division index to the printed number. */
  labelScale: number;
};

/**
 * Fit the mat to a slide: the requested columns span the width including
 * margins, and rows follow from whatever height is left.
 */
export function cuttingMatMetrics(
  canvasWidth: number,
  canvasHeight: number,
  settings: Pick<CuttingMatSettings, "unit" | "columns">,
): CuttingMatMetrics {
  const inches = settings.unit === "in";
  // Inches are divided in halves, so a division is 1.27x a centimetre's.
  const baseStep = 20 * (inches ? 1.27 : 1);
  const baseMargin = 50;
  const columns = Math.max(2, Math.round(settings.columns));

  const scale = canvasWidth / (columns * baseStep + baseMargin * 2);
  const step = baseStep * scale;
  const margin = baseMargin * scale;
  const rows = Math.max(
    1,
    Math.round((canvasHeight - margin * 2) / Math.max(step, 0.0001)),
  );

  return {
    step,
    margin,
    columns,
    rows,
    major: inches ? 10 : 5,
    medium: inches ? 5 : 0,
    // Half-inch divisions print as 0.5 apart; centimetres print 1:1.
    labelScale: inches ? 0.5 : 1,
  };
}

/** Number shown against a division index. */
export function cuttingMatLabel(index: number, labelScale: number) {
  const value = index * labelScale;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Importance of a division, which drives colour, weight, and tick length. */
export function divisionRank(
  index: number,
  metrics: Pick<CuttingMatMetrics, "major" | "medium">,
): "major" | "medium" | "minor" {
  if (index % metrics.major === 0) return "major";
  if (metrics.medium > 0 && index % metrics.medium === 0) return "medium";
  return "minor";
}

function withAlpha(color: string, alpha: number) {
  if (alpha >= 1) return color;
  const clamped = Math.max(0, Math.min(1, alpha));
  const hex = color.trim().replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return color;
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((character) => character + character)
          .join("")
      : hex;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(red + green + blue)) return color;
  return `rgba(${red}, ${green}, ${blue}, ${clamped})`;
}

/** Paint a full mat across a canvas context of `width` x `height`. */
export function drawCuttingMat(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: CuttingMatSettings,
) {
  const metrics = cuttingMatMetrics(width, height, settings);
  const { step, margin, columns, rows } = metrics;
  const left = margin;
  const top = margin;
  const right = left + columns * step;
  const bottom = top + rows * step;

  const majorColor = settings.line;
  const mediumColor = withAlpha(settings.line, 0.55 * settings.gridOpacity);
  const minorColor = withAlpha(settings.line, 0.3 * settings.gridOpacity);
  const unitScale = step / 20;
  const fontSize = Math.max(7, 10 * unitScale);

  context.save();
  context.fillStyle = settings.background;
  context.fillRect(0, 0, width, height);
  context.lineCap = "butt";

  const strokeFor = (rank: ReturnType<typeof divisionRank>) => {
    if (rank === "major") {
      return { color: majorColor, lineWidth: Math.max(0.6, unitScale) };
    }
    if (rank === "medium") {
      return { color: mediumColor, lineWidth: Math.max(0.5, 0.75 * unitScale) };
    }
    return { color: minorColor, lineWidth: Math.max(0.4, 0.5 * unitScale) };
  };

  // ---- grid -------------------------------------------------------------
  for (let index = 0; index <= columns; index += 1) {
    const rank = divisionRank(index, metrics);
    if (!settings.showGrid && rank !== "major") continue;
    const { color, lineWidth } = strokeFor(rank);
    const x = left + index * step;
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
  }
  for (let index = 0; index <= rows; index += 1) {
    // Rows are numbered from the bottom, like a mat's own scale.
    const rank = divisionRank(rows - index, metrics);
    if (!settings.showGrid && rank !== "major") continue;
    const { color, lineWidth } = strokeFor(rank);
    const y = top + index * step;
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
  }

  // ---- radius arcs ------------------------------------------------------
  if (settings.showRadii) {
    context.strokeStyle = minorColor;
    for (const radius of settings.radii) {
      const r = radius * step;
      if (r <= 0) continue;
      context.beginPath();
      context.lineWidth = Math.max(0.5, unitScale);
      context.arc(left, bottom, r, -Math.PI / 2, 0);
      context.stroke();

      if (settings.showRadiusTicks && settings.tickSpacing > 0) {
        const count = Math.floor(90 / settings.tickSpacing);
        for (let tick = 0; tick <= count; tick += 1) {
          const angle = (tick * settings.tickSpacing * Math.PI) / 180;
          const inner = r - 4 * unitScale;
          const outer = r + 4 * unitScale;
          context.beginPath();
          context.lineWidth = Math.max(0.4, 0.5 * unitScale);
          context.moveTo(
            left + Math.cos(angle) * inner,
            bottom - Math.sin(angle) * inner,
          );
          context.lineTo(
            left + Math.cos(angle) * outer,
            bottom - Math.sin(angle) * outer,
          );
          context.stroke();
        }
      }
    }
  }

  // ---- angle guides -----------------------------------------------------
  if (settings.showAngles) {
    context.save();
    context.setLineDash([3 * unitScale, 2 * unitScale]);
    context.strokeStyle = minorColor;
    context.lineWidth = Math.max(0.5, unitScale);
    for (const angle of CUTTING_MAT_ANGLES) {
      const radians = (angle * Math.PI) / 180;
      const tangent = Math.tan(radians);
      // Stop at whichever edge the ray reaches first.
      const xAtTop = left + (bottom - top) / tangent;
      const yAtRight = bottom - tangent * (right - left);
      const endX = xAtTop >= left && xAtTop <= right ? xAtTop : right;
      const endY = xAtTop >= left && xAtTop <= right ? top : yAtRight;
      context.beginPath();
      context.moveTo(left, bottom);
      context.lineTo(endX, endY);
      context.stroke();
    }
    context.restore();

    if (settings.showLabels) {
      context.font = `${fontSize}px "${settings.fontFamily}", monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const reach = Math.min(right - left, bottom - top) * 0.3;
      for (const angle of CUTTING_MAT_ANGLES) {
        const radians = (angle * Math.PI) / 180;
        const x = left + Math.cos(radians) * reach;
        const y = bottom - Math.sin(radians) * reach;
        context.fillStyle = settings.background;
        context.fillRect(
          x - 13 * unitScale,
          y - 7 * unitScale,
          26 * unitScale,
          14 * unitScale,
        );
        context.fillStyle = majorColor;
        context.fillText(`${angle}°`, x, y);
      }
    }
  }

  // ---- ruler ticks in the margin ---------------------------------------
  if (settings.showEdgeTicks) {
    context.strokeStyle = majorColor;
    context.lineWidth = Math.max(0.4, 0.5 * unitScale);
    const reachFor = (rank: ReturnType<typeof divisionRank>) =>
      (rank === "major" ? 20 : rank === "medium" ? 15 : 10) * unitScale;

    for (let index = 0; index <= columns; index += 1) {
      const x = left + index * step;
      const reach = reachFor(divisionRank(index, metrics));
      context.beginPath();
      context.moveTo(x, top - reach);
      context.lineTo(x, top);
      context.moveTo(x, bottom);
      context.lineTo(x, bottom + reach);
      context.stroke();
    }
    for (let index = 0; index <= rows; index += 1) {
      const y = top + index * step;
      const reach = reachFor(divisionRank(rows - index, metrics));
      context.beginPath();
      context.moveTo(left - reach, y);
      context.lineTo(left, y);
      context.moveTo(right, y);
      context.lineTo(right + reach, y);
      context.stroke();
    }
  }

  // ---- edge numbers -----------------------------------------------------
  if (settings.showLabels) {
    context.fillStyle = majorColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let index = 0; index <= columns; index += 1) {
      const rank = divisionRank(index, metrics);
      if (rank === "minor") continue;
      context.font = `${rank === "medium" ? fontSize * 0.8 : fontSize}px "${settings.fontFamily}", monospace`;
      const x = left + index * step;
      const text = cuttingMatLabel(index, metrics.labelScale);
      context.fillText(text, x, top - margin * 0.45);
      context.fillText(text, x, bottom + margin * 0.45);
    }
    for (let index = 0; index <= rows; index += 1) {
      const value = rows - index;
      const rank = divisionRank(value, metrics);
      if (rank === "minor") continue;
      context.font = `${rank === "medium" ? fontSize * 0.8 : fontSize}px "${settings.fontFamily}", monospace`;
      const y = top + index * step;
      const text = cuttingMatLabel(value, metrics.labelScale);
      context.fillText(text, left - margin * 0.45, y);
      context.fillText(text, right + margin * 0.45, y);
    }
  }

  context.restore();
}
