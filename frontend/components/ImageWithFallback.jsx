"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Seed from "@/components/brand/Seed";
import { seedColorFor } from "@/lib/brand-seeds";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * ImageWithFallback — drop-in replacement for next/image that gracefully
 * falls back to a warm branded placeholder when the source is missing or
 * fails to load. Also auto-optimizes Cloudinary URLs (f_auto,q_auto).
 *
 * Props match next/image; `fill` and fixed sizes both supported.
 */
export default function ImageWithFallback({
  src,
  alt = "",
  fill,
  width,
  height,
  sizes,
  className = "",
  style,
  priority,
  aspectRatio, // MEH-1229: optional per-surface crop ratio (from IMAGE_RATIOS)
  optimizeWidth, // MEH-1229: optional Cloudinary width cap (distinct from layout `width`)
  ...rest
}) {
  const optimized = optimizeCloudinary(src, { aspectRatio, width: optimizeWidth });
  const [error, setError] = useState(!optimized);

  // Reset error state when src prop changes (gallery navigation etc.)
  useEffect(() => {
    setError(!optimized);
  }, [optimized]);

  if (error || !optimized) {
    return (
      <div
        aria-label={alt}
        role="img"
        // MEH-2833 (seed layer): sand (background-alt) + one seed, no text —
        // this slot has no name. Replaces the MEH-1400 green-50 + leaf tile.
        className={`flex items-center justify-center overflow-hidden bg-background-alt ${className}`}
        style={{
          width: fill ? "100%" : width,
          height: fill ? "100%" : height,
          position: fill ? "absolute" : "relative",
          inset: fill ? 0 : undefined,
          ...style,
        }}
      >
        <Seed
          color={seedColorFor(alt || src).fill}
          size={40}
          rotate={-36}
          highlight
          className="h-1/2 w-auto max-h-[60px]"
        />
      </div>
    );
  }

  return (
    <Image
      src={optimized}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      className={className}
      style={style}
      priority={priority}
      onError={() => setError(true)}
      {...rest}
    />
  );
}
