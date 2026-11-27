import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import api from "@/lib/api";

// MEH-3821 — an empty city result and its MEH-1487 region fallback land in
// ONE commit, while the grid is still marked loading. Before, the empty grid
// was committed first (a one-line «no delivery» note), the fallback arrived a
// moment later, and the section collapsed and grew back under the reader.

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// MEH-1774: use-home-page now imports the locale-aware router for the chip
// deep-link. Stub it so next-intl's ESM createNavigation never loads under vitest.
const localeRouterPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, prefetch, ...p }) => <a href={typeof href === "string" ? href : href?.pathname} {...p}>{children}</a>, 
  useRouter: () => ({ push: localeRouterPush, replace: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
// MEH-2186: DeliveryDayRow now imports Phosphor glyphs. Enumerated by hand,
// not a Proxy — a Proxy's getter runs during import and dereferences the JSX
// runtime before vitest has initialised it (same reason as the equivalent mock
// in ProducersClientDayAxis.test.jsx).
vi.mock("@phosphor-icons/react", () => ({
  // MEH-2827 PR 4: the «המליצו על בית עסק» links in the empty states.
  ArrowLeft: (p) => <span {...p} />,
  CalendarBlank: (p) => <span {...p} />,
  CaretDown: (p) => <span {...p} />,
  CaretUp: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-user-city", () => ({
  useUserCity: () => ({ city: null, setCity: vi.fn() }),
}));
vi.mock("@/lib/recently-viewed", () => ({ getRecentlyViewedIds: () => [] }));
vi.mock("@/lib/friday-mode", () => ({ isFridayMode: () => false }));
vi.mock("@/lib/featured-producer", () => ({ selectFeaturedProducer: () => null }));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));


const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  api.get.mockReset();
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

const row = { id: "11111111-1111-4111-8111-111111111111" };

describe("useHomePage region fallback lands with the empty result (MEH-3821)", () => {
  it("stays loading, with the old list, until the fallback answers; then both at once", async () => {
    const { result } = renderHook(() => useHomePage());
    await waitFor(() => expect(result.current.producersLoading).toBe(false));
    const fallback = deferred();
    api.get.mockImplementation((path, opts) =>
      opts?.params?.delivery_cities ? fallback.promise : Promise.resolve({ data: [] }),
    );
    act(() => result.current.handleCitySelected("חיפה"));
    await waitFor(() =>
      expect(api.get.mock.calls.some(([, o]) => o?.params?.delivery_cities)).toBe(true),
    );
    // The city answered empty, but nothing is committed yet.
    expect(result.current.producersLoading).toBe(true);
    expect(result.current.regionFallback).toBeNull();
    await act(async () => {
      fallback.resolve({ data: [{ ...row }] });
    });
    await waitFor(() => expect(result.current.producersLoading).toBe(false));
    expect(result.current.producers).toEqual([]);
    expect(result.current.regionFallback?.city).toBe("חיפה");
    // The fallback is read once — the effect does not read it again.
    expect(api.get.mock.calls.filter(([, o]) => o?.params?.delivery_cities)).toHaveLength(1);
  });
});
