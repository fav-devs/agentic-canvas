"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  IconAlertCircle,
  IconExternalLink,
  IconLoader2,
  IconSearch,
} from "@tabler/icons-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CURATED_ILLUSTRATIONS,
  fetchLibraryAssetSvg,
  searchIconifyAssets,
  searchSvglAssets,
  type CreativeLibraryAsset,
} from "@/lib/creative/element-library";
import { searchKlipyStickers, type KlipySticker } from "@/lib/creative/klipy";
import {
  searchHiclipartGraphics,
  type HiclipartGraphic,
} from "@/lib/creative/hiclipart";
import {
  encodeStudioDragItem,
  STUDIO_DRAG_MIME,
} from "@/lib/creative/drag-payload";
import {
  searchUnsplashPhotos,
  type UnsplashPhoto,
} from "@/lib/creative/unsplash";

const SUGGESTED_SEARCHES = ["social", "arrow", "sparkle", "business"];

export function ElementLibrary({
  mode = "all",
  onInsert,
  onInsertHiclipart,
  onInsertPhoto,
  onInsertSticker,
}: {
  /**
   * Which slice to render. The browser splits graphics and photos into their
   * own categories, while "search" is the cross-cutting box on the landing
   * screen that shows both once there's a query.
   */
  mode?: "all" | "graphics" | "photos" | "search" | "stickers";
  onInsert(input: {
    asset: CreativeLibraryAsset;
    svg?: string;
  }): Promise<void> | void;
  onInsertHiclipart?(graphic: HiclipartGraphic): Promise<void> | void;
  onInsertPhoto?(photo: UnsplashPhoto): Promise<void> | void;
  onInsertSticker?(sticker: KlipySticker): Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [insertingId, setInsertingId] = useState<string>();

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const stickersOnly = mode === "stickers";
  const showIcons = mode !== "photos" && !stickersOnly;
  const showPhotos = mode !== "graphics" && !stickersOnly;
  const showHiclipart =
    process.env.NODE_ENV === "development" && mode === "graphics";
  const showStickers = stickersOnly || mode === "search";
  // On the landing screen nothing is listed until something is typed.
  const searchOnly = mode === "search";
  const hasQuery = debouncedQuery.trim().length >= 2;
  /**
   * Whether the source lists belong on screen.
   *
   * On the landing screen they only appear once something is typed. Gating on
   * `data.length` instead was the bug: these queries run with an empty query
   * inside their own category, so react-query still had that result cached when
   * the user came back, and the lists reappeared under the categories grid and
   * pushed it off the bottom.
   */
  const listsVisible = !searchOnly || hasQuery;

  const icons = useQuery({
    queryKey: ["creative", "elements", "iconify", debouncedQuery],
    queryFn: ({ signal }) => searchIconifyAssets(debouncedQuery, signal),
    enabled: showIcons && listsVisible,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const logos = useQuery({
    queryKey: ["creative", "elements", "svgl", debouncedQuery],
    queryFn: ({ signal }) => searchSvglAssets(debouncedQuery, signal),
    enabled: showIcons && listsVisible,
    // Brand marks change about never; svgl's docs ask callers to cache.
    staleTime: 1000 * 60 * 60,
    retry: 1,
  });

  const stickers = useInfiniteQuery({
    queryKey: ["creative", "resources", "klipy", debouncedQuery],
    queryFn: ({ pageParam, signal }) =>
      searchKlipyStickers(debouncedQuery, { page: pageParam, signal }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNext ? last.pagination.page + 1 : undefined,
    // Trending fills the empty state, so this runs without a query too.
    enabled: Boolean(onInsertSticker) && showStickers && listsVisible,
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });
  const stickerItems =
    stickers.data?.pages.flatMap((page) => page.stickers) ?? [];

  const unsplash = useInfiniteQuery({
    queryKey: ["creative", "resources", "unsplash", debouncedQuery],
    queryFn: ({ pageParam, signal }) =>
      searchUnsplashPhotos(debouncedQuery, { page: pageParam, signal }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.lastPage
        ? last.pagination.page + 1
        : undefined,
    enabled: showPhotos && hasQuery,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const photos = unsplash.data?.pages.flatMap((page) => page.photos) ?? [];
  const photoTotal = unsplash.data?.pages[0]?.pagination.total ?? 0;

  const hiclipart = useInfiniteQuery({
    queryKey: ["creative", "resources", "hiclipart", debouncedQuery],
    queryFn: ({ pageParam, signal }) =>
      searchHiclipartGraphics(debouncedQuery, { page: pageParam, signal }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.hasNext ? last.pagination.page + 1 : undefined,
    enabled: Boolean(onInsertHiclipart) && showHiclipart && hasQuery,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
  const hiclipartGraphics =
    hiclipart.data?.pages.flatMap((page) => page.graphics) ?? [];

  const insert = async (asset: CreativeLibraryAsset) => {
    if (insertingId) return;
    setInsertingId(asset.id);
    try {
      const svg = await fetchLibraryAssetSvg(asset);
      await onInsert({
        asset,
        svg:
          asset.provider === "iconify" || asset.provider === "svgl"
            ? svg
            : undefined,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The element could not load.",
      );
    } finally {
      setInsertingId(undefined);
    }
  };

  const insertStickerItem = async (sticker: KlipySticker) => {
    if (!onInsertSticker || insertingId) return;
    setInsertingId(sticker.id);
    try {
      await onInsertSticker(sticker);
    } finally {
      setInsertingId(undefined);
    }
  };

  const insertPhoto = async (photo: UnsplashPhoto) => {
    if (!onInsertPhoto || insertingId) return;
    setInsertingId(photo.id);
    try {
      await onInsertPhoto(photo);
    } finally {
      setInsertingId(undefined);
    }
  };

  const insertHiclipart = async (graphic: HiclipartGraphic) => {
    if (!onInsertHiclipart || insertingId) return;
    setInsertingId(graphic.id);
    try {
      await onInsertHiclipart(graphic);
    } finally {
      setInsertingId(undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <label className="relative block">
          <span className="sr-only">Search elements</span>
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              mode === "photos"
                ? "Search photos"
                : mode === "graphics"
                  ? "Search graphics"
                  : "Search elements and photos"
            }
            className="h-10 w-full rounded-xl border border-foreground/[0.07] bg-foreground/[0.045] pl-9 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/20 focus:bg-foreground/[0.065]"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_SEARCHES.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setQuery(suggestion)}
              className="rounded-lg px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
              style={{ border: "1px solid var(--hairline)" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {showIcons && listsVisible ? (
        <LibrarySection title="Icons" detail="Iconify · MIT and ISC sets">
          {icons.isPending ? (
            <div className="grid grid-cols-3 gap-2" aria-label="Loading icons">
              {Array.from({ length: 9 }, (_, index) => (
                <span
                  key={index}
                  className="aspect-square animate-pulse rounded-xl bg-foreground/[0.05]"
                />
              ))}
            </div>
          ) : icons.isError ? (
            <div
              className="rounded-xl p-3 text-[11px] text-muted-foreground"
              style={{
                backgroundColor: "var(--inset)",
                border: "1px solid var(--hairline)",
              }}
            >
              <div className="flex items-center gap-2 text-foreground">
                <IconAlertCircle className="size-4" />
                Elements could not load
              </div>
              <button
                type="button"
                onClick={() => void icons.refetch()}
                className="mt-2 font-semibold text-foreground"
              >
                Try again
              </button>
            </div>
          ) : icons.data.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {icons.data.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  inserting={insertingId === asset.id}
                  disabled={Boolean(insertingId)}
                  onClick={() => void insert(asset)}
                />
              ))}
            </div>
          ) : (
            <p className="py-5 text-center text-[11px] text-muted-foreground">
              No icons found. Try a broader word.
            </p>
          )}
        </LibrarySection>
      ) : null}

      {showIcons && listsVisible && logos.data && logos.data.length > 0 ? (
        <LibrarySection title="Logos" detail="svgl · each brand's own mark">
          <div className="grid grid-cols-3 gap-2">
            {logos.data.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                inserting={insertingId === asset.id}
                disabled={Boolean(insertingId)}
                onClick={() => void insert(asset)}
              />
            ))}
          </div>
        </LibrarySection>
      ) : null}

      {showIcons && !searchOnly ? (
        <LibrarySection title="Illustrations" detail="Open Doodles · CC0">
          <div className="grid grid-cols-2 gap-2">
            {CURATED_ILLUSTRATIONS.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                inserting={insertingId === asset.id}
                disabled={Boolean(insertingId)}
                onClick={() => void insert(asset)}
              />
            ))}
          </div>
        </LibrarySection>
      ) : null}

      {showHiclipart && hasQuery ? (
        <LibrarySection
          title="Hiclipart"
          detail="Dev only · personal, non-commercial use"
        >
          {hiclipart.isPending ? (
            <div
              className="grid grid-cols-2 gap-2"
              aria-label="Loading Hiclipart graphics"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className="aspect-square animate-pulse rounded-xl bg-foreground/[0.05]"
                />
              ))}
            </div>
          ) : hiclipart.isError ? (
            <div
              className="rounded-xl p-3 text-[11px] text-muted-foreground"
              style={{
                backgroundColor: "var(--inset)",
                border: "1px solid var(--hairline)",
              }}
            >
              <div className="flex items-center gap-2 text-foreground">
                <IconAlertCircle className="size-4 shrink-0" />
                {hiclipart.error.message}
              </div>
            </div>
          ) : hiclipartGraphics.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {hiclipartGraphics.map((graphic) => (
                  <HiclipartTile
                    key={graphic.id}
                    graphic={graphic}
                    inserting={insertingId === graphic.id}
                    disabled={Boolean(insertingId)}
                    onInsert={() => void insertHiclipart(graphic)}
                  />
                ))}
              </div>
              {hiclipart.hasNextPage ? (
                <button
                  type="button"
                  onClick={() => void hiclipart.fetchNextPage()}
                  disabled={hiclipart.isFetchingNextPage}
                  className="h-9 w-full rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  {hiclipart.isFetchingNextPage
                    ? "Loading…"
                    : "Load more graphics"}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="py-5 text-center text-[11px] text-muted-foreground">
              No Hiclipart graphics found. Try a broader word.
            </p>
          )}
          <p className="text-[9px] leading-relaxed text-muted-foreground">
            Drag or click to add the available preview. Original transparent
            PNGs require Hiclipart&apos;s verification.
          </p>
        </LibrarySection>
      ) : null}

      {showStickers &&
      listsVisible &&
      onInsertSticker &&
      stickerItems.length > 0 ? (
        <LibrarySection title="Stickers" detail="Powered by KLIPY">
          <div className="grid grid-cols-3 gap-2">
            {stickerItems.map((sticker) => (
              <button
                key={sticker.id}
                type="button"
                onClick={() => void insertStickerItem(sticker)}
                disabled={Boolean(insertingId)}
                draggable={!insertingId}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(
                    STUDIO_DRAG_MIME,
                    encodeStudioDragItem({ kind: "sticker", sticker }),
                  );
                }}
                title={sticker.title}
                aria-label={`Add ${sticker.title}`}
                className="group relative flex aspect-square cursor-grab overflow-hidden rounded-xl transition-colors hover:bg-foreground/[0.06] active:cursor-grabbing disabled:cursor-wait disabled:opacity-60"
                style={{
                  backgroundColor: "var(--inset)",
                  border: "1px solid var(--hairline)",
                }}
              >
                <Image
                  src={sticker.previewUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="120px"
                  className="object-contain p-1.5 transition-transform duration-200 group-hover:scale-105"
                />
                {insertingId === sticker.id ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <IconLoader2 className="size-4 animate-spin" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {stickers.hasNextPage ? (
            <button
              type="button"
              onClick={() => void stickers.fetchNextPage()}
              disabled={stickers.isFetchingNextPage}
              className="mt-2 h-9 w-full rounded-xl text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
              style={{ border: "1px solid var(--hairline)" }}
            >
              {stickers.isFetchingNextPage ? "Loading…" : "More stickers"}
            </button>
          ) : null}
        </LibrarySection>
      ) : null}

      {showPhotos && hasQuery ? (
        <LibrarySection
          title="Photos"
          detail={
            photoTotal
              ? `Unsplash · ${photoTotal.toLocaleString()}`
              : "Photos from Unsplash"
          }
        >
          {unsplash.isPending ? (
            <div
              className="grid grid-cols-2 gap-2"
              aria-label="Loading resources"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className="aspect-[4/3] animate-pulse rounded-xl bg-foreground/[0.05]"
                />
              ))}
            </div>
          ) : unsplash.isError ? (
            <div
              className="rounded-xl p-3 text-[11px] text-muted-foreground"
              style={{
                backgroundColor: "var(--inset)",
                border: "1px solid var(--hairline)",
              }}
            >
              <div className="flex items-center gap-2 text-foreground">
                <IconAlertCircle className="size-4 shrink-0" />
                {unsplash.error.message}
              </div>
            </div>
          ) : photos.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {photos.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    inserting={insertingId === photo.id}
                    disabled={Boolean(insertingId)}
                    onInsert={() => void insertPhoto(photo)}
                  />
                ))}
              </div>
              {unsplash.hasNextPage ? (
                <button
                  type="button"
                  onClick={() => void unsplash.fetchNextPage()}
                  disabled={unsplash.isFetchingNextPage}
                  className="h-9 w-full rounded-xl text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50"
                  style={{ border: "1px solid var(--hairline)" }}
                >
                  {unsplash.isFetchingNextPage
                    ? "Loading…"
                    : "Load more photos"}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="py-5 text-center text-[11px] text-muted-foreground">
              No resources found. Try a broader word.
            </p>
          )}
        </LibrarySection>
      ) : null}
    </div>
  );
}

function LibrarySection({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-foreground">{title}</h3>
        <span className="truncate text-[9px] text-muted-foreground">
          {detail}
        </span>
      </div>
      {children}
    </section>
  );
}

function AssetTile({
  asset,
  inserting,
  disabled,
  onClick,
}: {
  asset: CreativeLibraryAsset;
  inserting: boolean;
  disabled: boolean;
  onClick(): void;
}) {
  const illustration = asset.provider === "open-doodles";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      draggable={!disabled}
      onDragStart={(event) => {
        // Drag straight onto the canvas: the drop handler reads this and places
        // the element where it landed. Click still adds it centred.
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          STUDIO_DRAG_MIME,
          encodeStudioDragItem({ kind: "library", asset }),
        );
      }}
      title={`${asset.name} · ${asset.license}`}
      aria-label={`Add ${asset.name}`}
      className={`group relative flex cursor-grab overflow-hidden rounded-xl text-left transition-colors hover:bg-foreground/[0.06] active:cursor-grabbing disabled:cursor-wait disabled:opacity-60 ${
        illustration ? "aspect-[4/3]" : "aspect-square"
      }`}
      style={{
        backgroundColor: asset.previewOnDark ? "#15161A" : "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      {illustration || asset.fullColor ? (
        // Its own colours, not a mask: flattening a brand mark to a silhouette
        // makes it unrecognisable, which is the only thing the tile is for.
        <Image
          src={asset.previewUrl}
          alt=""
          fill
          unoptimized
          sizes="120px"
          className="object-contain p-2.5"
        />
      ) : (
        <span
          className="m-auto size-8 bg-foreground transition-transform duration-200 group-hover:scale-110"
          style={{
            maskImage: `url("${asset.previewUrl}")`,
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskSize: "contain",
          }}
        />
      )}
      {inserting ? (
        <span className="absolute inset-0 flex items-center justify-center bg-background/70">
          <IconLoader2 className="size-4 animate-spin" />
        </span>
      ) : null}
      {illustration ? (
        <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-lg bg-background/85 px-1.5 py-1 text-[9px] font-medium text-foreground">
          {asset.name}
        </span>
      ) : null}
    </button>
  );
}

function PhotoTile({
  photo,
  inserting,
  disabled,
  onInsert,
}: {
  photo: UnsplashPhoto;
  inserting: boolean;
  disabled: boolean;
  onInsert(): void;
}) {
  return (
    <article
      className="group relative aspect-[4/3] overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      {/* Clicking the photo places it. The attribution links below sit on top
          and stop propagation, so credit is still one tap away — which is what
          Unsplash's terms ask for, rather than the whole tile being a link. */}
      <button
        type="button"
        onClick={onInsert}
        disabled={disabled}
        draggable={!disabled}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            STUDIO_DRAG_MIME,
            encodeStudioDragItem({ kind: "photo", photo }),
          );
        }}
        title={`Add ${photo.title}`}
        aria-label={`Add ${photo.title} to the slide`}
        className="absolute inset-0 cursor-grab active:cursor-grabbing disabled:cursor-wait"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center transition-transform duration-200 group-hover:scale-[1.03]"
          style={{
            backgroundColor: photo.color,
            backgroundImage: `url(${JSON.stringify(photo.previewUrl)})`,
          }}
        />
        {inserting ? (
          <span className="absolute inset-0 grid place-items-center bg-background/60">
            <IconLoader2 className="size-4 animate-spin" />
          </span>
        ) : null}
      </button>
      <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex min-w-0 items-center gap-1 rounded-lg bg-background/90 px-2 py-1.5 backdrop-blur-sm">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[9px] font-semibold text-foreground">
            {photo.title}
          </span>
          <span className="block truncate text-[8px] text-muted-foreground">
            Photo by{" "}
            <a
              href={photo.photographer.profileUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto underline-offset-2 hover:underline"
            >
              {photo.photographer.name}
            </a>{" "}
            on{" "}
            <a
              href="https://unsplash.com/?utm_source=agentic-canvas&utm_medium=referral"
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto underline-offset-2 hover:underline"
            >
              Unsplash
            </a>
          </span>
        </span>
        <a
          href={photo.sourceUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          title="Open on Unsplash"
          className="pointer-events-auto shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconExternalLink className="size-3" />
        </a>
      </span>
    </article>
  );
}

function HiclipartTile({
  graphic,
  inserting,
  disabled,
  onInsert,
}: {
  graphic: HiclipartGraphic;
  inserting: boolean;
  disabled: boolean;
  onInsert(): void;
}) {
  return (
    <article
      className="group relative aspect-square overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      <button
        type="button"
        onClick={onInsert}
        disabled={disabled}
        draggable={!disabled}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            STUDIO_DRAG_MIME,
            encodeStudioDragItem({ kind: "hiclipart", graphic }),
          );
        }}
        title={`Add preview of ${graphic.title}`}
        aria-label={`Add preview of ${graphic.title} to the slide`}
        className="absolute inset-0 cursor-grab active:cursor-grabbing disabled:cursor-wait"
      >
        <Image
          src={graphic.previewUrl}
          alt=""
          fill
          unoptimized
          sizes="140px"
          className="object-contain p-1.5 transition-transform duration-200 group-hover:scale-[1.03]"
        />
        {inserting ? (
          <span className="absolute inset-0 grid place-items-center bg-background/60">
            <IconLoader2 className="size-4 animate-spin" />
          </span>
        ) : null}
      </button>
      <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex min-w-0 items-center gap-1 rounded-lg bg-background/90 px-2 py-1.5 backdrop-blur-sm">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[9px] font-semibold text-foreground">
            {graphic.title}
          </span>
          <span className="block text-[8px] text-muted-foreground">
            Preview copy
          </span>
        </span>
        <a
          href={graphic.downloadUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          title="Verify and download original transparent PNG"
          aria-label={`Open original PNG download for ${graphic.title}`}
          className="pointer-events-auto flex shrink-0 items-center gap-0.5 text-[8px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          PNG
          <IconExternalLink className="size-3" />
        </a>
      </span>
    </article>
  );
}
