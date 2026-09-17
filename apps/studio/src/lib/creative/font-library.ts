import type { CreativeFont } from "./document";

const FONT_MIME_BY_EXTENSION = {
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
} as const;

const registeredFonts = new Map<string, Promise<FontFace>>();

export function prepareCreativeFontFile(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const mimeType =
    extension &&
    FONT_MIME_BY_EXTENSION[extension as keyof typeof FONT_MIME_BY_EXTENSION];
  if (!mimeType) {
    throw new Error("Choose a WOFF, WOFF2, TTF, or OTF font file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Font files must be 10 MB or smaller.");
  }

  return {
    file:
      file.type === mimeType
        ? file
        : new File([file], file.name, {
            type: mimeType,
            lastModified: file.lastModified,
          }),
    family: fontFamilyFromFilename(file.name),
    mimeType,
  };
}

export async function registerCreativeFont(font: CreativeFont) {
  if (typeof window === "undefined" || typeof FontFace === "undefined") return;
  const cacheKey = `${font.family}:${font.url}`;
  const existing = registeredFonts.get(cacheKey);
  if (existing) return existing;

  const pending = new FontFace(font.family, `url("${font.url}")`)
    .load()
    .then((face) => {
      globalThis.document.fonts.add(face);
      return face;
    })
    .catch((error) => {
      registeredFonts.delete(cacheKey);
      throw error;
    });
  registeredFonts.set(cacheKey, pending);
  return pending;
}

export async function validateCreativeFontFile(file: File, family: string) {
  if (typeof FontFace === "undefined") return;
  try {
    const face = new FontFace(
      `Agentic Canvas validation ${family}`,
      await file.arrayBuffer(),
    );
    await face.load();
  } catch {
    throw new Error("The browser could not read this font file.");
  }
}

function fontFamilyFromFilename(filename: string) {
  const withoutExtension = filename.replace(/\.(woff2?|ttf|otf)$/i, "");
  const family = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return family.slice(0, 120) || "Imported font";
}
