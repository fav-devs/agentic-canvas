"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import type { KlipySticker } from "@/lib/creative/klipy";
import type { HiclipartGraphic } from "@/lib/creative/hiclipart";
import type { StudioDragItem } from "@/lib/creative/drag-payload";
import { cortexGreenScreenRawUrl } from "@/lib/creative/green-screen-source";
import { recentKey } from "@/lib/creative/recents";
import {
  frameContentBox,
  frameSvgPath,
  FRAME_SHAPE_LABELS,
  type CreativeFrameShape,
} from "@/lib/creative/frames";
import {
  CREATIVE_SHAPE_LABELS,
  shapeSvgPath,
  type CreativeShapeKind,
} from "@/lib/creative/shapes";
import {
  IconArrowLeft,
  IconChevronRight,
  IconPhoto,
  IconRectangle,
  IconShape,
  IconSlideshow,
  IconSticker,
  IconSparkles,
  IconCrop,
} from "@tabler/icons-react";
import type { UnsplashPhoto } from "@/lib/creative/unsplash";
import type { CreativeLibraryAsset } from "@/lib/creative/element-library";
import { ElementLibrary } from "./element-library";
import { TemplateGallery } from "./template-gallery";

export type ElementCategoryId =
  | "templates"
  | "shapes"
  | "frames"
  | "graphics"
  | "stickers"
  | "photos"
  | "smart"
  | "memes";

const CATEGORIES: Array<{
  id: ElementCategoryId;
  label: string;
  detail: string;
  icon: typeof IconRectangle;
  /** Tile wash, so the grid reads as a set of places rather than a list. */
  tint: string;
}> = [
  {
    id: "templates",
    label: "Templates",
    detail: "Recreate a pro design",
    icon: IconSparkles,
    tint: "linear-gradient(135deg,#1F2937,#4B5563)",
  },
  {
    id: "shapes",
    label: "Shapes",
    detail: "Arrows, stars, bubbles and more",
    icon: IconRectangle,
    tint: "linear-gradient(135deg,var(--grad-orange),var(--grad-red))",
  },
  {
    id: "frames",
    label: "Frames",
    detail: "Drop a photo in",
    icon: IconCrop,
    tint: "linear-gradient(135deg,#EF7B16,#FFB45C)",
  },
  {
    id: "graphics",
    label: "Graphics",
    detail: "Icons and illustrations",
    icon: IconShape,
    tint: "linear-gradient(135deg,#12A594,#5BD6C4)",
  },
  {
    id: "stickers",
    label: "Stickers",
    detail: "Powered by KLIPY",
    icon: IconSticker,
    tint: "linear-gradient(135deg,#7C4DFF,#B79CFF)",
  },
  {
    id: "photos",
    label: "Photos",
    detail: "Free stock from Unsplash",
    icon: IconPhoto,
    tint: "linear-gradient(135deg,#2E6BE6,#77A6FF)",
  },
  {
    id: "smart",
    label: "Smart",
    detail: "Page-aware elements",
    icon: IconSlideshow,
    tint: "linear-gradient(135deg,#E1439A,#FF8AC4)",
  },
  {
    id: "memes",
    label: "Memes",
    detail: "Green screen clips",
    icon: IconSticker,
    tint: "linear-gradient(135deg,#10B981,#6EE7B7)",
  },
];

/**
 * The Elements tab.
 *
 * Everything used to be stacked into one long scroll — shapes, then frames,
 * then a search box, then icons, then photos. This is the same content behind
 * a browse grid: pick a category, get only that category, come back with one
 * tap. Search still cuts across graphics and photos without drilling in.
 */
export function ElementBrowser({
  shapes,
  frames,
  smart,
  recents = [],
  onUseRecent,
  onAddShape,
  onAddFrame,
  onAddText,
  onInsertAsset,
  onInsertHiclipart,
  onInsertPhoto,
  onInsertSticker,
  onAddVideo,
}: {
  shapes: ReactNode;
  frames: ReactNode;
  smart: ReactNode;
  /** Newest first, mixed kinds. */
  recents?: StudioDragItem[];
  onUseRecent?(item: StudioDragItem): void;
  /**
   * The quick rows drive these directly rather than reusing the category grids:
   * a grid node cannot be laid out as a row, and the workspace already owns
   * every one of these handlers.
   */
  onAddShape?(shape: CreativeShapeKind): void;
  onAddFrame?(shape: CreativeFrameShape): void;
  onAddText?(variant: "heading" | "body"): void;
  onInsertAsset(input: {
    asset: CreativeLibraryAsset;
    svg?: string;
  }): Promise<void> | void;
  onInsertHiclipart?(graphic: HiclipartGraphic): Promise<void> | void;
  onInsertPhoto(photo: UnsplashPhoto): Promise<void> | void;
  onInsertSticker?(sticker: KlipySticker): Promise<void> | void;
  onAddVideo?(opts: {
    src: string;
    chromaKeyed?: boolean;
    caption?: string;
  }): void;
}) {
  const [category, setCategory] = useState<ElementCategoryId | null>(null);

  if (category) {
    const active = CATEGORIES.find((entry) => entry.id === category);
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <IconArrowLeft className="size-3.5" />
          All elements
        </button>
        <h2 className="text-sm font-semibold text-foreground">
          {active?.label}
        </h2>

        {category === "shapes" ? shapes : null}
        {category === "frames" ? frames : null}
        {category === "smart" ? smart : null}
        {category === "graphics" ? (
          <ElementLibrary
            mode="graphics"
            onInsert={onInsertAsset}
            onInsertHiclipart={onInsertHiclipart}
            onInsertPhoto={onInsertPhoto}
            onInsertSticker={onInsertSticker}
          />
        ) : null}
        {category === "stickers" ? (
          <ElementLibrary
            mode="stickers"
            onInsert={onInsertAsset}
            onInsertPhoto={onInsertPhoto}
            onInsertSticker={onInsertSticker}
          />
        ) : null}
        {category === "photos" ? (
          <ElementLibrary
            mode="photos"
            onInsert={onInsertAsset}
            onInsertPhoto={onInsertPhoto}
            onInsertSticker={onInsertSticker}
          />
        ) : null}
        {category === "memes" ? <MemeClipGrid onAdd={onAddVideo} /> : null}
        {category === "templates" ? <TemplateGallery /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search reaches across graphics and photos, so it stays at the top
          rather than living inside one category. */}
      <ElementLibrary
        mode="search"
        onInsert={onInsertAsset}
        onInsertPhoto={onInsertPhoto}
        onInsertSticker={onInsertSticker}
      />

      <div className="space-y-2.5">
        <h3 className="text-[11px] font-semibold text-foreground">
          Browse categories
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(({ id, label, detail, icon: Icon, tint }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className="group flex flex-col gap-2 rounded-xl p-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
              style={{ border: "1px solid var(--hairline)" }}
            >
              <span
                className="flex size-9 items-center justify-center rounded-lg text-white"
                style={{ backgroundImage: tint }}
              >
                <Icon className="size-[18px]" stroke={1.8} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                  {label}
                  <IconChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {detail}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {onUseRecent && recents.length > 0 ? (
        <QuickRow title="Recently used">
          {recents.map((item) => (
            <RecentTile
              key={recentKey(item)}
              item={item}
              onClick={() => onUseRecent(item)}
            />
          ))}
        </QuickRow>
      ) : null}

      {onAddShape ? (
        <QuickRow title="Shapes" onSeeAll={() => setCategory("shapes")}>
          {(["rectangle", "ellipse", "star", "speech-bubble"] as const).map(
            (shape) => (
              <QuickTile
                key={shape}
                label={CREATIVE_SHAPE_LABELS[shape]}
                onClick={() => onAddShape(shape)}
              >
                <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
                  <path
                    d={shapeSvgPath(shape, 32, 32)}
                    className="fill-foreground/80"
                  />
                </svg>
              </QuickTile>
            ),
          )}
        </QuickRow>
      ) : null}

      {onAddFrame ? (
        <QuickRow title="Frames" onSeeAll={() => setCategory("frames")}>
          {QUICK_FRAMES.map((shape) => (
            <QuickTile
              key={shape}
              label={FRAME_SHAPE_LABELS[shape]}
              onClick={() => onAddFrame(shape)}
            >
              <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
                <FrameGlyph shape={shape} size={32} />
              </svg>
            </QuickTile>
          ))}
        </QuickRow>
      ) : null}

      {onAddText ? (
        <QuickRow title="Text">
          {(["heading", "body"] as const).map((variant) => (
            <QuickTile
              key={variant}
              label={variant === "heading" ? "Heading" : "Body"}
              onClick={() => onAddText(variant)}
            >
              <span
                className={
                  variant === "heading"
                    ? "text-lg font-bold leading-none"
                    : "text-xs leading-none"
                }
              >
                Aa
              </span>
            </QuickTile>
          ))}
        </QuickRow>
      ) : null}

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <IconSparkles className="size-3.5" />
        Drag anything onto the canvas to place it exactly.
      </p>
    </div>
  );
}

/** A handful of frames worth reaching for without opening the category. */
const QUICK_FRAMES: CreativeFrameShape[] = [
  "rounded",
  "circle",
  "arch",
  "postage",
];

/**
 * A horizontal strip. Rows rather than grids for the quick sections: they are a
 * shortcut past the categories, so they must not cost the vertical space a grid
 * would. Scrolls sideways, so height is fixed however many items it holds.
 */
function QuickRow({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll?(): void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold text-foreground">{title}</h3>
        {onSeeAll ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            See all
          </button>
        ) : null}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {children}
      </div>
    </section>
  );
}

function QuickTile({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-[52px] shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-foreground/[0.06]"
      style={{
        backgroundColor: "var(--inset)",
        border: "1px solid var(--hairline)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * One remembered item, previewed by kind rather than from a stored thumbnail:
 * the payload already describes the thing, and a cached raster would go stale
 * the moment its source changed.
 */
function RecentTile({
  item,
  onClick,
}: {
  item: StudioDragItem;
  onClick(): void;
}) {
  const preview =
    item.kind === "sticker"
      ? item.sticker.previewUrl
      : item.kind === "photo"
        ? item.photo.previewUrl
        : item.kind === "hiclipart"
          ? item.graphic.previewUrl
          : item.kind === "media"
            ? item.item.url
            : null;

  return (
    <QuickTile label={recentLabel(item)} onClick={onClick}>
      {preview ? (
        <Image
          src={preview}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="size-10 rounded-lg object-contain"
        />
      ) : item.kind === "library" ? (
        <span
          className="size-6 bg-foreground/80"
          style={{
            maskImage: `url("${item.asset.previewUrl}")`,
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskSize: "contain",
          }}
        />
      ) : item.kind === "frame" ? (
        <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
          <FrameGlyph shape={item.shape} size={32} />
        </svg>
      ) : item.kind === "shape" ? (
        <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
          <path
            d={shapeSvgPath(item.shape, 32, 32)}
            className="fill-foreground/80"
          />
        </svg>
      ) : item.kind === "text" ? (
        <span className="text-base font-bold leading-none">Aa</span>
      ) : (
        <IconSlideshow className="size-5" />
      )}
    </QuickTile>
  );
}

function FrameGlyph({
  shape,
  size,
}: {
  shape: CreativeFrameShape;
  size: number;
}) {
  const aperture = frameContentBox(shape, size, size);
  return (
    <>
      <path
        d={frameSvgPath(shape, size, size, size * 0.25)}
        className={aperture ? "fill-foreground/30" : "fill-foreground/80"}
      />
      {aperture ? (
        <rect
          x={aperture.x}
          y={aperture.y}
          width={aperture.width}
          height={aperture.height}
          className="fill-foreground/80"
        />
      ) : null}
    </>
  );
}

function recentLabel(item: StudioDragItem): string {
  switch (item.kind) {
    case "library":
      return item.asset.name;
    case "shape":
      return CREATIVE_SHAPE_LABELS[item.shape];
    case "frame":
      return `${FRAME_SHAPE_LABELS[item.shape]} frame`;
    case "media":
      return item.item.filename ?? "Upload";
    case "photo":
      return item.photo.title || "Photo";
    case "hiclipart":
      return item.graphic.title || "Hiclipart graphic";
    case "sticker":
      return item.sticker.title;
    case "text":
      return item.variant === "heading" ? "Heading" : "Body text";
    case "pager":
      return "Pager";
  }
}

/** Grid of green screen meme clips from the cortex library. */
function MemeClipGrid({
  onAdd,
}: {
  onAdd?(opts: { src: string; chromaKeyed?: boolean; caption?: string }): void;
}) {
  const [clips, setClips] = useState<
    Array<{
      video_id: string;
      shortcode: string;
      caption: string;
      keyed_path: string;
      raw_path: string;
      likes: number | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  // fetch once on mount
  useState(() => {
    fetch("/api/audio/greenscreen-library")
      .then((r) => r.json())
      .then((d) => setClips(d?.tracks ?? d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  });

  if (loading)
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Loading memes...
      </p>
    );
  if (!clips.length)
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        No meme clips yet.
      </p>
    );

  // Serve directly from R2 custom domain (no proxy, no Vercel bandwidth).
  const previewUrl = (c: (typeof clips)[0]) =>
    cortexGreenScreenRawUrl(c.shortcode, c.video_id);

  return (
    <div className="grid grid-cols-2 gap-2">
      {clips.map((c) => (
        <button
          key={c.video_id}
          type="button"
          onClick={() =>
            onAdd?.({
              // Studio removes green live. Starting with the raw MP4 avoids
              // browser-dependent WebM alpha decoding (which can render black).
              src: previewUrl(c),
              chromaKeyed: true,
              caption: c.caption,
            })
          }
          className="group flex flex-col overflow-hidden rounded-xl text-left transition-colors hover:bg-secondary/40"
          style={{ border: "1px solid var(--hairline)" }}
        >
          <div className="relative aspect-video w-full overflow-hidden bg-black/20">
            <video
              src={previewUrl(c)}
              muted
              loop
              playsInline
              className="size-full object-cover"
              onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
              onMouseLeave={(e) => {
                const v = e.target as HTMLVideoElement;
                v.pause();
                v.currentTime = 0;
              }}
            />
          </div>
          <div className="p-1.5">
            <p className="line-clamp-1 text-[10px] font-medium text-foreground">
              {c.caption?.split("|")[0]?.trim() || "Meme"}
            </p>
            {c.likes != null && (
              <p className="text-[9px] text-muted-foreground">
                {c.likes.toLocaleString()} likes
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
