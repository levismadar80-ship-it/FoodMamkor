import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

// MEH-2180 — toggling or removing an attribute chip on home used to reload the
// grid WITHOUT lat/lng while the "קרוב אליי" chip still claimed geo filtering:
// applyChips called loadProducers(params), which has no location, and geoFilter
// stayed set. Every applyChips path now routes through loadProducersGeo when a
// geo filter is active.
//
// Two things are asserted here and the second is the one that is easy to skip:
//   • PRESENCE — the request carries lat/lng AND the attribute, on both the
//     toggle and the remove path.
//   • ABSENCE  — an attribute change under geo must NOT trigger the one-shot
//     radius expansion, the drop-to-unfiltered fallback or the toast. Those
//     stay exclusive to an explicit near-me press (Sapir, 26/08). A test that
//     only checked the params would pass just as happily against a version
//     that silently widened the radius to 30km behind the reader's back.

const router = { replace: vi.fn(), push: vi.fn() };
const localeRouter = { replace: vi.fn(), push: vi.fn() };

const LAT = 32.0853;
const LNG = 34.7818;

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => localeRouter }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
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
vi.mock("@/lib/toast", () => ({
  showToast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
// A cached fix makes handleNearMe synchronous — no geolocation prompt — which
// is the shortest honest route into the geo-active state.
vi.mock("@/lib/user-location", () => ({
  getUserLocation: () => ({ lat: 32.0853, lng: 34.7818 }),
  setUserLocation: vi.fn(),
}));

// Rows the API hands back. Non-empty by default so the geo fetch succeeds and
// the expansion path is not entered for the wrong reason.
let rows = [];
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

const producerRow = (id) => ({
  id,
  name: `בית עסק ${id}`,
  slug: `biz-${id}`,
  city: "תל אביב",
  category: "גבינות",
  description: "",
  image_url: null,
  is_verified: false,
  rating: null,
  reviews_count: 0,
});

// Only the /producers listing calls matter here; the hook fires other GETs
// (categories, stats) on mount and they would otherwise pollute every index.
const producerCalls = () =>
  api.get.mock.calls.filter(([url]) => url === "/producers");
const lastProducerParams = () => {
  const calls = producerCalls();
  return calls.length ? calls.at(-1)[1]?.params ?? {} : null;
};

beforeEach(() => {
  rows = [];
  api.get.mockReset();
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/producers" ? rows : [] })
  );
  showToast.info.mockClear();
  router.replace.mockClear();
  localeRouter.push.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

// Drive the hook into geo-active state via an explicit near-me press.
const activateGeo = async (result) => {
  await act(async () => {
    result.current.handleNearMe();
  });
  await waitFor(() => expect(result.current.geoActive).toBe(true));
};

describe("MEH-2180 — an active geo filter survives an attribute change", () => {
  it("geo only: near-me sends lat/lng and no attribute", async () => {
    rows = [producerRow(1)];
    const { result } = renderHook(() => useHomePage());
    await activateGeo(result);

    const params = lastProducerParams();
    expect(params.lat).toBe(LAT);
    expect(params.lng).toBe(LNG);
    expect(params.vegan).toBeUndefined();
  });

  it("attribute only (no geo): toggling sends the attribute and NO lat/lng", async () => {
    rows = [producerRow(1)];
    const { result } = renderHook(() => useHomePage());
    await waitFor(() => expect(producerCalls().length).toBeGreaterThan(0));

    await act(async () => {
      result.current.handleToggleChip("vegan");
    });
    await waitFor(() => expect(lastProducerParams()?.vegan).toBe(true));

    const params = lastProducerParams();
    expect(params.lat).toBeUndefined();
    expect(params.lng).toBeUndefined();
  });

  it("BOTH — geo active, toggle 'vegan': the request carries lat/lng AND vegan", async () => {
    rows = [producerRow(1)];
    const { result } = renderHook(() => useHomePage());
    await activateGeo(result);

    await act(async () => {
      result.current.handleToggleChip("vegan");
    });
    await waitFor(() => expect(lastProducerParams()?.vegan).toBe(true));

    const params = lastProducerParams();
    expect(params.lat, "the geo filter must survive an attribute toggle").toBe(LAT);
    expect(params.lng).toBe(LNG);
    expect(params.vegan).toBe(true);
    // the chip is still telling the truth
    expect(result.current.geoActive).toBe(true);
  });

  it("BOTH — the REMOVE path too (handleRemoveChip, the older of the two)", async () => {
    rows = [producerRow(1)];
    const { result } = renderHook(() => useHomePage());
    await activateGeo(result);

    // switch two on, then take one off — the remove must still carry geo
    await act(async () => {
      result.current.handleToggleChip("vegan");
    });
    await waitFor(() => expect(lastProducerParams()?.vegan).toBe(true));
    await act(async () => {
      result.current.handleToggleChip("kosher");
    });
    await waitFor(() => expect(lastProducerParams()?.kosher).toBe(true));

    await act(async () => {
      result.current.handleRemoveChip("vegan");
    });
    await waitFor(() => expect(lastProducerParams()?.vegan).toBeUndefined());

    const params = lastProducerParams();
    expect(params.lat, "removing a chip must not drop the geo filter").toBe(LAT);
    expect(params.lng).toBe(LNG);
    expect(params.kosher, "the OTHER attribute must survive the removal").toBe(true);
    expect(result.current.geoActive).toBe(true);
  });

  it("the chips reaching the API are `next`, not the render-behind state", async () => {
    rows = [producerRow(1)];
    const { result } = renderHook(() => useHomePage());
    await activateGeo(result);

    await act(async () => {
      result.current.handleToggleChip("vegan");
    });

    // The stale-closure bug's signature: the FIRST request after the toggle
    // carries the pre-toggle chip state. Assert on that request, not on a
    // later one that a re-render would have corrected.
    await waitFor(() => expect(lastProducerParams()?.vegan).toBe(true));
    const afterToggle = producerCalls().at(-1)[1].params;
    expect(afterToggle.vegan, "setChips(next) has not landed yet — `next` must be passed in").toBe(true);
    expect(afterToggle.lat).toBe(LAT);
  });

  describe("zero results under geo + attribute", () => {
    it("renders the ordinary empty grid — no expansion, no fallback, no toast", async () => {
      rows = [producerRow(1)];
      const { result } = renderHook(() => useHomePage());
      await activateGeo(result);

      // from here on the API finds nothing
      rows = [];
      const before = producerCalls().length;
      await act(async () => {
        result.current.handleToggleChip("vegan");
      });
      await waitFor(() => expect(lastProducerParams()?.vegan).toBe(true));

      const after = producerCalls().slice(before);

      // ── ABSENCE 1: exactly ONE request. A second one would be either the
      // 30km expansion or the drop-to-unfiltered reload.
      expect(after, "an attribute change under geo must issue exactly one request").toHaveLength(1);

      // ── ABSENCE 2: the radius is untouched at the 15km default.
      expect(after[0][1].params.radius_km).toBe(15);
      expect(
        after.some((c) => c[1]?.params?.radius_km === 30),
        "the one-shot radius expansion is exclusive to an explicit near-me press"
      ).toBe(false);

      // ── ABSENCE 3: no toast, and the geo filter is NOT dropped.
      expect(showToast.info).not.toHaveBeenCalled();
      expect(result.current.geoActive, "a zero answer must not silently clear the location").toBe(true);
      expect(result.current.geoEmptyNotice).toBe(false);
      expect(result.current.visibleProducers).toHaveLength(0);
    });

    it("CONTROL — the same zero, reached by an explicit near-me press, DOES expand and toast", async () => {
      // This is what makes the absences above mean something: the expansion
      // machinery still works, it is only gated. Without this case, a version
      // that deleted the expansion entirely would pass every assertion above.
      rows = [];
      const { result } = renderHook(() => useHomePage());
      await act(async () => {
        result.current.handleNearMe();
      });

      await waitFor(() => expect(showToast.info).toHaveBeenCalled());
      const radii = producerCalls().map((c) => c[1]?.params?.radius_km);
      expect(radii, "near-me must still widen 15 → 30 before giving up").toContain(15);
      expect(radii).toContain(30);
      expect(result.current.geoEmptyNotice).toBe(true);
      expect(result.current.geoActive).toBe(false); // geo dropped, everything shown
    });
  });
});
