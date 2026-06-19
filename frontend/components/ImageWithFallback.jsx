"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Leaf } from "@phosphor-icons/react";
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
  ...rest
}) {
  const optimized = optimizeCloudinary(src);
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
        className={`flex items-center justify-center ${className}`}
        style={{
          background: "#F5F0E8",
          width: fill ? "100%" : width,
          height: fill ? "100%" : height,
          position: fill ? "absolute" : "relative",
          inset: fill ? 0 : undefined,
          ...style,
        }}
      >
        <Leaf size={40} className="text-primary/70" aria-hidden="true" />
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
