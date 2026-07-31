import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, render, screen, fireEvent } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import { ActiveFilterChip, DeliveryDayRow } from "@/app/[locale]/home/ActiveFilterChip";
import api from "@/lib/api";

// MEH-1645 — delivery-day filter on the home surface.
// Hook: ?day= round-trip (MEH-1083 pattern), day-only URLs dropped (invisible-
// filter guard), day falls with its city, API params carry delivery_day.
// Components: DeliveryDayRow renders ONLY with an active city (progressive
// disclosure — the ticket's FilterSheet placement was corrected in Phase 0:
// FilterSheet is /map-only and /map is out of scope); the chip label swaps to
// "משלוח ל{city} · יום {day}" when a day is active.

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// MEH-1774: use-home-page now imports the locale-aware router for the chip
// deep-link. Stub it so next-intl's ESM createNavigation never loads under vitest.
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
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
  api.get.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("useHomePage delivery-day filter (MEH-1645)", () => {
  it("selecting a day with an active city writes ?day= and fetches with delivery_day", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    expect(window.location.search).toContain("city=");
    expect(window.location.search).toContain(`day=${encodeURIComponent("שישי")}`);
    const dayCall = api.get.mock.calls.findLast(
      ([path, opts]) => path === "/producers" && opts?.params?.delivery_day,
    );
    expect(dayCall[1].params).toMatchObject({ delivery_city: "חיפה", delivery_day: "שישי" });
    expect(result.current.dayActive).toBe("שישי");
  });

  it("selecting the active day again clears it (toggle) and drops ?day=", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleDaySelected("שישי"));
    expect(window.location.search).not.toContain("day=");
    expect(result.current.dayActive).toBeNull();
  });

  // MEH-1771: the city PRECONDITION is unchanged — a day never applies without
  // a city. What changed is the response to the missing precondition: the old
  // silent `return` became "open the LocationModal and ask for it".
  it("does NOT apply a day without a city, and opens the LocationModal instead (MEH-1771)", () => {
    const { result } = renderHook(() => useHomePage());
    expect(result.current.locationModalOpen).toBe(false);
    act(() => result.current.handleDaySelected("שישי"));
    // Precondition still enforced — no filter, no URL param, no day fetch.
    expect(result.current.dayActive).toBeNull();
    expect(window.location.search).not.toContain("day=");
    expect(
      api.get.mock.calls.find(([p, o]) => p === "/producers" && o?.params?.delivery_day),
    ).toBeUndefined();
    // ...and the missing precondition is now asked for.
    expect(result.current.locationModalOpen).toBe(true);
  });

  it("picking a city in the modal path then a day applies it normally (MEH-1771 end-to-end)", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleDaySelected("שישי"));
    expect(result.current.locationModalOpen).toBe(true);
    // LocationModal.onSelectCity IS handleCitySelected — the one existing path.
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    expect(result.current.dayActive).toBe("שישי");
    expect(window.location.search).toContain(`day=${encodeURIComponent("שישי")}`);
  });

  it("hydrates ?city=&day= from the URL but DROPS a day-only URL (invisible-filter guard)", () => {
    window.history.replaceState(null, "", `/?city=${encodeURIComponent("חיפה")}&day=${encodeURIComponent("רביעי")}`);
    const { result } = renderHook(() => useHomePage());
    expect(result.current.dayActive).toBe("רביעי");

    window.history.replaceState(null, "", `/?day=${encodeURIComponent("רביעי")}`);
    const { result: dayOnly } = renderHook(() => useHomePage());
    expect(dayOnly.current.dayActive).toBeNull();
  });

  it("drops a NON-CANONICAL ?day= on hydration (would 422 → silently stale grid)", () => {
    window.history.replaceState(
      null,
      "",
      `/?city=${encodeURIComponent("חיפה")}&day=not-a-real-day`,
    );
    const { result } = renderHook(() => useHomePage());
    expect(result.current.dayActive).toBeNull();
    // And the initial fetch must NOT carry the invalid value.
    const badCall = api.get.mock.calls.find(
      ([path, opts]) => path === "/producers" && opts?.params?.delivery_day,
    );
    expect(badCall).toBeUndefined();
  });

  it("clearing the location filter clears the day with it", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleClearLocation());
    expect(result.current.dayActive).toBeNull();
    expect(result.current.cityActive).toBeNull();
    expect(window.location.search).not.toContain("day=");
  });
});

describe("DeliveryDayRow + chip label (MEH-1645)", () => {
  // MEH-1771: was "renders nothing without an active city". The row is now a
  // permanent anchor (Baymard promoted-filters); without a city it renders a
  // muted ghost row + hint whose pills are aria-disabled but still clickable.
  it("renders the GHOST row without a city: hint + aria-disabled pills (MEH-1771)", () => {
    render(<DeliveryDayRow cityActive={null} dayActive={null} onSelectDay={vi.fn()} />);
    const row = screen.getByTestId("delivery-day-row");
    expect(row).toBeInTheDocument();
    expect(row).toHaveAttribute("data-ghost", "true");
    expect(row.querySelectorAll("button")).toHaveLength(7);

    const hint = screen.getByTestId("delivery-day-hint");
    expect(hint).toHaveTextContent("home.producers.day_row_hint");

    const pill = screen.getByTestId("delivery-day-pill-שישי");
    expect(pill).toHaveAttribute("aria-disabled", "true");
    // a11y: the hint is what explains the disabled state — it must be linked.
    expect(pill).toHaveAttribute("aria-describedby", hint.id);
    // aria-disabled, NOT the disabled attribute: the pill stays clickable so
    // the click can open the LocationModal (MDN aria-disabled / Smashing).
    expect(pill).not.toBeDisabled();
  });

  it("a ghost pill still forwards its click (routes to the LocationModal)", () => {
    const onSelectDay = vi.fn();
    render(<DeliveryDayRow cityActive={null} dayActive={null} onSelectDay={onSelectDay} />);
    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));
    expect(onSelectDay).toHaveBeenCalledWith("שישי");
  });

  it("a ghost row never marks a day as pressed, even if dayActive leaks in", () => {
    render(<DeliveryDayRow cityActive={null} dayActive="שישי" onSelectDay={vi.fn()} />);
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "false");
  });

  it("with a city the row is NOT ghost: no hint, pills enabled (no MEH-1645 regression)", () => {
    render(<DeliveryDayRow cityActive="חיפה" dayActive={null} onSelectDay={vi.fn()} />);
    expect(screen.getByTestId("delivery-day-row")).toHaveAttribute("data-ghost", "false");
    expect(screen.queryByTestId("delivery-day-hint")).not.toBeInTheDocument();
    const pill = screen.getByTestId("delivery-day-pill-שישי");
    expect(pill).toHaveAttribute("aria-disabled", "false");
    expect(pill).not.toHaveAttribute("aria-describedby");
  });

  it("renders all 7 canonical pills with a city, marks the active day, forwards clicks", () => {
    const onSelectDay = vi.fn();
    render(<DeliveryDayRow cityActive="חיפה" dayActive="שישי" onSelectDay={onSelectDay} />);
    const row = screen.getByTestId("delivery-day-row");
    expect(row.querySelectorAll("button")).toHaveLength(7);
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));
    expect(onSelectDay).toHaveBeenCalledWith("שלישי");
  });

  it("chip label swaps to the city·day form when a day is active", () => {
    const { rerender } = render(
      <ActiveFilterChip geoActive={false} cityActive="חיפה" dayActive={null} onClear={vi.fn()} />,
    );
    expect(screen.getByText('home.producers.city_chip:{"city":"חיפה"}')).toBeInTheDocument();
    rerender(
      <ActiveFilterChip geoActive={false} cityActive="חיפה" dayActive="שישי" onClear={vi.fn()} />,
    );
    expect(
      screen.getByText('home.producers.city_day_chip:{"city":"חיפה","day":"שישי"}'),
    ).toBeInTheDocument();
  });
});
