// @ts-check
"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * iOS drift pin (Linear 2652; the full id trips the MEH-449 build-output scan): re-seat fixed-bottom layers that iOS 26 Safari leaves drifted.
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
 * Where a fixed-bottom layer actually sits is MEASURED, not inferred from
 * `innerHeight` (MEH-3889): a 0-height `position: fixed; bottom: 0` probe is
 * read with getBoundingClientRect(). Sapir's 26/11 iPhone screenshot (home
 * feed, after a fast scroll) had the pill and the chat launcher ~350px above
 * the screen bottom with the pin already shipped — so Safari placed the fixed
 * layers against a stale viewport while `innerHeight` itself read healthy, and
 * the old `vvBottom - innerHeight` came out 0. The probe sits wherever Safari
 * puts every other `bottom: 0` layer, so the gap is right in both shapes. With
 * no layout (jsdom, display:none) the probe reads 0 and `innerHeight` is used.
 *
 * Deliberately 0 while:
 *  - the keyboard is actually up (a text field is focused AND the visual
 *    viewport is clearly shorter than the layout viewport). Focus alone is not
 *    enough: an iPad hardware keyboard or a dismissed keyboard can leave the
 *    field focused in exactly the drifted state this exists for;
 *  - the page is pinch-zoomed: offsetTop is then real panning, not drift;
 *  - the gap is ≤ 1px (sub-pixel rounding) or negative.
 *
 * A non-zero shift is applied only once it has held for SETTLE_MS, so a
 * transient height mismatch while the toolbar collapses mid-scroll never moves
 * anything. Returning to 0 is immediate.
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

// The on-screen keyboard is never shorter than this.
const KEYBOARD_MIN_PX = 120;

export function computeViewportShift({
  innerHeight,
  vvHeight,
  vvOffsetTop,
  vvScale = 1,
  editing,
  fixedBottom,
}) {
  if (editing && innerHeight - vvHeight > KEYBOARD_MIN_PX) return 0;
  if (Math.abs(vvScale - 1) > 0.01) return 0;
  if (!(innerHeight > 0) || !(vvHeight > 0)) return 0;
  // Where Safari really put a `bottom: 0` fixed layer; innerHeight when unknown.
  const layerBottom = fixedBottom > 0 ? fixedBottom : innerHeight;
  const shift = Math.round(vvOffsetTop + vvHeight - layerBottom);
  if (shift <= 1) return 0;
  // The drift is at most a keyboard's height (under half the screen). A larger
  // value is a reading we do not understand, and pushing the nav that far could
  // park it off-screen, which is worse than leaving it where Safari put it.
  return shift <= vvHeight * MAX_SHIFT_RATIO ? shift : 0;
}

// The keyboard's slide-out runs ~250–400ms; offsetTop settles after it.
const SETTLE_CHECKS_MS = [120, 400, 900];
// A non-zero reading must hold this long before it moves anything.
export const SETTLE_MS = 200;

export default function IosViewportPin() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isIosWebKit(window.navigator)) return undefined;

    const root = document.documentElement;
    // The probe: where Safari places a `position: fixed; bottom: 0` layer.
    // Not `vv-pin`, so --vv-shift never moves it and it keeps reading the drift.
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.dataset.vvProbe = "";
    probe.style.cssText =
      "position:fixed;bottom:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
    let reported = false;
    let applied = 0;
    let raf = null;
    let pending = null; // { shift, timer } — a non-zero reading waiting to settle
    const timers = new Set();

    const write = (shift) => {
      applied = shift;
      if (shift && !reported) {
        // Once per page load: real-device evidence that the drift happened and
        // what each reading said (no device in CI can produce it).
        reported = true;
        trackEvent("ios_viewport_drift", {
          shift,
          inner_height: window.innerHeight,
          vv_height: Math.round(vv.height),
          vv_offset_top: Math.round(vv.offsetTop),
          fixed_bottom: Math.round(probe.getBoundingClientRect().top),
          standalone: window.navigator.standalone === true,
        });
      }
      if (shift) root.style.setProperty("--vv-shift", `${shift}px`);
      else root.style.removeProperty("--vv-shift");
    };
    const read = () =>
      computeViewportShift({
        innerHeight: window.innerHeight,
        vvHeight: vv.height,
        vvOffsetTop: vv.offsetTop,
        vvScale: vv.scale,
        editing: isTextEntry(document.activeElement),
        fixedBottom: probe.getBoundingClientRect().top,
      });
    const clearPending = () => {
      if (pending) clearTimeout(pending.timer);
      pending = null;
    };
    const apply = () => {
      raf = null;
      const shift = read();
      if (shift === applied) return clearPending();
      if (shift === 0) {
        clearPending();
        return write(0);
      }
      if (pending && pending.shift === shift) return;
      clearPending();
      pending = {
        shift,
        timer: setTimeout(() => {
          pending = null;
          if (read() === shift) write(shift);
        }, SETTLE_MS),
      };
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
    window.addEventListener("resize", schedule);
    // A fast scroll can drift the layers with no visualViewport event at all.
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scrollend", settle);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", settle);
    window.addEventListener("pageshow", settle);
    apply();

    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("scrollend", settle);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", settle);
      window.removeEventListener("pageshow", settle);
      if (raf != null) window.cancelAnimationFrame(raf);
      for (const id of timers) clearTimeout(id);
      clearPending();
      probe.remove();
      root.style.removeProperty("--vv-shift");
    };
  }, []);

  return null;
}
