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
import { useCallback, useRef } from "react";
import { useRouter } from "@/i18n/navigation";

/**
 * @returns {(href: string) => { onPointerEnter: () => void, onTouchStart: () => void, onFocus: () => void }}
 *   spread the result on a Link: `<Link prefetch={false} {...intent(href)} />`.
 *   Don't spread it on a link to the page already open (BottomNav skips the
 *   active tab): that would ask the server to render the page you are on.
 */
export function useIntentPrefetch() {
  const router = useRouter();
  // One prefetch per href for the life of this component: a hover, then a
  // touch, then focus on the same link ask once. Kept here rather than relying
  // on Next's own dedupe, which is an internal detail (MEH-3628 review).
  const asked = useRef(new Set());
  return useCallback(
    (href) => {
      const go = () => {
        if (asked.current.has(href)) return;
        asked.current.add(href);
        try {
          router.prefetch(href);
        } catch {
          // A failed prefetch only means the tap fetches; a later intent may retry.
          asked.current.delete(href);
        }
      };
      return { onPointerEnter: go, onTouchStart: go, onFocus: go };
    },
    [router],
  );
}
