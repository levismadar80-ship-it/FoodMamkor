// @ts-check
"use client";

/**
 * Module:   use-intent-prefetch
 * Purpose:  Start loading a page the moment a reader shows intent to open it —
 *           a finger touches the link, the mouse enters it, or it takes focus —
 *           instead of waiting for the tap to finish. On a phone that is the
 *           ~100–300 ms between touchstart and click, and on a static page it
 *           is usually enough to skip the full-screen logo loader
 *           (app/[locale]/loading.js).
 * Does NOT: prefetch on sight. The site chrome keeps prefetch={false} on every
 *           Link (MEH-2850: viewport prefetch of every chrome link cost ~137 KB
 *           after load); this only fetches for someone about to tap.
 * Related:  components/Footer.jsx (first user, MEH-3059), components/BottomNav.jsx,
 *           components/Header.jsx.
 * History:  MEH-3059 (inline in Footer); MEH-3628 (one helper for the whole
 *           chrome — Sapir's choice 21/11: prefetch on touch, not in full).
 */
import { useCallback } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * @returns {(href: string) => { onPointerEnter: () => void, onTouchStart: () => void, onFocus: () => void }}
 *   spread the result on a Link: `<Link prefetch={false} {...intent(href)} />`.
 */
export function useIntentPrefetch() {
  const router = useRouter();
  return useCallback(
    (href) => {
      // Next dedupes repeat prefetches of one href, so a hover then a touch
      // costs one request. A failed prefetch only means the tap fetches.
      const go = () => {
        try {
          router.prefetch(href);
        } catch {
          /* the tap still navigates */
        }
      };
      return { onPointerEnter: go, onTouchStart: go, onFocus: go };
    },
    [router],
  );
}
