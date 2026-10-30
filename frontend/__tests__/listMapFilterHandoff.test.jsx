/**
 * MEH-2598 follow-up (Sapir 30/10): the list and the map are two views of one
 * search — the attribute filters travel between them in the URL.
 *
 *  - lib/filter-url: one write vocabulary (`?<key>=1`), home's alias read too,
 *    axes the receiver does not offer dropped.
 *  - /map: initial chips come from the URL and every toggle is mirrored back.
 *  - /map feed: a deep link fetches the filtered list AFTER the unfiltered
 *    snapshot, so the snapshot can never overwrite it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn() } }));

import { chipsFromQuery, chipsToQuery } from "@/lib/filter-url";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";
import { useProducersFeed } from "@/app/[locale]/map/state/useProducersFeed";
import { TOGGLE_CHIPS } from "@/lib/map-chips";

const MAP_KEYS = TOGGLE_CHIPS.map((c) => c.key);

describe("lib/filter-url", () => {
  it("reads ?<key>=1 from URLSearchParams and from a server searchParams record", () => {
    expect(chipsFromQuery(new URLSearchParams("on_site=1&pickup_points=1"), MAP_KEYS)).toEqual({
      on_site: true,
      pickup_points: true,
    });
    expect(chipsFromQuery({ has_delivery: "1", q: "לחם" }, MAP_KEYS)).toEqual({ has_delivery: true });
  });

  it("accepts home's ?delivery=1 alias for has_delivery", () => {
    expect(chipsFromQuery(new URLSearchParams("delivery=1"), MAP_KEYS)).toEqual({ has_delivery: true });
  });

  it("drops an axis the receiving surface does not offer, and off values", () => {
    expect(chipsFromQuery(new URLSearchParams("on_site=1&kosher=0"), ["has_delivery"])).toEqual({});
  });

  it("writes one spelling, skips categoryKeys and off axes, and is empty when nothing is on", () => {
    const q = chipsToQuery({ categoryKeys: ["bread"], has_delivery: true, on_site: true, kosher: false });
    expect(new URLSearchParams(q.slice(1))).toEqual(new URLSearchParams("has_delivery=1&on_site=1"));
    expect(chipsToQuery({ has_delivery: false })).toBe("");
  });

  it("round-trips: what /producers or home writes is what /map reads", () => {
    const chips = { has_delivery: true, pickup_points: true, on_site: true };
    expect(chipsFromQuery(new URLSearchParams(chipsToQuery(chips).slice(1)), MAP_KEYS)).toEqual(chips);
  });
});

describe("/map chip state ⇄ URL", () => {
  beforeEach(() => window.history.replaceState(null, "", "/map?utm_source=x"));

  const setup = (initialChips) =>
    renderHook(() =>
      useMapFilters({
        allProducers: [],
        categories: [],
        loadProducers: vi.fn(),
        userCity: "תל אביב",
        setUserCity: vi.fn(),
        setShowCityPicker: vi.fn(),
        initialChips,
      }),
    ).result;

  it("starts with the chips the URL carried, pressed", () => {
    const result = setup({ on_site: true });
    expect(result.current.chipState.on_site).toBe(true);
    expect(result.current.chipState.has_delivery).toBe(false);
  });

  it("mirrors a toggle into the URL and keeps unrelated params", () => {
    const result = setup({});
    act(() => result.current.onToggleChipClick("pickup_points"));
    const sp = new URLSearchParams(window.location.search);
    expect(sp.get("pickup_points")).toBe("1");
    expect(sp.get("utm_source")).toBe("x");
    act(() => result.current.onToggleChipClick("pickup_points"));
    expect(new URLSearchParams(window.location.search).has("pickup_points")).toBe(false);
  });

  it("rewrites home's ?delivery=1 alias to the one spelling", () => {
    window.history.replaceState(null, "", "/map?delivery=1");
    setup({ has_delivery: true });
    const sp = new URLSearchParams(window.location.search);
    expect(sp.get("has_delivery")).toBe("1");
    expect(sp.has("delivery")).toBe(false);
  });
});

describe("/map feed with filters from the URL", () => {
  beforeEach(() => apiGet.mockReset());

  it("fetches the unfiltered snapshot first, then the filtered list, and shows the filtered list", async () => {
    const calls = [];
    apiGet.mockImplementation((path, { params } = {}) => {
      if (path === "/categories") return Promise.resolve({ data: [] });
      calls.push(params);
      const data = params?.on_site ? [{ id: "f", name: "filtered" }] : [{ id: "a", name: "all" }, { id: "b", name: "b" }];
      return Promise.resolve({ data });
    });
    const { result } = renderHook(() => useProducersFeed({ initialParams: { on_site: true } }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toEqual({});
    expect(calls[1]).toEqual({ on_site: true });
    await waitFor(() => expect(result.current.allProducers.map((p) => p.id)).toEqual(["f"]));
    expect(result.current.catalogSnapshot.map((p) => p.id)).toEqual(["a", "b"]);
    expect(calls).toHaveLength(2);
  });

  it("control: without filters there is one unfiltered fetch and it is the list", async () => {
    const calls = [];
    apiGet.mockImplementation((path, { params } = {}) => {
      if (path === "/categories") return Promise.resolve({ data: [] });
      calls.push(params);
      return Promise.resolve({ data: [{ id: "a", name: "all" }] });
    });
    const { result } = renderHook(() => useProducersFeed({ initialParams: {} }));
    await waitFor(() => expect(result.current.allProducers.map((p) => p.id)).toEqual(["a"]));
    expect(calls).toHaveLength(1);
  });
});
