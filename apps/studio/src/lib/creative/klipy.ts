import { z } from "zod";

/**
 * KLIPY stickers, as the editor sees them.
 *
 * Everything goes through our own route: KLIPY carries its app key in the URL
 * path, so the browser never talks to them directly.
 */

export const klipyStickerSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Full-size file, uploaded to our own media store on insert. */
  url: z.string(),
  previewUrl: z.string(),
  width: z.number(),
  height: z.number(),
});

export type KlipySticker = z.infer<typeof klipyStickerSchema>;

const responseSchema = z.object({
  stickers: z.array(klipyStickerSchema),
  pagination: z.object({ page: z.number(), hasNext: z.boolean() }),
});

export type KlipyStickerPage = z.infer<typeof responseSchema>;

export async function searchKlipyStickers(
  rawQuery: string,
  options?: { page?: number; signal?: AbortSignal },
): Promise<KlipyStickerPage> {
  const url = new URL("/api/creative/resources/klipy", window.location.origin);
  const query = rawQuery.trim();
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("page", String(options?.page ?? 1));

  const response = await fetch(url, { signal: options?.signal });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      detail?.error || `Sticker search failed (${response.status})`,
    );
  }
  return responseSchema.parse(await response.json());
}
