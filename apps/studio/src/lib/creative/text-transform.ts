/** Commit Fabric's temporary vertical scale as a durable text size. */
export function scaledTextFontSize(fontSize: number, scaleY: number) {
  if (!Number.isFinite(scaleY) || Math.abs(scaleY - 1) < 0.001) {
    return undefined;
  }
  return Math.min(
    512,
    Math.max(1, Math.round(fontSize * Math.abs(scaleY) * 10) / 10),
  );
}
