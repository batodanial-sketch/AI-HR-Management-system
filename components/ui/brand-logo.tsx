import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * BrandLogo — the Fluxentiq application mark, used everywhere the app
 * previously rendered a placeholder Hexagon icon.
 *
 * Resolution order:
 *   1. Admin-configured white-label logo (branding.logoUrl).
 *   2. The bundled app mark (/brand/fluxentiq-mark.png).
 *
 * `size` controls both dimensions; the mark is always square.
 */
export function BrandLogo({
  size = 32,
  logoUrl,
  className,
  alt = "Fluxentiq",
}: {
  size?: number;
  logoUrl?: string;
  className?: string;
  alt?: string;
}) {
  const src = logoUrl || "/brand/fluxentiq-mark.png";
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      unoptimized
      priority={size >= 32}
    />
  );
}

/**
 * BrandWordmark — the horizontal logo (mark + text) for headers/nav.
 * Uses the bundled wordmark image (/brand/fluxentiq-wordmark.png).
 */
export function BrandWordmark({
  height = 28,
  logoUrl,
  className,
  alt = "Fluxentiq",
}: {
  height?: number;
  logoUrl?: string;
  className?: string;
  alt?: string;
}) {
  const src = logoUrl || "/brand/fluxentiq-wordmark.png";
  return (
    <Image
      src={src}
      alt={alt}
      width={Math.round(height * 2.24)} // 132×59 aspect ratio
      height={height}
      className={cn("h-auto w-auto object-contain", className)}
      unoptimized
      priority
    />
  );
}
