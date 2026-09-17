const DEFAULT_GLYPH_WIDTH_EM = 0.58;

export function estimateAutoTextBox(input: {
  text: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  maxWidth: number;
}) {
  const lines = input.text.split("\n");
  const longestWidth = lines.reduce((widest, line) => {
    const glyphs = Math.max(1, Array.from(line).length);
    const width =
      glyphs * input.fontSize * DEFAULT_GLYPH_WIDTH_EM +
      Math.max(0, glyphs - 1) * (input.letterSpacing ?? 0);
    return Math.max(widest, width);
  }, 0);
  const width = Math.round(
    Math.min(
      input.maxWidth,
      Math.max(input.fontSize * 1.5, longestWidth + input.fontSize * 0.12),
    ),
  );
  const height = Math.round(
    Math.max(
      input.fontSize * input.lineHeight,
      lines.length * input.fontSize * input.lineHeight,
    ),
  );
  return { width, height };
}
