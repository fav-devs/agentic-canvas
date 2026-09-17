"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreativeDocument,
  CreativeFont,
  CreativePage,
} from "@/lib/creative/document";

type ThumbnailInput = {
  page: CreativePage;
  fonts: CreativeFont[];
  pageIndex: number;
  pageCount: number;
  width: number;
  height: number;
};

/**
 * A faithful, non-interactive page preview. Rendering is delegated to the same
 * Fabric factories as export, so frames, image effects, drawings and text do
 * not drift from what is on the Studio canvas.
 */
export function CreativePageThumbnail({
  page,
  fonts,
  pageIndex,
  pageCount,
  width,
  height,
  fallbackUrl,
  alt = "",
  debounceMs = 120,
  className = "size-full object-contain",
}: ThumbnailInput & {
  fallbackUrl?: string | null;
  alt?: string;
  debounceMs?: number;
  className?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const inputRef = useRef<ThumbnailInput>({
    page,
    fonts,
    pageIndex,
    pageCount,
    width,
    height,
  });
  inputRef.current = { page, fonts, pageIndex, pageCount, width, height };

  // Commands clone the whole document. A content key prevents an edit on one
  // slide from needlessly rerendering every other thumbnail in the filmstrip.
  const renderKey = useMemo(
    () =>
      JSON.stringify({
        page,
        fonts,
        pageIndex,
        pageCount,
        width,
        height,
      }),
    [fonts, height, page, pageCount, pageIndex, width],
  );

  useEffect(() => {
    let active = true;
    let generatedUrl: string | undefined;
    const timer = window.setTimeout(() => {
      void import("./fabric-stage")
        .then(({ renderCreativePageToBlob }) => {
          const input = inputRef.current;
          const multiplier = Math.min(
            1,
            360 / Math.max(input.width, input.height),
          );
          return renderCreativePageToBlob({ ...input, multiplier });
        })
        .then((blob) => {
          generatedUrl = URL.createObjectURL(blob);
          if (!active) {
            URL.revokeObjectURL(generatedUrl);
            return;
          }
          setPreviewUrl(generatedUrl);
        })
        .catch(() => {
          // Keep the previous/server thumbnail. A preview failure must never
          // stop a design from opening.
        });
    }, debounceMs);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [debounceMs, renderKey]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const source = previewUrl ?? fallbackUrl;
  if (!source) {
    return (
      <span
        aria-hidden
        className="block size-full animate-pulse"
        style={{ backgroundColor: page.background }}
      />
    );
  }

  // Blob URLs and tenant media can live outside Next Image's configured hosts.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={source} alt={alt} draggable={false} className={className} />;
}

export function CreativeDocumentThumbnail({
  document,
  ...props
}: {
  document: CreativeDocument;
  fallbackUrl?: string | null;
  alt?: string;
  debounceMs?: number;
  className?: string;
}) {
  const page = document.pages[0];
  if (!page) return null;
  return (
    <CreativePageThumbnail
      page={page}
      fonts={document.fonts}
      pageIndex={0}
      pageCount={document.pages.length}
      width={document.canvas.width}
      height={document.canvas.height}
      {...props}
    />
  );
}
