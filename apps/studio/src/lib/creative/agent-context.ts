import type {
  CreativeDocument,
  CreativeElement,
} from "@/lib/creative/document";

/**
 * A compact, human-readable outline of the design open in the editor, for the
 * Studio agent's context.
 *
 * The agent runs on the backend and used to read designs from the database via
 * get_design — but the editor is the source of truth for the OPEN design, and a
 * fresh/local draft may not be in the database at all, so the agent went blind
 * ("it's not on the server"). Sending this snapshot lets the agent read exactly
 * what the user is looking at, saved or not, and use these real page/element ids
 * to edit — without ever touching the server.
 *
 * Kept as a terse text outline, not full JSON: it must be cheap enough to send
 * on every message. Text is truncated and heavy fields (svg, asset urls) are
 * reduced to a marker.
 */

const r = (n: number) => Math.round(n);
const trunc = (s: string, max = 100) =>
  s.length > max
    ? `${s.slice(0, max).replace(/\s+/g, " ").trim()}…`
    : s.replace(/\s+/g, " ").trim();

/** True when any image grade has moved off its neutral default. */
function isGraded(a?: {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
  blur?: number;
  vignette?: number;
}): boolean {
  if (!a) return false;
  return (
    (a.brightness ?? 1) !== 1 ||
    (a.contrast ?? 1) !== 1 ||
    (a.saturation ?? 1) !== 1 ||
    (a.warmth ?? 0) !== 0 ||
    (a.blur ?? 0) !== 0 ||
    (a.vignette ?? 0) !== 0
  );
}

function describeElement(el: CreativeElement): string {
  const id = el.id;
  const box = `@${r(el.x)},${r(el.y)} ${r(el.width)}×${r(el.height)}`;
  // Styling + transforms the agent must SEE to match, copy or edit them —
  // rotation, corner radius, borders, effects, opacity… not just the box.
  const s: string[] = [];
  if (el.rotation) s.push(`rot ${r(el.rotation)}°`);
  if (typeof el.opacity === "number" && el.opacity !== 1)
    s.push(`opacity ${r(el.opacity * 100)}%`);
  if (el.locked) s.push("locked");
  if (el.visible === false) s.push("hidden");

  let line: string;
  switch (el.type) {
    case "text":
      line = `text [${id}] "${trunc(el.text)}" ${box} ${r(el.fontSize)}px ${el.fill}`;
      if (el.textAlign && el.textAlign !== "left") s.push(el.textAlign);
      if (el.fontFamily) s.push(el.fontFamily);
      if (el.fontWeight && el.fontWeight !== "400")
        s.push(`weight ${el.fontWeight}`);
      if (el.textTransform && el.textTransform !== "none")
        s.push(el.textTransform);
      if (el.shadow?.enabled) s.push("shadow");
      if (el.highlight?.enabled) s.push("highlight");
      if (el.outline?.enabled) s.push("outline");
      break;
    case "shape":
      line = `shape [${id}] ${el.shape} ${box} fill ${el.fill}`;
      if (el.stroke && el.stroke !== "transparent" && el.strokeWidth)
        s.push(`stroke ${el.stroke} ${r(el.strokeWidth)}px`);
      if (el.radius) s.push(`radius ${r(el.radius)}`);
      break;
    case "frame":
      line = `frame [${id}] ${el.shape} (${el.asset ? "has photo" : "empty"}) ${box}`;
      if (el.radius) s.push(`radius ${r(el.radius)}`);
      if (el.stroke && el.stroke !== "transparent" && el.strokeWidth)
        s.push(`border ${el.stroke} ${r(el.strokeWidth)}px`);
      if (el.effect?.enabled) s.push(`effect ${el.effect.type}`);
      if (isGraded(el.adjustments)) s.push("graded");
      break;
    case "image":
      line = `image [${id}] ${box}`;
      s.unshift(el.asset ? "has photo" : "no photo");
      if (el.radius) s.push(`radius ${r(el.radius)}`);
      if (el.fit && el.fit !== "cover") s.push(`fit ${el.fit}`);
      if (el.flipX) s.push("flipX");
      if (el.flipY) s.push("flipY");
      if (el.edgeEffect?.enabled)
        s.push(
          `border ${el.edgeEffect.style} ${el.edgeEffect.color} ${r(el.edgeEffect.width)}px`,
        );
      if (el.effect?.enabled) s.push(`effect ${el.effect.type}`);
      if (el.shadow?.enabled) s.push("shadow");
      if (isGraded(el.adjustments)) s.push("graded");
      break;
    case "vector":
      line = `graphic [${id}] ${el.source?.provider ?? "svg"} ${box}`;
      if (el.recolorable) s.push(`fill ${el.fill}`);
      break;
    case "widget":
      line = `pager-dots [${id}] ${box}`;
      break;
    case "tag":
      line = `tag [${id}] ${el.variant} "${trunc(el.text, 40)}" ${box}`;
      break;
    case "drawing":
      line = `drawing [${id}] (${el.strokes.length} strokes) ${box}`;
      break;
    default:
      line = `${(el as { type: string }).type} [${id}] ${box}`;
  }
  return s.length ? `${line} · ${s.join(", ")}` : line;
}

export function summarizeCreativeDocumentForAgent(
  doc: CreativeDocument,
): string {
  const lines: string[] = [
    `Design "${doc.title}" — ${doc.canvas.width}×${doc.canvas.height}, ${doc.pages.length} slide(s).`,
  ];
  doc.pages.forEach((page, index) => {
    const bg = page.backgroundEffect
      ? `${page.background} + ${page.backgroundEffect.type} pattern`
      : page.background;
    lines.push(`Slide ${index + 1} [${page.id}] bg ${bg}:`);
    if (page.elements.length === 0) {
      lines.push("  (empty)");
    } else {
      for (const el of page.elements) lines.push(`  • ${describeElement(el)}`);
    }
  });
  return lines.join("\n");
}
