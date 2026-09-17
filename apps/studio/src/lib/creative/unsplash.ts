import { z } from "zod";

const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  });

const unsplashPhotoSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  color: z.string().nullish(),
  description: z.string().nullish(),
  alt_description: z.string().nullish(),
  urls: z.object({
    small: httpUrlSchema,
    regular: httpUrlSchema,
  }),
  links: z.object({
    html: httpUrlSchema,
    download_location: httpUrlSchema,
  }),
  user: z.object({
    name: z.string(),
    username: z.string(),
    links: z.object({
      html: httpUrlSchema,
    }),
  }),
});

const unsplashSearchResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
  results: z.array(unsplashPhotoSchema),
});

export type UnsplashPhoto = {
  id: string;
  title: string;
  width: number;
  height: number;
  color?: string;
  previewUrl: string;
  imageUrl: string;
  sourceUrl: string;
  downloadLocation: string;
  photographer: {
    name: string;
    username: string;
    profileUrl: string;
  };
};

export type UnsplashSearchResult = {
  photos: UnsplashPhoto[];
  pagination: {
    page: number;
    lastPage: number;
    perPage: number;
    total: number;
  };
};

export function normalizeUnsplashResponse(
  input: unknown,
  page: number,
  perPage: number,
): UnsplashSearchResult {
  const response = unsplashSearchResponseSchema.parse(input);

  return {
    photos: response.results.map((photo) => ({
      id: photo.id,
      title:
        photo.description?.trim() ||
        photo.alt_description?.trim() ||
        "Untitled photo",
      width: photo.width,
      height: photo.height,
      color: photo.color ?? undefined,
      previewUrl: photo.urls.small,
      imageUrl: photo.urls.regular,
      sourceUrl: withUnsplashAttribution(photo.links.html),
      downloadLocation: photo.links.download_location,
      photographer: {
        name: photo.user.name,
        username: photo.user.username,
        profileUrl: withUnsplashAttribution(photo.user.links.html),
      },
    })),
    pagination: {
      page,
      lastPage: response.total_pages,
      perPage,
      total: response.total,
    },
  };
}

export async function searchUnsplashPhotos(
  rawQuery: string,
  options: { page?: number; signal?: AbortSignal } = {},
): Promise<UnsplashSearchResult> {
  const { page = 1, signal } = options;
  const query = rawQuery.trim();
  if (query.length < 2) {
    return {
      photos: [],
      pagination: { page, lastPage: 0, perPage: 0, total: 0 },
    };
  }

  const params = new URLSearchParams({
    query: query.slice(0, 120),
    page: String(page),
    limit: "18",
    order: "relevant",
  });
  const response = await fetch(`/api/creative/resources/unsplash?${params}`, {
    signal,
  });
  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      result?.error || `Photo search failed (${response.status})`,
    );
  }

  return result as UnsplashSearchResult;
}

function withUnsplashAttribution(rawUrl: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("utm_source", "stencil");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}
