// @ts-check
"use client";

/**
 * Module:   use-gsi-reveal
 * Purpose:  Keep Google's sign-in button invisible while Google draws it, and
 *           show it once, when it has settled — so it doesn't flicker.
 * Does NOT: load GSI or call renderButton (lib/use-google-sign-in.js), or
 *           redraw on resize (lib/use-gsi-redraw-on-resize.js).
 * Related:  components/GoogleAuthButton.jsx
 * History:  MEH-3744 (creation).
 *
 * WHY. renderButton draws in stages (measured on staging at phone speed,
 * 23/11): a temporary HTML copy in the system font, then an iframe that
 * replaces it, whose label is blank for ~0.4–0.5 s after the iframe's `load`
 * while Google's web font arrives, then the final label, a little wider. Seen
 * in a modal that has just opened, that reads as "it appeared, then reloaded".
 *
 * The iframe is cross-origin, so there is no "font ready" signal to wait for.
 * The reveal is the iframe's `load` + SETTLE_MS, a measured delay, with a cap
 * (counted from Google's first paint into the slot) so the button can never
 * stay hidden once Google has drawn anything. Once shown it stays shown: a later
 * redraw (MEH-3687, on resize) is a deliberate change, not a first paint.
 *
 * While hidden the slot is `inert`, so a keyboard user can't tab into a button
 * she can't see. React 18 has no `inert` prop, hence the property write.
 *
 * DO NOT reveal on the first child GSI adds — that is the temporary copy, the
 * first stage of the flicker this hook exists to hide (MEH-3744).
 */

import { useEffect, useState } from "react";

/** Delay after the iframe's `load` (label measured back after ~0.4–0.5 s). */
export const GSI_SETTLE_MS = 600;
/** Shown by then whatever happened, counted from Google's first paint into the slot. */
export const GSI_REVEAL_CAP_MS = 3000;

/**
 * @param {{ current: HTMLElement | null }} ref  the slot passed to renderButton
 * @returns {boolean} whether the button may be shown
 */
export function useGsiReveal(ref) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || ready) return;
    let settleTimer = 0;
    let capTimer = 0;
    let frame = null;
    const reveal = () => setReady(true);
    const onFrameLoad = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(reveal, GSI_SETTLE_MS);
    };
    const onMutation = () => {
      // The cap counts from Google's first paint into the slot, not from mount:
      // the script download before it must not use the budget up (MEH-3744).
      if (!capTimer && el.childElementCount > 0) capTimer = window.setTimeout(reveal, GSI_REVEAL_CAP_MS);
      const latest = el.querySelector("iframe");
      if (latest === frame) return;
      // A redraw replaced the iframe: only the newest one's `load` counts.
      frame?.removeEventListener("load", onFrameLoad);
      window.clearTimeout(settleTimer);
      frame = latest;
      frame?.addEventListener("load", onFrameLoad, { once: true });
    };

    onMutation();
    const observer = new MutationObserver(onMutation);
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      frame?.removeEventListener("load", onFrameLoad);
      window.clearTimeout(settleTimer);
      window.clearTimeout(capTimer);
    };
  }, [ref, ready]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.inert = !ready;
  }, [ref, ready]);

  return ready;
}
