import type React from "react";
import { cn } from "@/lib/utils";

export type TextureVariant =
  | "fabric-of-squares"
  | "grid-noise"
  | "inflicted"
  | "debut-light"
  | "groovepaper"
  | "none";

interface BackgroundImageTextureProps {
  variant?: TextureVariant;
  opacity?: number;
  className?: string;
  children?: React.ReactNode;
}

export const TEXTURE_URLS: Record<Exclude<TextureVariant, "none">, string> = {
  "fabric-of-squares": "/textures/fabric-of-squares.png",
  "grid-noise": "/textures/grid-noise.png",
  inflicted: "/textures/inflicted.png",
  "debut-light": "/textures/debut-light.png",
  groovepaper: "/textures/groovepaper.png",
};

export function BackgroundImageTexture({
  variant = "fabric-of-squares",
  opacity = 0.5,
  className,
  children,
}: BackgroundImageTextureProps) {
  const textureUrl = variant === "none" ? null : TEXTURE_URLS[variant];

  return (
    <div className={cn("relative", className)}>
      {textureUrl ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${textureUrl})`,
            backgroundRepeat: "repeat",
            opacity,
          }}
        />
      ) : null}
      {children ? <div className="relative">{children}</div> : null}
    </div>
  );
}
