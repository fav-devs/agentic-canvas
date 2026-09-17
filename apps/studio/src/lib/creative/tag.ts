/**
 * Sizing for tags.
 *
 * The tag's box is authoritative for drawing: the pill is stretched to it and
 * the text is centred inside at its own font size, so resizing a tag changes the
 * pill rather than distorting the type. That leaves one job for this module —
 * working out how big the box should be when the text or the font changes, so
 * the pill keeps hugging its contents.
 *
 * It is an estimate. Real glyph widths need font metrics we don't have outside
 * the canvas, and measuring there would mean the renderer writing back into the
 * document mid-render. Being a few pixels generous is the harmless direction.
 */

/** Average glyph width as a fraction of font size, across the shelf's faces. */
const AVERAGE_GLYPH_RATIO = 0.55;

/** Line box as a multiple of font size, matching the renderer's text height. */
const LINE_HEIGHT_RATIO = 1.25;

export function estimateTagBox(input: {
  text: string;
  fontSize: number;
  letterSpacing?: number;
  style: { paddingX: number; paddingY: number };
}) {
  const glyphs = Math.max(1, input.text.trim().length);
  // Tracking applies between glyphs, so one fewer gap than there are letters.
  const tracking = (input.letterSpacing ?? 0) * Math.max(0, glyphs - 1);
  const textWidth = glyphs * input.fontSize * AVERAGE_GLYPH_RATIO + tracking;

  return {
    width: Math.max(1, Math.round(textWidth + input.style.paddingX * 2)),
    height: Math.max(
      1,
      Math.round(input.fontSize * LINE_HEIGHT_RATIO + input.style.paddingY * 2),
    ),
  };
}
