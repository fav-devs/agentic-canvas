import type { CreativeElement } from "@/lib/creative/document";

export type CreativeShapeKind = Extract<
  CreativeElement,
  { type: "shape" }
>["shape"];

export const CREATIVE_SHAPES = [
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
] as const satisfies readonly CreativeShapeKind[];

export const CREATIVE_SHAPE_LABELS: Record<CreativeShapeKind, string> = {
  rectangle: "Rectangle",
  ellipse: "Circle",
  triangle: "Triangle",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  octagon: "Octagon",
  star: "Star",
  heart: "Heart",
  cross: "Cross",
  "arrow-right": "Arrow",
  "speech-bubble": "Speech bubble",
  cloud: "Cloud",
  burst: "Burst",
};

const round = (value: number) => Math.round(value * 100) / 100;

function radialPath(
  width: number,
  height: number,
  points: number,
  innerRatio = 1,
) {
  const coordinates = Array.from(
    { length: innerRatio === 1 ? points : points * 2 },
    (_, index) => {
      const count = innerRatio === 1 ? points : points * 2;
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const ratio = innerRatio === 1 || index % 2 === 0 ? 1 : innerRatio;
      return [
        width / 2 + Math.cos(angle) * (width / 2) * ratio,
        height / 2 + Math.sin(angle) * (height / 2) * ratio,
      ];
    },
  );
  return `${coordinates
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${round(x ?? 0)},${round(y ?? 0)}`,
    )
    .join(" ")} Z`;
}

/** A normalized SVG path shared by canvas rendering and browser previews. */
export function shapeSvgPath(
  shape: CreativeShapeKind,
  width: number,
  height: number,
) {
  switch (shape) {
    case "triangle":
      return `M${width / 2},0 L${width},${height} L0,${height} Z`;
    case "diamond":
      return `M${width / 2},0 L${width},${height / 2} L${width / 2},${height} L0,${height / 2} Z`;
    case "pentagon":
      return radialPath(width, height, 5);
    case "hexagon":
      return radialPath(width, height, 6);
    case "octagon":
      return radialPath(width, height, 8);
    case "star":
      return radialPath(width, height, 5, 0.44);
    case "burst":
      return radialPath(width, height, 12, 0.72);
    case "heart":
      return `M${width / 2},${height} C${width * 0.38},${height * 0.82} 0,${height * 0.58} 0,${height * 0.3} C0,${height * 0.04} ${width * 0.32},${-height * 0.08} ${width / 2},${height * 0.18} C${width * 0.68},${-height * 0.08} ${width},${height * 0.04} ${width},${height * 0.3} C${width},${height * 0.58} ${width * 0.62},${height * 0.82} ${width / 2},${height} Z`;
    case "cross":
      return `M${width * 0.34},0 L${width * 0.66},0 L${width * 0.66},${height * 0.34} L${width},${height * 0.34} L${width},${height * 0.66} L${width * 0.66},${height * 0.66} L${width * 0.66},${height} L${width * 0.34},${height} L${width * 0.34},${height * 0.66} L0,${height * 0.66} L0,${height * 0.34} L${width * 0.34},${height * 0.34} Z`;
    case "arrow-right":
      return `M0,${height * 0.3} L${width * 0.58},${height * 0.3} L${width * 0.58},0 L${width},${height / 2} L${width * 0.58},${height} L${width * 0.58},${height * 0.7} L0,${height * 0.7} Z`;
    case "speech-bubble":
      return `M${width * 0.12},0 L${width * 0.88},0 Q${width},0 ${width},${height * 0.16} L${width},${height * 0.68} Q${width},${height * 0.84} ${width * 0.88},${height * 0.84} L${width * 0.38},${height * 0.84} L${width * 0.18},${height} L${width * 0.23},${height * 0.84} L${width * 0.12},${height * 0.84} Q0,${height * 0.84} 0,${height * 0.68} L0,${height * 0.16} Q0,0 ${width * 0.12},0 Z`;
    case "cloud":
      return `M${width * 0.2},${height * 0.82} C${width * 0.02},${height * 0.82} ${-width * 0.03},${height * 0.58} ${width * 0.12},${height * 0.46} C${width * 0.1},${height * 0.22} ${width * 0.38},${height * 0.1} ${width * 0.53},${height * 0.28} C${width * 0.68},${height * 0.08} ${width * 0.96},${height * 0.24} ${width * 0.91},${height * 0.49} C${width * 1.08},${height * 0.58} ${width},${height * 0.82} ${width * 0.82},${height * 0.82} Z`;
    case "ellipse":
      return `M0,${height / 2} A${width / 2},${height / 2} 0 1 0 ${width},${height / 2} A${width / 2},${height / 2} 0 1 0 0,${height / 2} Z`;
    default:
      return `M0,0 L${width},0 L${width},${height} L0,${height} Z`;
  }
}
