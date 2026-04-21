/**
 * MEH-152 — WhatsApp desktop fallback
 * getWhatsAppHref() returns web.whatsapp.com on desktop, wa.me on mobile/SSR.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getWhatsAppHref } from "../lib/utils.js";

describe("getWhatsAppHref", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns wa.me URL on mobile (matchMedia returns false)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false });

    const href = getWhatsAppHref("972521234567", "שלום!");
    expect(href).toBe("https://wa.me/972521234567?text=%D7%A9%D7%9C%D7%95%D7%9D!");
  });

  it("returns web.whatsapp.com URL on desktop (matchMedia returns true)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true });

    const href = getWhatsAppHref("972521234567", "שלום!");
    expect(href).toContain("https://web.whatsapp.com/send");
    expect(href).toContain("phone=972521234567");
  });

  it("includes encoded text in desktop URL", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true });

    const href = getWhatsAppHref("972501234567", "היי מהמקור");
    expect(href).toContain("text=");
    expect(href).toContain("phone=972501234567");
  });

  it("works with empty text", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false });

    const href = getWhatsAppHref("972521234567");
    expect(href).toBe("https://wa.me/972521234567?text=");
  });

  it("uses correct matchMedia query for desktop detection", () => {
    const spy = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false });

    getWhatsAppHref("972521234567", "test");
    expect(spy).toHaveBeenCalledWith("(hover: hover) and (pointer: fine)");
  });
});
