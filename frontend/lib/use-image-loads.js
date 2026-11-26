// @ts-check
"use client";

/**
 * Module:   use-image-loads
 * Purpose:  For a picture drawn as a CSS `background-image` (no <img>, so no
 *           onError): returns the URL while it loads or has loaded, and null
 *           once the browser reports it cannot load — so the caller draws its
 *           no-photo tile instead of an empty box.
 * Does NOT: pick WHICH photo (that is the API's `first_image`, MEH-3894, and
 *           `withOwnGallery`); does not handle <img> — `ImageWithFallback`
 *           already does.
 * History:  MEH-3894 (a dead first-photo URL left an empty box on the event,
 *           home, cover and rescue rows).
 */

import { useEffect, useState } from "react";

/**
 * @param {string | null | undefined} url the URL the element will paint
 * @returns {string | null} `url`, or null after it failed to load
 */
export default function useImageLoads(url) {
  const [failed, setFailed] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    if (!url || typeof window === "undefined" || typeof window.Image !== "function") return undefined;
    let live = true;
    const probe = new window.Image();
    probe.onerror = () => {
      if (live) setFailed(url);
    };
    probe.src = url;
    return () => {
      live = false;
    };
  }, [url]);
  return url && failed !== url ? url : null;
}
