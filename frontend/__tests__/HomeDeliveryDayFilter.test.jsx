import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, render, screen, fireEvent } from "@testing-library/react";
import { useHomePage } from "@/lib/use-home-page";
import { ActiveFilterChip } from "@/app/[locale]/home/ActiveFilterChip";
import { DeliveryDayRow } from "@/components/DeliveryDayRow";
import api from "@/lib/api";

// MEH-1645 — delivery-day filter on the home surface.
// MEH-2036 — the axis became MULTI-SELECT. Every MEH-1645/1771 guarantee below
// is preserved verbatim (city precondition, ghost row, day-only URL dropped,
// non-canonical value dropped, day falls with its city); the assertions moved
// from a string to a SET, and the multi-select cases were added on top.
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
const localeRouterPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: localeRouterPush, replace: vi.fn() }),
}));
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
  localeRouterPush.mockClear();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("useHomePage delivery-day filter (MEH-1645)", () => {
  it("selecting a day with an active city writes ?day= and fetches with delivery_days", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    expect(window.location.search).toContain("city=");
    expect(window.location.search).toContain(`day=${encodeURIComponent("שישי")}`);
    const dayCall = api.get.mock.calls.findLast(
      ([path, opts]) => path === "/producers" && opts?.params?.delivery_days,
    );
    expect(dayCall[1].params).toMatchObject({ delivery_city: "חיפה", delivery_days: ["שישי"] });
    expect(result.current.daysActive).toEqual(["שישי"]);
  });

  it("selecting the active day again clears it (toggle) and drops ?day=", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleDaySelected("שישי"));
    expect(window.location.search).not.toContain("day=");
    expect(result.current.daysActive).toEqual([]);
  });

  // MEH-1771: the city PRECONDITION is unchanged — a day never applies without
  // a city. What changed is the response to the missing precondition: the old
  // silent `return` became "open the LocationModal and ask for it".
  it("does NOT apply a day without a city, and opens the LocationModal instead (MEH-1771)", () => {
    const { result } = renderHook(() => useHomePage());
    expect(result.current.locationModalOpen).toBe(false);
    act(() => result.current.handleDaySelected("שישי"));
    // Precondition still enforced — no filter, no URL param, no day fetch.
    expect(result.current.daysActive).toEqual([]);
    expect(window.location.search).not.toContain("day=");
    expect(
      api.get.mock.calls.find(([p, o]) => p === "/producers" && o?.params?.delivery_days),
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
    expect(result.current.daysActive).toEqual(["שישי"]);
    expect(window.location.search).toContain(`day=${encodeURIComponent("שישי")}`);
  });

  it("hydrates ?city=&day= from the URL but DROPS a day-only URL (invisible-filter guard)", () => {
    window.history.replaceState(null, "", `/?city=${encodeURIComponent("חיפה")}&day=${encodeURIComponent("רביעי")}`);
    const { result } = renderHook(() => useHomePage());
    expect(result.current.daysActive).toEqual(["רביעי"]);

    window.history.replaceState(null, "", `/?day=${encodeURIComponent("רביעי")}`);
    const { result: dayOnly } = renderHook(() => useHomePage());
    expect(dayOnly.current.daysActive).toEqual([]);
  });

  it("drops a NON-CANONICAL ?day= on hydration (would 422 → silently stale grid)", () => {
    window.history.replaceState(
      null,
      "",
      `/?city=${encodeURIComponent("חיפה")}&day=not-a-real-day`,
    );
    const { result } = renderHook(() => useHomePage());
    expect(result.current.daysActive).toEqual([]);
    // And the initial fetch must NOT carry the invalid value.
    const badCall = api.get.mock.calls.find(
      ([path, opts]) => path === "/producers" && opts?.params?.delivery_days,
    );
    expect(badCall).toBeUndefined();
  });

  it("clearing the location filter clears the day with it", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleClearLocation());
    expect(result.current.daysActive).toEqual([]);
    expect(result.current.cityActive).toBeNull();
    expect(window.location.search).not.toContain("day=");
  });

  // ---- MEH-2036: multi-select ----

  it("selects TWO days: both ride ?day= and the API params (OR union)", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("רביעי"));
    act(() => result.current.handleDaySelected("שישי"));
    expect(result.current.daysActive).toEqual(["רביעי", "שישי"]);
    const qs = new URLSearchParams(window.location.search);
    expect(qs.getAll("day")).toEqual(["רביעי", "שישי"]);
    const call = api.get.mock.calls.findLast(
      ([path, opts]) => path === "/producers" && opts?.params?.delivery_days,
    );
    expect(call[1].params.delivery_days).toEqual(["רביעי", "שישי"]);
  });

  it("un-toggling ONE day of two removes only that day", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("רביעי"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleDaySelected("רביעי"));
    expect(result.current.daysActive).toEqual(["שישי"]);
    expect(new URLSearchParams(window.location.search).getAll("day")).toEqual(["שישי"]);
  });

  it("hydrates a repeated ?day=, dropping invalid + duplicate members", () => {
    const e = encodeURIComponent;
    window.history.replaceState(
      null,
      "",
      `/?city=${e("חיפה")}&day=${e("רביעי")}&day=${e("רביעי")}&day=nope&day=${e("שישי")}`,
    );
    const { result } = renderHook(() => useHomePage());
    expect(result.current.daysActive).toEqual(["רביעי", "שישי"]);
  });

  it("the day SET survives a city switch and re-applies to the new city", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("רביעי"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleCitySelected("עכו"));
    expect(result.current.daysActive).toEqual(["רביעי", "שישי"]);
    const call = api.get.mock.calls.findLast(([p, o]) => p === "/producers" && o?.params?.delivery_days);
    expect(call[1].params).toMatchObject({ delivery_city: "עכו", delivery_days: ["רביעי", "שישי"] });
  });

  it("handleClearDays drops the whole set but KEEPS the city", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("רביעי"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.handleClearDays());
    expect(result.current.daysActive).toEqual([]);
    expect(result.current.cityActive).toBe("חיפה");
    expect(window.location.search).not.toContain("day=");
  });

  // The MEH-1826 silent-drop trap: home serializes `?day=`, /producers reads
  // `?delivery_days=`. This asserts the HOP emits the NAME THE FAR SIDE READS.
  it("navigateToChip hops with delivery_days (NOT home's own ?day=)", () => {
    const { result } = renderHook(() => useHomePage());
    act(() => result.current.handleCitySelected("חיפה"));
    act(() => result.current.handleDaySelected("רביעי"));
    act(() => result.current.handleDaySelected("שישי"));
    act(() => result.current.navigateToChip("has_delivery"));
    const url = localeRouterPush.mock.calls.at(-1)[0];
    const qs = new URLSearchParams(url.split("?")[1]);
    expect(qs.getAll("delivery_days")).toEqual(["רביעי", "שישי"]);
    expect(qs.getAll("day")).toEqual([]);
    expect(qs.get("city")).toBe("חיפה");
  });
});

describe("DeliveryDayRow + chip label (MEH-1645)", () => {
  // MEH-1771: was "renders nothing without an active city". The row is now a
  // permanent anchor (Baymard promoted-filters); without a city it renders a
  // muted ghost row + hint whose pills are aria-disabled but still clickable.
  it("renders the GHOST row without a city: hint + aria-disabled pills (MEH-1771)", () => {
    render(<DeliveryDayRow cityActive={null} daysActive={[]} onSelectDay={vi.fn()} />);
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
    render(<DeliveryDayRow cityActive={null} daysActive={[]} onSelectDay={onSelectDay} />);
    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));
    expect(onSelectDay).toHaveBeenCalledWith("שישי");
  });

  it("a ghost row never marks a day as pressed, even if daysActive leaks in", () => {
    render(<DeliveryDayRow cityActive={null} daysActive={["שישי"]} onSelectDay={vi.fn()} />);
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "false");
  });

  it("with a city the row is NOT ghost: no hint, pills enabled (no MEH-1645 regression)", () => {
    render(<DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />);
    expect(screen.getByTestId("delivery-day-row")).toHaveAttribute("data-ghost", "false");
    expect(screen.queryByTestId("delivery-day-hint")).not.toBeInTheDocument();
    const pill = screen.getByTestId("delivery-day-pill-שישי");
    expect(pill).toHaveAttribute("aria-disabled", "false");
    expect(pill).not.toHaveAttribute("aria-describedby");
  });

  it("renders all 7 canonical pills with a city, marks the active day, forwards clicks", () => {
    const onSelectDay = vi.fn();
    render(<DeliveryDayRow cityActive="חיפה" daysActive={["שישי"]} onSelectDay={onSelectDay} />);
    const row = screen.getByTestId("delivery-day-row");
    expect(row.querySelectorAll("button")).toHaveLength(7);
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));
    expect(onSelectDay).toHaveBeenCalledWith("שלישי");
  });

  // MEH-2036: multiple days pressed simultaneously — the defining multi-select
  // assertion. Under MEH-1645 only one pill could ever read aria-pressed=true.
  it("marks EVERY selected day pressed, and the rest not", () => {
    render(
      <DeliveryDayRow cityActive="חיפה" daysActive={["רביעי", "שישי"]} onSelectDay={vi.fn()} />,
    );
    expect(screen.getByTestId("delivery-day-pill-רביעי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");
  });

  it("chip label swaps to the city·day form when a day is active", () => {
    const { rerender } = render(
      <ActiveFilterChip geoActive={false} cityActive="חיפה" daysActive={[]} onClear={vi.fn()} />,
    );
    expect(screen.getByText('home.producers.city_chip:{"city":"חיפה"}')).toBeInTheDocument();
    rerender(
      <ActiveFilterChip geoActive={false} cityActive="חיפה" daysActive={["שישי"]} onClear={vi.fn()} />,
    );
    expect(
      screen.getByText('home.producers.city_day_chip:{"city":"חיפה","day":"שישי"}'),
    ).toBeInTheDocument();
  });

  // MEH-2036 label matrix: 1 → bare · 2 → joined · 3+ → "{first} +N",
  // and the FULL set always in the aria-label even when the visible form drops
  // names. Days are sorted into week order regardless of tap order.
  it("renders 2 days joined, and 3+ collapsed with the full set in aria-label", () => {
    const { rerender } = render(
      <ActiveFilterChip geoActive={false} cityActive="חיפה" daysActive={["שישי", "שלישי"]} onClear={vi.fn()} />,
    );
    expect(
      screen.getByText('home.producers.city_day_chip:{"city":"חיפה","day":"שלישי · שישי"}'),
    ).toBeInTheDocument();

    rerender(
      <ActiveFilterChip
        geoActive={false}
        cityActive="חיפה"
        daysActive={["שישי", "שלישי", "ראשון"]}
        onClear={vi.fn()}
      />,
    );
    // Visible: collapsed to the first (week-order) day + a count of the rest.
    // Matched by predicate rather than a literal, so the assertion does not
    // depend on how the mock t() escapes its JSON payload.
    expect(
      screen.getByText(
        (text) =>
          text.startsWith("home.producers.city_day_chip:") &&
          text.includes("home.producers.days_chip_more:") &&
          text.includes("ראשון") &&
          text.includes("2") &&
          // the collapsed form must NOT spell out the days it dropped
          !text.includes("שלישי") &&
          !text.includes("שישי"),
      ),
    ).toBeInTheDocument();
    // ...but the assistive label still names all three.
    expect(screen.getByTestId("location-filter-chip")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("ראשון · שלישי · שישי"),
    );
  });
});
