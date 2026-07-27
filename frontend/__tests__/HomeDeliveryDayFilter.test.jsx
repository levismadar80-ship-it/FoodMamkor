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

  it("ignores a day selection when no city filter is active", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleDaySelected("שישי"));
    expect(result.current.dayActive).toBeNull();
    expect(window.location.search).not.toContain("day=");
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
  it("renders nothing without an active city (progressive disclosure)", () => {
    render(<DeliveryDayRow cityActive={null} dayActive={null} onSelectDay={vi.fn()} />);
    expect(screen.queryByTestId("delivery-day-row")).not.toBeInTheDocument();
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
