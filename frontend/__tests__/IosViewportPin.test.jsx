/**
 * MEH-2652 — iOS 26 Safari fixed-bottom drift compensation.
 *
 * jsdom cannot reproduce the WebKit bug, so the decision is tested as a pure
 * function and the component is driven with a stubbed visualViewport.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import IosViewportPin, {
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
  it("text field focused (keyboard legitimately up) → 0", () => {
    expect(computeViewportShift({ ...base, vvOffsetTop: 300, editing: true })).toBe(0);
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
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb();
      return 1;
    });
    return stub;
  };

  it("on iPhone publishes --vv-shift while drifted and clears it when healthy", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
    const vv = stubViewport({ offsetTop: 300 });
    render(<IosViewportPin />);
    expect(shiftVar()).toBe("300px");

    act(() => {
      vv.offsetTop = 0;
      vv.dispatchEvent(new Event("scroll"));
    });
    expect(shiftVar()).toBe("");
  });

  it("removes the var on unmount", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone)");
    stubViewport({ offsetTop: 40 });
    const { unmount } = render(<IosViewportPin />);
    expect(shiftVar()).toBe("40px");
    unmount();
    expect(shiftVar()).toBe("");
  });

  it("does nothing off iOS, even with the same drifted reading", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14)");
    stubViewport({ offsetTop: 300 });
    render(<IosViewportPin />);
    expect(shiftVar()).toBe("");
  });
});
