import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";

// MEH-1083 (MEH-1077 DISC-02): the homepage chip row renders all 7 CHIPS_CONFIG
// chips and buildChipParams sends all 7 to the API, but updateURL serialized
// only kosher/organic/delivery/verified and mount-init read the same 4 — so
// gluten_free/vegan/lactose_free filtered results without ever reaching the
// URL, and a shared/refreshed URL silently dropped them. These tests pin the
// 7-key round-trip: toggle → URL param, and deep-link → hydrated chip state.

const router = { replace: vi.fn(), push: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k) => k,
}));
vi.mock("@/lib/i18n-key-map", () => ({ mapKey: (k) => k }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn() }),
}));
vi.mock("@/lib/use-onboarding", () => ({
  useOnboarding: () => ({ step: -1, advance: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

import api from "@/lib/api";

beforeEach(() => {
  router.replace.mockClear();
  api.get.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("homepage diet chips → URL (MEH-1083)", () => {
  it("toggling a diet chip writes its param to the URL", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.toggleChip("gluten_free"));
    const lastUrl = router.replace.mock.calls.at(-1)[0];
    expect(lastUrl).toContain("gluten_free=1");
  });

  it("serializes all 7 chip keys when all are active", () => {
    const { result } = renderHook(() => useHomePage());
    for (const key of [
      "kosher",
      "organic",
      "gluten_free",
      "vegan",
      "lactose_free",
      "has_delivery",
      "verified",
    ]) {
      act(() => result.current.toggleChip(key));
    }
    const lastUrl = router.replace.mock.calls.at(-1)[0];
    for (const param of [
      "kosher=1",
      "organic=1",
      "gluten_free=1",
      "vegan=1",
      "lactose_free=1",
      "delivery=1",
      "verified=1",
    ]) {
      expect(lastUrl).toContain(param);
    }
  });

  it("deep-link ?vegan=1 hydrates the chip and the initial fetch", () => {
    window.history.replaceState(null, "", "/?vegan=1");
    const { result } = renderHook(() => useHomePage());
    expect(result.current.chips.vegan).toBe(true);
    const producersCall = api.get.mock.calls.find(([path]) => path === "/producers");
    expect(producersCall[1].params).toMatchObject({ vegan: true });
  });

  it("deep-link with a legacy key (?kosher=1) still hydrates — no regression", () => {
    window.history.replaceState(null, "", "/?kosher=1");
    const { result } = renderHook(() => useHomePage());
    expect(result.current.chips.kosher).toBe(true);
  });
});
