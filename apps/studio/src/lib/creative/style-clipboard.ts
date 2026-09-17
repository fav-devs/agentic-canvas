import type { CreativeElement } from "@/lib/creative/document";

export type CreativeStyleClipboard = {
  type: CreativeElement["type"];
  opacity: number;
  changes: Record<string, unknown>;
};

/** Visual properties only. Content, media, crop, position and size stay put. */
export function copyCreativeElementStyle(
  element: CreativeElement,
): CreativeStyleClipboard {
  let changes: Record<string, unknown> = {};
  switch (element.type) {
    case "text":
      changes = {
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        fill: element.fill,
        textAlign: element.textAlign,
        lineHeight: element.lineHeight,
        letterSpacing: element.letterSpacing,
        textTransform: element.textTransform,
        shadow: element.shadow,
        outline: element.outline,
        highlight: element.highlight,
      };
      break;
    case "shape":
      changes = {
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
        radius: element.radius,
      };
      break;
    case "image":
      changes = {
        adjustments: element.adjustments,
        effect: element.effect,
        edgeEffect: element.edgeEffect,
        radius: element.radius,
        shadow: element.shadow,
      };
      break;
    case "frame":
      changes = {
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
        radius: element.radius,
        adjustments: element.adjustments,
        effect: element.effect,
        edgeEffect: element.edgeEffect,
      };
      break;
    case "vector":
      changes = { fill: element.fill };
      break;
    case "tag":
      changes = {
        fontFamily: element.fontFamily,
        fontSize: element.fontSize,
        fontWeight: element.fontWeight,
        fill: element.fill,
        letterSpacing: element.letterSpacing,
        textTransform: element.textTransform,
        style: element.style,
      };
      break;
    case "drawing": {
      const stroke = element.strokes[0];
      changes = {
        smoothing: element.smoothing,
        ...(stroke
          ? {
              brush: stroke.brush,
              color: stroke.color,
              width: stroke.width,
              opacity: stroke.opacity,
            }
          : {}),
      };
      break;
    }
    case "widget":
      break;
  }
  return {
    type: element.type,
    opacity: element.opacity,
    changes: structuredClone(changes),
  };
}
