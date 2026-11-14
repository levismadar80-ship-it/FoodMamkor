/**
 * MEH-2714 — useHomePage restores the reader's scroll / grid size only on a
 * history return, and only when the browser's own restore fell short.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

let historyReturn = false;
vi.mock("@/lib/route-memory", () => ({ consumeHistoryReturn: () => historyReturn }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k, useLocale: () => "he" }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ city: null, setCity: vi.fn() }) }));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/toast", () => ({ showToast: { info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/user-location", () => ({ getUserLocation: () => null, setUserLocation: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));

import { useHomePage } from "@/lib/use-home-page";

const producers = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` }));
const flushFrames = () => act(() => new Promise((r) => setTimeout(r, 50)));

let scrollToSpy;
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
  window.sessionStorage.setItem("home_scroll_y", "1500");
  window.sessionStorage.setItem("home_visible_count", "16");
  scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => setTimeout(cb, 0));
});
afterEach(() => vi.restoreAllMocks());

function setScrollY(y) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

describe("useHomePage back-navigation restore (MEH-2714)", () => {
  it("a link arrival (logo) ignores the stash: no scroll, first page of cards", async () => {
    historyReturn = false;
    setScrollY(0);
    const { result } = renderHook(() => useHomePage({ initialProducers: producers, initialCategories: [] }));
    await flushFrames();
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(result.current.visibleCount).toBe(8);
  });

  it("a history return whose native restore fell short is corrected to the stash", async () => {
    historyReturn = true;
    setScrollY(400); // > 120px away from 1500
    const { result } = renderHook(() => useHomePage({ initialProducers: producers, initialCategories: [] }));
    await flushFrames();
    expect(scrollToSpy).toHaveBeenCalledWith(0, 1500);
    expect(result.current.visibleCount).toBe(16);
  });

  it("a history return the browser already restored is left alone", async () => {
    historyReturn = true;
    setScrollY(1476); // within tolerance
    renderHook(() => useHomePage({ initialProducers: producers, initialCategories: [] }));
    await flushFrames();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("stashes the position on a link click, not on any other click", async () => {
    historyReturn = false;
    renderHook(() => useHomePage({ initialProducers: producers, initialCategories: [] }));
    const button = document.createElement("button");
    const link = document.createElement("a");
    link.setAttribute("href", "/meshek-barak");
    link.addEventListener("click", (e) => e.preventDefault());
    document.body.append(button, link);
    setScrollY(900);
    act(() => button.click());
    expect(window.sessionStorage.getItem("home_scroll_y")).toBe("1500");
    act(() => link.click());
    expect(window.sessionStorage.getItem("home_scroll_y")).toBe("900");
  });
});
