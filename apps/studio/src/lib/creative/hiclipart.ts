export type HiclipartGraphic = {
  id: string;
  title: string;
  width: number;
  height: number;
  previewUrl: string;
  sourceUrl: string;
  downloadUrl: string;
};

export type HiclipartSearchResult = {
  graphics: HiclipartGraphic[];
  pagination: {
    page: number;
    hasNext: boolean;
  };
};

export async function searchHiclipartGraphics(
  rawQuery: string,
  options: { page?: number; signal?: AbortSignal } = {},
): Promise<HiclipartSearchResult> {
  const { page = 1, signal } = options;
  const query = rawQuery.trim();
  if (query.length < 2) {
    return { graphics: [], pagination: { page, hasNext: false } };
  }

  const params = new URLSearchParams({
    query: query.slice(0, 120),
    page: String(page),
  });
  const response = await fetch(`/api/creative/resources/hiclipart?${params}`, {
    signal,
  });
  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      result?.error || `Hiclipart search failed (${response.status})`,
    );
  }

  return result as HiclipartSearchResult;
}
