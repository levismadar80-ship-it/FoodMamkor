/**
 * MEH-3196 — withdrawing cookie consent is as easy as giving it.
 *
 * Before: the banner showed once, and the privacy policy pointed to "browser
 * settings" as the only way back. Now the footer's «הגדרות עוגיות» re-opens the
 * banner, and moving from "all" to "essential" reloads the page so analytics,
 * Clarity and session replay (attached once, in place) stop.
 * DISCRIMINATION: on staging before MEH-3196 `openCookieSettings` does not
 * exist and the banner never re-opens once answered, so every case below fails.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import CookieBanner from "@/components/CookieBanner";
import { openCookieSettings } from "@/lib/cookie-consent";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>{children}</a>
  ),
}));
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useTranslations: () => t };
});

// jsdom has no ResizeObserver; the banner publishes its height with one.
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };

const reload = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  localStorage.clear();
  reload.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...realLocation, reload },
  });
});
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  localStorage.clear();
});

describe("cookie settings re-open the banner", () => {
  it("an answered visitor sees no banner until she opens the settings", () => {
    localStorage.setItem("cookieConsent", "all");
    render(<CookieBanner />);
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
    act(() => openCookieSettings());
    expect(screen.getByTestId("cookie-banner")).toBeTruthy();
  });

  it("all → essential saves the new answer and reloads the page", () => {
    localStorage.setItem("cookieConsent", "all");
    render(<CookieBanner />);
    act(() => openCookieSettings());
    fireEvent.click(screen.getByTestId("cookie-essential-only"));
    expect(localStorage.getItem("cookieConsent")).toBe("essential");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
  });

  it("essential → all saves without a reload (the gates attach in place)", () => {
    localStorage.setItem("cookieConsent", "essential");
    render(<CookieBanner />);
    act(() => openCookieSettings());
    fireEvent.click(screen.getByTestId("cookie-accept-all"));
    expect(localStorage.getItem("cookieConsent")).toBe("all");
    expect(reload).not.toHaveBeenCalled();
  });

  it("a first answer of essential does not reload", () => {
    render(<CookieBanner />);
    fireEvent.click(screen.getByTestId("cookie-essential-only"));
    expect(reload).not.toHaveBeenCalled();
  });
});
