"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { useMediaList } from "@/lib/studio-host-bridge";
import {
  encodeStudioDragItem,
  STUDIO_DRAG_MIME,
} from "@/lib/creative/drag-payload";
import { toDisplayMediaUrl } from "@/lib/media-url";

/** A row from the tenant's media library, narrowed to what the canvas needs. */
export type CreativeMediaItem = {
  id: string;
  key: string;
  url: string;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  thumbnailUrl: string | null;
};

type MediaListResponse = {
  data?: CreativeMediaItem[];
  pagination?: { page: number; totalPages: number; total: number };
};

const PAGE_SIZE = 24;

/**
 * Browse images already in the workspace's media library instead of only being
 * able to upload a new file. Videos and other non-image assets are filtered out
 * — the canvas can't place them.
 */
export function MediaLibraryPicker({
  onSelect,
  disabled = false,
}: {
  onSelect(item: CreativeMediaItem): void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Provenance tabs so imported stickers/photos don't clutter real uploads.
  const [tab, setTab] = useState<"upload" | "sticker" | "photo">("upload");
  const query = useMediaList(
    page,
    PAGE_SIZE,
    undefined,
    search || undefined,
    tab,
  );
  const response = query.data as MediaListResponse | undefined;

  const images = useMemo(
    () =>
      (response?.data ?? []).filter((item) =>
        item.mimeType?.startsWith("image/"),
      ),
    [response?.data],
  );
  const totalPages = response?.pagination?.totalPages ?? 1;

  return (
    <div className="space-y-3">
      <div
        className="flex gap-0.5 rounded-xl p-0.5"
        style={{ border: "1px solid var(--hairline)" }}
      >
        {(
          [
            { value: "upload", label: "Uploads" },
            { value: "sticker", label: "Stickers" },
            { value: "photo", label: "Photos" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setTab(option.value);
              setPage(1);
            }}
            className={`flex-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors ${
              tab === option.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="relative block">
        <IconSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search your media"
          aria-label="Search media library"
          className="h-9 w-full rounded-xl bg-transparent pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground"
          style={{ border: "1px solid var(--hairline)" }}
        />
      </label>

      {query.isLoading ? (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          Loading media…
        </p>
      ) : images.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          {search
            ? "Nothing matches that search."
            : "Images you upload anywhere in Agentic Canvas show up here."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {images.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(item)}
                draggable={!disabled}
                onDragStart={(event) => {
                  // Drop lands the image where the pointer is, or fills the
                  // frame underneath it.
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(
                    STUDIO_DRAG_MIME,
                    encodeStudioDragItem({ kind: "media", item }),
                  );
                }}
                title={item.filename}
                className="block w-full cursor-grab overflow-hidden rounded-lg transition-opacity hover:opacity-80 active:cursor-grabbing disabled:opacity-40"
                style={{ border: "1px solid var(--hairline)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- tenant media on an arbitrary storage host */}
                <img
                  src={toDisplayMediaUrl(item.thumbnailUrl || item.url)}
                  alt={item.filename}
                  loading="lazy"
                  className="aspect-square w-full bg-[var(--inset)] object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg px-2 py-1 transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Previous
          </button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            className="rounded-lg px-2 py-1 transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
