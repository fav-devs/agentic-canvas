import type {
  CreativeAsciiEffect,
  CreativeDitherEffect,
} from "@/lib/creative/document";

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

export const ASCII_CHARSETS: Record<CreativeAsciiEffect["charset"], string> = {
  classic: " .:-=+*#%@",
  blocks: " ░▒▓█",
  binary: " ..::01",
  dots: " ·∙•●",
  braille: " ⠁⠉⠋⠛⠟⠿⡿⣿",
};

/**
 * Render a source image as a grid of glyphs. Kept browser-only because it uses
 * the native canvas text engine, which also makes preview and export identical.
 */
export function applyAsciiEffect(
  source: CanvasImageSource,
  width: number,
  height: number,
  effect: CreativeAsciiEffect,
): HTMLCanvasElement {
  const cell = Math.max(4, Math.round(effect.cellSize));
  const columns = Math.max(1, Math.floor(width / cell));
  const rows = Math.max(1, Math.floor(height / cell));

  const small = document.createElement("canvas");
  small.width = columns;
  small.height = rows;
  const smallContext = small.getContext("2d");
  if (!smallContext) throw new Error("ASCII needs a 2D context.");
  smallContext.imageSmoothingEnabled = true;
  smallContext.drawImage(source, 0, 0, columns, rows);
  const sampled = smallContext.getImageData(0, 0, columns, rows).data;

  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(width));
  output.height = Math.max(1, Math.round(height));
  const context = output.getContext("2d");
  if (!context) throw new Error("ASCII needs a 2D context.");

  context.fillStyle = effect.background;
  context.fillRect(0, 0, output.width, output.height);
  context.font = `${cell}px ui-monospace, "Geist Mono", "Cascadia Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (effect.color === "ink") context.fillStyle = effect.ink;

  const ramp = ASCII_CHARSETS[effect.charset];
  const last = ramp.length - 1;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = (row * columns + column) * 4;
      const red = sampled[index] ?? 0;
      const green = sampled[index + 1] ?? 0;
      const blue = sampled[index + 2] ?? 0;
      const alpha = (sampled[index + 3] ?? 255) / 255;
      if (alpha < 0.1) continue;

      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const level = effect.invert ? 1 - luminance : luminance;
      const glyph = ramp[Math.max(0, Math.min(last, Math.round(level * last)))];
      if (!glyph || glyph === " ") continue;

      if (effect.color === "source") {
        context.fillStyle = `rgb(${red},${green},${blue})`;
      }
      context.fillText(glyph, column * cell + cell / 2, row * cell + cell / 2);
    }
  }

  return output;
}

/** Apply the Studio's ordered Bayer dither to a browser image source. */
export function applyDitherEffect(
  source: CanvasImageSource,
  requestedWidth: number,
  requestedHeight: number,
  effect: CreativeDitherEffect,
): HTMLCanvasElement {
  const maxDimension = 2_048;
  const scale = Math.min(
    1,
    maxDimension / Math.max(requestedWidth, requestedHeight),
  );
  const width = Math.max(1, Math.round(requestedWidth * scale));
  const height = Math.max(1, Math.round(requestedHeight * scale));
  const cellSize = Math.max(1, Math.round(effect.cellSize * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;

  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;

  for (let cellY = 0, row = 0; cellY < height; cellY += cellSize, row += 1) {
    for (
      let cellX = 0, column = 0;
      cellX < width;
      cellX += cellSize, column += 1
    ) {
      const sampleX = Math.min(width - 1, cellX + Math.floor(cellSize / 2));
      const sampleY = Math.min(height - 1, cellY + Math.floor(cellSize / 2));
      const sampleIndex = (sampleY * width + sampleX) * 4;
      const red = adjustDitherChannel(data[sampleIndex] ?? 0, effect);
      const green = adjustDitherChannel(data[sampleIndex + 1] ?? 0, effect);
      const blue = adjustDitherChannel(data[sampleIndex + 2] ?? 0, effect);
      const threshold =
        ((BAYER_4X4[row % 4]?.[column % 4] ?? 0) + 0.5) / BAYER_4X4.length ** 2;
      const luminance = (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
      const ditherRed =
        effect.mode === "monochrome"
          ? luminance >= threshold
            ? 255
            : 0
          : red / 255 >= threshold
            ? 255
            : 0;
      const ditherGreen =
        effect.mode === "monochrome"
          ? ditherRed
          : green / 255 >= threshold
            ? 255
            : 0;
      const ditherBlue =
        effect.mode === "monochrome"
          ? ditherRed
          : blue / 255 >= threshold
            ? 255
            : 0;

      for (let y = cellY; y < Math.min(height, cellY + cellSize); y += 1) {
        for (let x = cellX; x < Math.min(width, cellX + cellSize); x += 1) {
          const index = (y * width + x) * 4;
          data[index] = blendChannel(
            data[index] ?? 0,
            ditherRed,
            effect.strength,
          );
          data[index + 1] = blendChannel(
            data[index + 1] ?? 0,
            ditherGreen,
            effect.strength,
          );
          data[index + 2] = blendChannel(
            data[index + 2] ?? 0,
            ditherBlue,
            effect.strength,
          );
        }
      }
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas;
}

function adjustDitherChannel(channel: number, effect: CreativeDitherEffect) {
  const contrasted = ((channel / 255 - 0.5) * effect.contrast + 0.5) * 255;
  return Math.max(0, Math.min(255, contrasted * effect.brightness));
}

function blendChannel(original: number, dithered: number, strength: number) {
  return Math.round(original + (dithered - original) * strength);
}
