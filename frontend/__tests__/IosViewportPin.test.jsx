/**
 * MEH-2652 — iOS 26 Safari fixed-bottom drift compensation.
 *
 * jsdom cannot reproduce the WebKit bug, so the decision is tested as a pure
 * function and the component is driven with a stubbed visualViewport.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import IosViewportPin, {
  SETTLE_MS,
  computeViewportShift,
  isIosWebKit,
  isTextEntry,
} from "@/components/IosViewportPin";

const shiftVar = () => document.documentElement.style.getPropertyValue("--vv-shift");

describe("computeViewportShift", () => {
  const base = { innerHeight: 664, vvHeight: 664, vvOffsetTop: 0, vvScale: 1, editing: false };

  it("healthy page → 0", () => {
    expect(computeViewportShift(base)).toBe(0);
  });
  it("offsetTop stuck after the keyboard closed → shift by it", () => {
    expect(computeViewportShift({ ...base, vvOffsetTop: 24 })).toBe(24);
  });
  it("layout viewport stuck at keyboard height → shift by the difference", () => {
    expect(computeViewportShift({ ...base, innerHeight: 364 })).toBe(300);
  });
  it("keyboard actually up (field focused, visual viewport short) → 0", () => {
    expect(computeViewportShift({ ...base, vvHeight: 364, vvOffsetTop: 300, editing: true })).toBe(0);
  });
  it("field still focused but no keyboard (iPad hardware keyboard) → still compensates", () => {
    expect(computeViewportShift({ ...base, innerHeight: 364, editing: true })).toBe(300);
  });
  it("pinch-zoomed → 0", () => {
    expect(computeViewportShift({ ...base, vvOffsetTop: 200, vvScale: 2 })).toBe(0);
  });
  it("sub-pixel or negative gaps → 0", () => {
    expect(computeViewportShift({ ...base, vvOffsetTop: 1 })).toBe(0);
    expect(computeViewportShift({ ...base, vvHeight: 400 })).toBe(0);
  });
  it("a gap larger than the visible height is not trusted → 0", () => {
    expect(computeViewportShift({ ...base, innerHeight: 10, vvHeight: 664 })).toBe(0);
  });
});

describe("isIosWebKit / isTextEntry", () => {
  it("detects iPhone and iPadOS-as-Mac, not Android or desktop", () => {
    expect(isIosWebKit({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)" })).toBe(true);
    expect(isIosWebKit({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIosWebKit({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIosWebKit({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe(false);
  });
  it("text inputs count as typing, buttons and checkboxes do not", () => {
    const el = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      return d.firstChild;
    };
    expect(isTextEntry(el('<input type="email">'))).toBe(true);
    expect(isTextEntry(el("<textarea></textarea>"))).toBe(true);
    expect(isTextEntry(el('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(el("<button></button>"))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe("IosViewportPin component", () => {
  const originalVV = Object.getOwnPropertyDescriptor(window, "visualViewport");
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalVV) Object.defineProperty(window, "visualViewport", originalVV);
    else delete window.visualViewport;
    document.documentElement.style.removeProperty("--vv-shift");
  });

  const stubViewport = (vv) => {
    const target = new EventTarget();
    const stub = Object.assign(target, { height: 664, offsetTop: 0, scale: 1, ...vv });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: stub });
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(664);
    // rAF on the fake clock, returning the id BEFORE the callback runs.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => setTimeout(cb, 16));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => clearTimeout(id));
    return stub;
  };

  const iphone = () =>
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
  const tick = (ms) => act(() => vi.advanceTimersByTime(ms));
  const fire = (vv, type = "scroll") => act(() => vv.dispatchEvent(new Event(type)));

  it("on iPhone publishes --vv-shift once the drift settles, clears it when healthy, and re-applies", () => {
    vi.useFakeTimers();
    iphone();
    const vv = stubViewport({ offsetTop: 300 });
    render(<IosViewportPin />);
    expect(shiftVar()).toBe(""); // not yet settled
    tick(SETTLE_MS + 20);
    expect(shiftVar()).toBe("300px");

    vv.offsetTop = 0;
    fire(vv);
    tick(20);
    expect(shiftVar()).toBe(""); // back to 0 immediately

    vv.offsetTop = 120; // drifts again: a second event must still be heard
    fire(vv, "resize");
    tick(SETTLE_MS + 40);
    expect(shiftVar()).toBe("120px");
  });

  it("a transient mismatch that heals before it settles never moves anything", () => {
    vi.useFakeTimers();
    iphone();
    const vv = stubViewport({ offsetTop: 0 });
    render(<IosViewportPin />);
    vv.offsetTop = 60; // toolbar mid-collapse
    fire(vv);
    tick(50);
    expect(shiftVar()).toBe(""); // not moved mid-collapse
    vv.offsetTop = 0;
    fire(vv);
    tick(SETTLE_MS * 2);
    expect(shiftVar()).toBe("");
  });

  it("removes the var on unmount", () => {
    vi.useFakeTimers();
    iphone();
    stubViewport({ offsetTop: 40 });
    const { unmount } = render(<IosViewportPin />);
    tick(SETTLE_MS + 20);
    expect(shiftVar()).toBe("40px");
    unmount();
    expect(shiftVar()).toBe("");
  });

  it("does nothing off iOS, even with the same drifted reading", () => {
    vi.useFakeTimers();
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
    stubViewport({ offsetTop: 300 });
    render(<IosViewportPin />);
    tick(SETTLE_MS * 2);
    expect(shiftVar()).toBe("");
  });
});

describe(".vv-pin stylesheet rule", () => {
  // The rule must carry NO fallback: with --vv-shift absent the declaration is
  // invalid at computed-value time and `translate` resolves to `none`. A
  // `0px` fallback would make every pinned layer a containing block for fixed
  // descendants on every platform (MEH-2622 class), so guard the source text.
  it("translates by --vv-shift with no fallback value", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
    const rule = css.match(/\.vv-pin\s*\{([^}]*)\}/);
    expect(rule, ".vv-pin rule exists in globals.css").not.toBeNull();
    expect(rule[1]).toMatch(/translate:\s*0\s+var\(--vv-shift\)\s*;/);
  });
});
