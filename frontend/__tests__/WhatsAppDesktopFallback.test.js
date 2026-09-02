/**
 * MEH-2189 ruling ב' (02/09) — `getWhatsAppHref` returns ONE form, `wa.me`,
 * in every environment.
 *
 * This file is named for what it used to guard: the MEH-152 desktop fallback,
 * where a fine-pointer device got `web.whatsapp.com/send` instead. The name is
 * kept so the history stays greppable; the behaviour it asserts is the new one.
 *
 * Why the branch went rather than being repaired: the SSR HTML always carried
 * wa.me and the rewrite only landed if hydration beat the click — measured at
 * 7 of 20 desktop loads, never later than +1.5s. ~65% of desktop visitors were
 * already getting wa.me with no loop reported, so the branch was buying nothing
 * and costing determinism (`lib/utils.js`, the function's own comment).
 *
 * The discriminating control for the change, run before this file was rewritten:
 * against the new one-form implementation the OLD assertions failed 3 of 5 —
 * `returns web.whatsapp.com URL on desktop`, `includes encoded text in desktop
 * URL`, and `uses correct matchMedia query`. They can only fail if the branch
 * is genuinely gone, so the red is evidence and not decoration (MEH-1619).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getWhatsAppHref } from "../lib/utils.js";

describe("getWhatsAppHref", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a wa.me URL on mobile (matchMedia false)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false });

    expect(getWhatsAppHref("972521234567", "שלום!")).toBe(
      "https://wa.me/972521234567?text=%D7%A9%D7%9C%D7%95%D7%9D!",
    );
  });

  it("returns the SAME wa.me URL on desktop (matchMedia true) — the ruling", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true });

    const href = getWhatsAppHref("972521234567", "שלום!");
    expect(href).toBe("https://wa.me/972521234567?text=%D7%A9%D7%9C%D7%95%D7%9D!");
    expect(href).not.toContain("web.whatsapp.com");
  });

  it("never consults matchMedia at all — the branch is gone, not merely unused", () => {
    // Stronger than asserting the two hrefs match: a function that still called
    // matchMedia and happened to return wa.me on both paths would pass the case
    // above and reintroduce the hydration mismatch. This one cannot.
    const spy = vi.spyOn(window, "matchMedia");

    getWhatsAppHref("972521234567", "test");

    expect(spy).not.toHaveBeenCalled();
  });

  it("is identical under SSR, where window is undefined", () => {
    // The pre-hydration snapshot and the hydrated DOM must agree; that
    // agreement is the entire point of the ruling.
    const realWindow = globalThis.window;
    try {
      delete globalThis.window;
      expect(getWhatsAppHref("972521234567", "שלום!")).toBe(
        "https://wa.me/972521234567?text=%D7%A9%D7%9C%D7%95%D7%9D!",
      );
    } finally {
      globalThis.window = realWindow;
    }
  });

  it("encodes the message text", () => {
    const href = getWhatsAppHref("972501234567", "היי מהמקור");
    expect(href).toContain("text=%D7%94%D7%99%D7%99%20%D7%9E%D7%94%D7%9E%D7%A7%D7%95%D7%A8");
    expect(href.startsWith("https://wa.me/972501234567?text=")).toBe(true);
  });

  it("works with empty text", () => {
    expect(getWhatsAppHref("972521234567")).toBe("https://wa.me/972521234567?text=");
  });
});
