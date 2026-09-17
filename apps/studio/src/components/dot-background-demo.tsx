import { cn } from "@/lib/utils";

export function DotBackground({
  className,
  color = "color-mix(in srgb, var(--foreground) 28%, transparent)",
  size = 16,
}: {
  className?: string;
  color?: string;
  size?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0", className)}
      style={{
        backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  );
}
