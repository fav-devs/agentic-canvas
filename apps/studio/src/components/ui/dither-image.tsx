"use client";

import {
  forwardRef,
  type ComponentProps,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

export type DitherSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
export type DitherRevealDirection =
  "l" | "r" | "t" | "b" | "tl-br" | "tr-bl" | "bl-tr" | "br-tl" | "radial";

const DITHER_SIZE_CLASS: Record<DitherSize, string> = {
  xs: "dither-xs",
  sm: "dither-sm",
  md: "dither-md",
  lg: "dither-lg",
  xl: "dither-xl",
  "2xl": "dither-2xl",
};

type DitherVars = CSSProperties & {
  "--dither-gray"?: number;
  "--dither-contrast"?: number;
  "--dither-bright"?: number;
  "--dither-blur"?: string;
  "--dither-opacity"?: number;
};

export const DitherImage = forwardRef<HTMLElement, ComponentProps<"figure">>(
  function DitherImage({ className, ...props }, ref) {
    return (
      <figure
        ref={ref}
        className={cn("inline-flex flex-col gap-3", className)}
        data-slot="dither-image"
        {...props}
      />
    );
  },
);

export interface DitherImageFrameProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "style"
> {
  size?: DitherSize;
  aspectRatio?: string | number;
  grayscale?: number;
  contrast?: number;
  brightness?: number;
  blur?: number;
  opacity?: number;
  rounded?: boolean;
  style?: DitherVars;
}

export const DitherImageFrame = forwardRef<
  HTMLDivElement,
  DitherImageFrameProps
>(function DitherImageFrame(
  {
    className,
    size = "lg",
    aspectRatio,
    grayscale,
    contrast,
    brightness,
    blur,
    opacity,
    rounded = true,
    style,
    ...props
  },
  ref,
) {
  const variables: DitherVars = {
    ...style,
    ...(grayscale === undefined ? {} : { "--dither-gray": grayscale }),
    ...(contrast === undefined ? {} : { "--dither-contrast": contrast }),
    ...(brightness === undefined ? {} : { "--dither-bright": brightness }),
    ...(blur === undefined ? {} : { "--dither-blur": `${blur}px` }),
    ...(opacity === undefined ? {} : { "--dither-opacity": opacity }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
  };

  return (
    <div
      ref={ref}
      className={cn(
        DITHER_SIZE_CLASS[size],
        "relative block w-full overflow-hidden",
        rounded && "rounded-xl",
        className,
      )}
      data-slot="dither-image-frame"
      style={variables}
      {...props}
    />
  );
});

export type DitherImageContentProps = ImageProps;

export const DitherImageContent = forwardRef<
  HTMLImageElement,
  DitherImageContentProps
>(function DitherImageContent({ className, alt, ...props }, ref) {
  return (
    <Image
      ref={ref}
      alt={alt}
      className={cn("block size-full object-cover", className)}
      data-slot="dither-image-content"
      {...props}
    />
  );
});

export const DitherImageReveal = forwardRef<
  HTMLDivElement,
  ComponentProps<"div">
>(function DitherImageReveal({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("relative overflow-hidden", className)}
      data-slot="dither-image-reveal"
      {...props}
    />
  );
});

export interface DitherImageOverlayProps extends Omit<ImageProps, "style"> {
  direction?: DitherRevealDirection;
  from?: number;
  to?: number;
  style?: CSSProperties;
}

export const DitherImageOverlay = forwardRef<
  HTMLImageElement,
  DitherImageOverlayProps
>(function DitherImageOverlay(
  { className, direction = "r", from = 0, to = 65, style, alt, ...props },
  ref,
) {
  const maskImage = createRevealMask(direction, from, to);
  return (
    <Image
      ref={ref}
      alt={alt}
      className={cn(
        "pointer-events-none absolute inset-0 size-full object-cover",
        className,
      )}
      data-slot="dither-image-overlay"
      style={{ WebkitMaskImage: maskImage, maskImage, ...style }}
      {...props}
    />
  );
});

export const DitherImageCaption = forwardRef<
  HTMLElement,
  ComponentProps<"figcaption">
>(function DitherImageCaption({ className, ...props }, ref) {
  return (
    <figcaption
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      data-slot="dither-image-caption"
      {...props}
    />
  );
});

function createRevealMask(
  direction: DitherRevealDirection,
  from: number,
  to: number,
) {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const axis = {
    r: "to right",
    l: "to left",
    t: "to bottom",
    b: "to top",
    "tl-br": "to bottom right",
    "tr-bl": "to bottom left",
    "bl-tr": "to top right",
    "br-tl": "to top left",
  } as const;
  return direction === "radial"
    ? `radial-gradient(circle at center, black ${start}%, transparent ${end}%)`
    : `linear-gradient(${axis[direction]}, black ${start}%, transparent ${end}%)`;
}
