import Image from "next/image";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * Module:   EditorialPhoto
 * Purpose:  One 16:9 photo inside a max-w-3xl text column — the visual break
 *           /join, /about/for-businesses and /about/why-local lacked (MEH-2597,
 *           29/10 image survey: the three pages carried no image at any width).
 * Props:    src (Cloudinary URL), testId, priority (above the fold only).
 * Does NOT: carry an alt. These photos are decorative — the copy around them
 *           says everything they show — and a written alt is new copy, which
 *           needs Sapir's word-for-word approval (same call as the /about duo
 *           front image, AboutClient.jsx:52).
 */
// Delivered width: 2× the 343px phone column, and above the ~720px desktop
// column, without passing hero-market's 2400px source on the c_fill path.
const PHOTO_WIDTH = 1200;

export default function EditorialPhoto({ src, testId, priority = false, className = "" }) {
  return (
    <div
      className={`relative w-full aspect-video overflow-hidden rounded-[10px] bg-border ${className}`}
      data-testid={testId}
    >
      <Image
        src={optimizeCloudinary(src, { aspectRatio: "16:9", width: PHOTO_WIDTH })}
        alt=""
        fill
        priority={priority}
        sizes="(min-width: 768px) 720px, calc(100vw - 32px)"
        className="object-cover"
      />
    </div>
  );
}
