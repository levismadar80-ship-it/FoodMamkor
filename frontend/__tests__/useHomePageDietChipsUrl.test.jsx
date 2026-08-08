import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import api from "@/lib/api";
// MEH-1774: read-only import — the round-trip guard below asserts against the
// SAME array ProducersClient.initChipsFromParams iterates, which is what makes
// `?<chip.key>=1` correct for every key by construction rather than by luck.
import { CHIPS_CONFIG, GATED_DIET_KEYS } from "@/lib/producer-filters";
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
    // MEH-1934: 7 → 9 (no_added_sugar + low_carb). This number is NOT here to
    // be bumped — it is the leak detector, and it caught exactly this change
    // putting two chips onto the home row, because CHIPS_CONFIG is shared with
    // /producers. So the count is now asserted TOGETHER with the gate: every
    // shared chip must be either a pre-MEH-1934 one or declared in
    // GATED_DIET_KEYS. Bumping the number alone fails the second half.
    expect(CHIPS_CONFIG).toHaveLength(9);
    const UNGATED = [
      "kosher", "vegan", "vegetarian", "gluten_free",
      "lactose_free", "has_delivery", "verified",
    ];
    for (const chip of CHIPS_CONFIG) {
      expect(
        UNGATED.includes(chip.key) || GATED_DIET_KEYS.includes(chip.key),
        `${chip.key} is on the shared home row but is neither a pre-MEH-1934 chip nor gated`,
      ).toBe(true);
    }
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

// MEH-1826: the deep-link carries the active location context, so arriving on
// /producers reproduces the state the user left rather than widening it
// (Baymard scope-jumping). The param NAMES are asserted against what
// ProducersClient actually hydrates — `city` + `delivery_day`
// (ProducersClient.jsx:77/89) — NOT home's own `?day=` serializer name. That
// asymmetry is the whole risk: home's name would be well-formed, produce no
// error, and be silently ignored on arrival.
describe("chip deep-link carries delivery context (MEH-1826)", () => {
  /** Hydrate home with an active city (+ optional day) via its own URL names. */
  const withContext = (city, day) => {
    const p = new URLSearchParams();
    if (city) p.set("city", city);
    if (day) p.set("day", day);
    window.history.replaceState(null, "", `/?${p.toString()}`);
  };

  const pushedParams = () => {
    const [href] = localeRouter.push.mock.calls[0];
    return { href, params: new URL(href, "http://x").searchParams };
  };

  it("city + day active → both ride along under /producers' param names", () => {
    withContext("ירושלים", "שישי");
    const { result } = renderHook(() => useHomePage());
    localeRouter.push.mockClear();

    act(() => result.current.navigateToChip("has_delivery"));

    const { params } = pushedParams();
    expect(params.get("has_delivery")).toBe("1");
    expect(params.get("city")).toBe("ירושלים");
    expect(params.get("delivery_day")).toBe("שישי");
    // Home's own serializer name must NOT be what we emit — ProducersClient
    // reads `delivery_day` and would silently ignore `day`.
    expect(params.get("day")).toBeNull();
  });

  it("city active, no day → city only, and no empty delivery_day param", () => {
    withContext("ירושלים", null);
    const { result } = renderHook(() => useHomePage());
    localeRouter.push.mockClear();

    act(() => result.current.navigateToChip("kosher"));

    const { href, params } = pushedParams();
    expect(params.get("city")).toBe("ירושלים");
    expect(params.has("delivery_day")).toBe(false);
    expect(href).not.toContain("delivery_day=");
  });

  it("no city → URL byte-identical to before MEH-1826 (zero regression)", () => {
    const { result } = renderHook(() => useHomePage());
    localeRouter.push.mockClear();

    act(() => result.current.navigateToChip("has_delivery"));

    expect(pushedParams().href).toBe("/producers?has_delivery=1");
  });

  // The precondition mirror: a day cannot travel alone. Home only hydrates a
  // day beside a city, so this drives the state through the same public entry
  // point a user would (handleDaySelected) with no city set.
  it("day without a city is never carried", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleDaySelected("שישי"));
    localeRouter.push.mockClear();

    act(() => result.current.navigateToChip("has_delivery"));

    const { href, params } = pushedParams();
    expect(params.has("delivery_day")).toBe(false);
    expect(params.has("city")).toBe(false);
    expect(href).toBe("/producers?has_delivery=1");
  });

  it("context rides along for ALL 9 chip keys, not just משלוח", () => {
    withContext("חיפה", "שלישי");
    const { result } = renderHook(() => useHomePage());

    for (const chip of CHIPS_CONFIG) {
      localeRouter.push.mockClear();
      act(() => result.current.navigateToChip(chip.key));
      const { params } = pushedParams();
      expect(params.get(chip.key)).toBe("1");
      expect(params.get("city")).toBe("חיפה");
      expect(params.get("delivery_day")).toBe("שלישי");
    }
    expect(CHIPS_CONFIG).toHaveLength(9);  // MEH-1934
  });
});
