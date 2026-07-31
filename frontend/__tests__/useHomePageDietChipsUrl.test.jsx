import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import api from "@/lib/api";
// MEH-1774: read-only import — the round-trip guard below asserts against the
// SAME array ProducersClient.initChipsFromParams iterates, which is what makes
// `?<chip.key>=1` correct for every key by construction rather than by luck.
import { CHIPS_CONFIG } from "@/lib/producer-filters";
import { trackEvent } from "@/lib/analytics";

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
// MEH-1774: the chip deep-link pushes through the LOCALE-AWARE router, so the
// assertions below watch this one — a bare next/navigation push would drop an
// /en session (localePrefix "as-needed").
const localeRouter = { replace: vi.fn(), push: vi.fn() };
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => localeRouter,
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
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

// MEH-1774: home chips stopped filtering in place — a tap deep-links to
// /producers. The two tests that used to pin toggle→home-URL serialization are
// replaced by the round-trip contract below; the hydration tests further down
// are UNCHANGED, because home's reading of its own params is out of scope here
// (MEH-1083) and still works.
describe("homepage attribute chips → /producers deep-link (MEH-1774)", () => {
  it("every CHIPS_CONFIG key emits ?key=1 — the literal string the listing reads", () => {
    const { result } = renderHook(() => useHomePage());
    for (const chip of CHIPS_CONFIG) {
      localeRouter.push.mockClear();
      act(() => result.current.navigateToChip(chip.key));
      const [href] = localeRouter.push.mock.calls[0];
      expect(href).toBe(`/producers?${chip.key}=1`);
      // The whole point: ProducersClient tests `get(key) === "1"`, so a boolean
      // `true` (what buildChipParams emits) would leave the chip dark on arrival
      // with no error. Assert the VALUE, parsed the way the listing parses it.
      expect(new URL(href, "http://x").searchParams.get(chip.key)).toBe("1");
    }
    expect(CHIPS_CONFIG).toHaveLength(7);
  });

  it("has_delivery deep-links as ?has_delivery=1, NOT home's legacy ?delivery=1", () => {
    const { result } = renderHook(() => useHomePage());
    localeRouter.push.mockClear();
    act(() => result.current.navigateToChip("has_delivery"));
    const [href] = localeRouter.push.mock.calls[0];
    expect(href).toBe("/producers?has_delivery=1");
    expect(href).not.toContain("delivery=1&");
    expect(new URL(href, "http://x").searchParams.get("delivery")).toBeNull();
  });

  it("emits home_chip_navigate and leaves the home URL alone", () => {
    const before = window.location.search;
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.navigateToChip("vegan"));
    expect(trackEvent).toHaveBeenCalledWith("home_chip_navigate", { chip: "vegan" });
    // No in-place filtering: home's own URL is untouched by the tap.
    expect(window.location.search).toBe(before);
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
