/**
 * MEH-149 — trackEvent consent gate
 * Consent stored in localStorage["cookieConsent"]: "all" | "essential" | null
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { trackEvent } from "../lib/analytics.js";

describe("trackEvent consent gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not log when consent is "essential"', () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("essential");

    trackEvent("test_event");

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does not log when consent is null (not set)", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    trackEvent("test_event");

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs in dev when consent is "all"', () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("all");

    trackEvent("producers_chip_toggle", { chip: "organic", active: true });

    expect(consoleSpy).toHaveBeenCalledWith(
      "[track]",
      "producers_chip_toggle",
      { chip: "organic", active: true }
    );
  });

  it("silently handles localStorage errors", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("localStorage unavailable");
    });

    expect(() => trackEvent("test_event")).not.toThrow();
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("is a no-op in SSR context (window undefined)", () => {
    const origWindow = global.window;
    // @ts-ignore
    delete global.window;
    try {
      expect(() => trackEvent("test_event")).not.toThrow();
    } finally {
      global.window = origWindow;
    }
  });
});
