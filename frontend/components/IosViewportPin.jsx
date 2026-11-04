"use client";

import { useEffect } from "react";

/**
 * MEH-2652: re-seat fixed-bottom layers that iOS 26 Safari leaves drifted.
 *
 * The bug (WebKit 297779; Apple forums threads 800125 and 800154): after the
 * on-screen keyboard closes, and sometimes after a scroll-direction change,
 * Safari stops resetting `visualViewport.offsetTop` to 0 and/or leaves the
 * layout viewport shrunk to the keyboard-open height. Every `position: fixed;
 * bottom: …` element is laid out against that stale layout viewport, so on the
 * screen it floats far above the real bottom: the BottomNav pill mid-screen in
 * Sapir's 31/10 screenshots (home footer and event page), with the chat
 * launcher riding up with it.
 *
 * The fix is compensation, not a scroll nudge. Projects that tried the nudge
 * (scrollTo after keyboard close) report it does not stick. Here we measure the
 * gap between the layout viewport's bottom and the visual viewport's bottom:
 *
 *   shift = (visualViewport.offsetTop + visualViewport.height) - innerHeight
 *
 * Healthy page: offsetTop 0, heights equal → shift 0, nothing changes. Drifted
 * page: shift > 0 → published as `--vv-shift` on <html>. Layers that opt in
 * with the `vv-pin` class (globals.css) apply `translate: 0 var(--vv-shift)`,
 * which composes with any `transform` they already use.
 *
 * Deliberately 0 while:
 *  - a text field is focused: the keyboard is legitimately up, and moving the
 *    nav onto the keyboard would steal the room the user is typing in;
 *  - the page is pinch-zoomed: offsetTop is then real panning, not drift;
 *  - the gap is ≤ 1px (sub-pixel rounding) or negative.
 *
 * iOS/iPadOS only. Android and desktop never mount the listeners, so this
 * cannot change anything there.
 */

const NON_TEXT_INPUT_TYPES = new Set([
  "button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit",
]);

export function isIosWebKit(nav) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a desktop Mac UA; touch points give it away.
  return nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;
}

export function isTextEntry(el) {
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  return !NON_TEXT_INPUT_TYPES.has((el.type || "text").toLowerCase());
}

const MAX_SHIFT_RATIO = 0.6;

export function computeViewportShift({ innerHeight, vvHeight, vvOffsetTop, vvScale = 1, editing }) {
  if (editing) return 0;
  if (Math.abs(vvScale - 1) > 0.01) return 0;
  if (!(innerHeight > 0) || !(vvHeight > 0)) return 0;
  const shift = Math.round(vvOffsetTop + vvHeight - innerHeight);
  if (shift <= 1) return 0;
  // The drift is at most a keyboard's height (under half the screen). A larger
  // value is a reading we do not understand, and pushing the nav that far could
  // park it off-screen, which is worse than leaving it where Safari put it.
  return shift <= vvHeight * MAX_SHIFT_RATIO ? shift : 0;
}

// The keyboard's slide-out runs ~250–400ms; offsetTop settles after it.
const SETTLE_CHECKS_MS = [120, 400, 900];

export default function IosViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isIosWebKit(window.navigator)) return undefined;

    const root = document.documentElement;
    let applied = 0;
    let raf = null;
    const timers = new Set();

    const apply = () => {
      raf = null;
      const shift = computeViewportShift({
        innerHeight: window.innerHeight,
        vvHeight: vv.height,
        vvOffsetTop: vv.offsetTop,
        vvScale: vv.scale,
        editing: isTextEntry(document.activeElement),
      });
      if (shift === applied) return;
      applied = shift;
      if (shift) root.style.setProperty("--vv-shift", `${shift}px`);
      else root.style.removeProperty("--vv-shift");
    };
    const schedule = () => {
      if (raf == null) raf = window.requestAnimationFrame(apply);
    };
    const settle = () => {
      schedule();
      for (const ms of SETTLE_CHECKS_MS) {
        const id = setTimeout(() => {
          timers.delete(id);
          schedule();
        }, ms);
        timers.add(id);
      }
    };

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", settle);
    window.addEventListener("pageshow", settle);
    apply();

    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", settle);
      window.removeEventListener("pageshow", settle);
      if (raf != null) window.cancelAnimationFrame(raf);
      for (const id of timers) clearTimeout(id);
      root.style.removeProperty("--vv-shift");
    };
  }, []);

  return null;
}
