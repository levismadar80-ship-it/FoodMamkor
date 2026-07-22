import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import api from "@/lib/api";

// MEH-1083 (MEH-1077 DISC-02): the homepage chip row renders the CHIPS_CONFIG
// chips and buildChipParams sends them to the API, but updateURL serialized
// only kosher/organic/delivery/verified and mount-init read the same 4 — so
// gluten_free/vegan/lactose_free filtered results without ever reaching the
// URL, and a shared/refreshed URL silently dropped them. These tests pin the
// round-trip: toggle → URL param, and deep-link → hydrated chip state.
// MEH-1259: the "organic" chip was removed (self-declared → not a public
// filter). MEH-1438: the "vegetarian" chip was added — the set is now 7 keys.

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
    // MEH-1293: updateURL now mirrors via window.history.replaceState (shallow)
    // instead of router.replace — assert on the real URL, transport-agnostic.
    expect(window.location.search).toContain("gluten_free=1");
  });

  it("serializes all 7 chip keys when all are active", () => {
    const { result } = renderHook(() => useHomePage());
    for (const key of [
      "kosher",
      "gluten_free",
      "vegan",
      "vegetarian",
      "lactose_free",
      "has_delivery",
      "verified",
    ]) {
      act(() => result.current.toggleChip(key));
    }
    // MEH-1293: assert on the real URL (history.replaceState), not router.replace.
    const lastUrl = window.location.search;
    for (const param of [
      "kosher=1",
      "gluten_free=1",
      "vegan=1",
      "vegetarian=1",
      "lactose_free=1",
      "delivery=1",
      "verified=1",
    ]) {
      expect(lastUrl).toContain(param);
    }
    // MEH-1259: organic is no longer serialized.
    expect(lastUrl).not.toContain("organic=1");
  });

  it("deep-link ?vegan=1 hydrates the chip and the initial fetch", () => {
    window.history.replaceState(null, "", "/?vegan=1");
    const { result } = renderHook(() => useHomePage());
    expect(result.current.chips.vegan).toBe(true);
    const producersCall = api.get.mock.calls.find(([path]) => path === "/producers");
    expect(producersCall).toBeDefined();
    expect(producersCall[1].params).toMatchObject({ vegan: true });
  });

  it("deep-link ?vegetarian=1 hydrates the chip and the initial fetch (MEH-1438)", () => {
    window.history.replaceState(null, "", "/?vegetarian=1");
    const { result } = renderHook(() => useHomePage());
    expect(result.current.chips.vegetarian).toBe(true);
    const producersCall = api.get.mock.calls.find(([path]) => path === "/producers");
    expect(producersCall).toBeDefined();
    expect(producersCall[1].params).toMatchObject({ vegetarian: true });
  });

  it("deep-link with a legacy key (?kosher=1) still hydrates — no regression", () => {
    window.history.replaceState(null, "", "/?kosher=1");
    const { result } = renderHook(() => useHomePage());
    expect(result.current.chips.kosher).toBe(true);
  });
});
