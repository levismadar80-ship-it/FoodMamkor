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
// MEH-2186 — DeliveryDayRow became ONE dropdown chip + an inline day panel,
// and ActiveFilterChip became LOCATION-ONLY. The hook half of this file is
// untouched by that (the state machine, the URL contract and the API params
// are byte-identical); everything below "DeliveryDayRow chip + panel" is the
// new presentation. The day value now appears exactly once on screen, on the
// day chip, and the location chip no longer knows about days at all.

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// MEH-1774: use-home-page now imports the locale-aware router for the chip
// deep-link. Stub it so next-intl's ESM createNavigation never loads under vitest.
const localeRouterPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: localeRouterPush, replace: vi.fn() }),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
// MEH-2186: DeliveryDayRow now imports Phosphor glyphs. Enumerated by hand,
// not a Proxy — a Proxy's getter runs during import and dereferences the JSX
// runtime before vitest has initialised it (same reason as the equivalent mock
// in ProducersClientDayAxis.test.jsx).
vi.mock("@phosphor-icons/react", () => ({
  CalendarBlank: (p) => <span {...p} />,
  CaretDown: (p) => <span {...p} />,
  CaretUp: (p) => <span {...p} />,
  MapPin: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
}));
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

describe("DeliveryDayRow chip + panel (MEH-2186)", () => {
  /** The panel's pills — the count the ticket's verification step pins. */
  const pillCount = () =>
    document.querySelectorAll('[data-testid^="delivery-day-pill-"]').length;

  // ---- closed state ----

  it("CLOSED with no city: one idle chip, zero pills, nothing aria-disabled", () => {
    render(<DeliveryDayRow cityActive={null} daysActive={[]} onSelectDay={vi.fn()} />);
    const row = screen.getByTestId("delivery-day-row");
    expect(row).toHaveAttribute("data-ghost", "true");

    const chip = screen.getByTestId("delivery-day-chip");
    expect(chip).toHaveTextContent("home.producers.day_chip_idle");
    expect(chip).toHaveAttribute("aria-expanded", "false");
    // MEH-2186: the MEH-1771 ghost pills are gone, and with them the
    // aria-disabled-but-clickable contradiction this ticket exists to close.
    expect(pillCount()).toBe(0);
    expect(row.querySelector("[aria-disabled]")).toBeNull();
    expect(screen.queryByTestId("delivery-day-panel")).not.toBeInTheDocument();
    // No days → no ✕.
    expect(screen.queryByTestId("delivery-day-clear")).not.toBeInTheDocument();
  });

  it("CLOSED with a city and no days: still exactly one chip and zero pills", () => {
    render(<DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />);
    expect(screen.getByTestId("delivery-day-row")).toHaveAttribute("data-ghost", "false");
    expect(screen.getByTestId("delivery-day-chip")).toHaveTextContent(
      "home.producers.day_chip_idle",
    );
    expect(pillCount()).toBe(0);
  });

  // ---- the no-city route (MEH-1771 precondition, MEH-1825 one handler) ----

  it("chip tap with NO city calls onSelectDay (the surface's LocationModal route)", () => {
    const onSelectDay = vi.fn();
    render(<DeliveryDayRow cityActive={null} daysActive={[]} onSelectDay={onSelectDay} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    // ONE handler, no second prop (MEH-1825). Both surfaces' no-city branch
    // returns before reading the argument, so the chip sends none.
    expect(onSelectDay).toHaveBeenCalledTimes(1);
    expect(onSelectDay.mock.calls[0]).toEqual([]);
    // ...and it did NOT open a panel — a day cannot be picked without a city.
    expect(screen.queryByTestId("delivery-day-panel")).not.toBeInTheDocument();
    expect(pillCount()).toBe(0);
  });

  it("a day leaking in without a city is never shown as selected", () => {
    render(<DeliveryDayRow cityActive={null} daysActive={["שישי"]} onSelectDay={vi.fn()} />);
    // Idle label, not "שישי" — MEH-1771's rule, carried across the reshape.
    expect(screen.getByTestId("delivery-day-chip")).toHaveTextContent(
      "home.producers.day_chip_idle",
    );
    expect(screen.queryByTestId("delivery-day-clear")).not.toBeInTheDocument();
  });

  // ---- open state ----

  it("chip tap WITH a city opens the panel: hint + exactly 7 pills, not 8", () => {
    render(<DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));

    const panel = screen.getByTestId("delivery-day-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("delivery-day-panel-hint")).toHaveTextContent(
      'home.producers.day_panel_hint:{"city":"חיפה"}',
    );
    // Exactly 7 — the count, not a sum of literals. An 8th pill (a stray
    // day, a duplicated map) reds this.
    expect(pillCount()).toBe(7);
    // ...and every one of them is a real DELIVERY_DAYS member.
    expect(panel.querySelectorAll('[data-testid^="delivery-day-pill-"]')).toHaveLength(7);

    const chip = screen.getByTestId("delivery-day-chip");
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(chip).toHaveAttribute("aria-controls", panel.id);
  });

  it("tapping the chip again closes the panel (toggle)", () => {
    render(<DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(pillCount()).toBe(7);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(pillCount()).toBe(0);
    expect(screen.getByTestId("delivery-day-chip")).toHaveAttribute("aria-expanded", "false");
  });

  // ---- multi-select inside the panel (MEH-2036 semantics, preserved) ----

  it("panel pills keep the MEH-2036 per-pill aria-pressed and forward the day", () => {
    const onSelectDay = vi.fn();
    render(
      <DeliveryDayRow cityActive="חיפה" daysActive={["רביעי", "שישי"]} onSelectDay={onSelectDay} />,
    );
    fireEvent.click(screen.getByTestId("delivery-day-chip"));

    expect(screen.getByTestId("delivery-day-pill-רביעי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שישי")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-day-pill-שלישי")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));
    expect(onSelectDay).toHaveBeenCalledWith("שלישי");
  });

  // The Baymard mutually-exclusive-facet defect: closing per selection forces
  // a reload between every comparison. The panel must survive a tap.
  it("the panel STAYS OPEN across pill taps", () => {
    render(<DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />);
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    fireEvent.click(screen.getByTestId("delivery-day-pill-שלישי"));
    fireEvent.click(screen.getByTestId("delivery-day-pill-שישי"));
    expect(screen.getByTestId("delivery-day-panel")).toBeInTheDocument();
    expect(pillCount()).toBe(7);
  });

  // ---- the chip's own label ----

  it("chip label: 1 day bare, 2+ collapsed with the FULL set in aria-label", () => {
    const { rerender } = render(
      <DeliveryDayRow cityActive="חיפה" daysActive={["שישי"]} onSelectDay={vi.fn()} />,
    );
    const chip = () => screen.getByTestId("delivery-day-chip");
    expect(chip()).toHaveTextContent("שישי");
    // One day is already complete, so nothing shadows the visible name.
    expect(chip()).not.toHaveAttribute("aria-label");

    // Two days, tapped out of week order → collapses to the FIRST BY WEEK +1.
    // This is the ticket's DoD case: ?delivery_days=שישי&delivery_days=רביעי
    // must read "רביעי +1".
    rerender(
      <DeliveryDayRow cityActive="חיפה" daysActive={["שישי", "רביעי"]} onSelectDay={vi.fn()} />,
    );
    expect(chip()).toHaveTextContent('home.producers.days_chip_more:{"day":"רביעי","count":1}');
    // ...and a screen reader still gets both, in week order.
    expect(chip()).toHaveAttribute("aria-label", "רביעי · שישי");

    rerender(
      <DeliveryDayRow
        cityActive="חיפה"
        daysActive={["שישי", "שלישי", "ראשון"]}
        onSelectDay={vi.fn()}
      />,
    );
    expect(chip()).toHaveTextContent('home.producers.days_chip_more:{"day":"ראשון","count":2}');
    expect(chip()).toHaveAttribute("aria-label", "ראשון · שלישי · שישי");
  });

  // ---- the ✕ ----

  it("the ✕ clears days ONLY and does not toggle the panel", () => {
    const onClearDays = vi.fn();
    const onSelectDay = vi.fn();
    render(
      <DeliveryDayRow
        cityActive="חיפה"
        daysActive={["שישי"]}
        onSelectDay={onSelectDay}
        onClearDays={onClearDays}
      />,
    );
    const clear = screen.getByTestId("delivery-day-clear");
    expect(clear).toHaveAttribute("aria-label", "home.producers.day_chip_clear_aria");

    fireEvent.click(clear);
    expect(onClearDays).toHaveBeenCalledTimes(1);
    // The city axis is NOT this button's business, and neither is the panel.
    expect(onSelectDay).not.toHaveBeenCalled();
    expect(screen.queryByTestId("delivery-day-panel")).not.toBeInTheDocument();
  });

  // ---- panel a11y ----

  it("Esc closes the panel and returns focus to the chip", () => {
    render(<DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />);
    const chip = screen.getByTestId("delivery-day-chip");
    fireEvent.click(chip);
    expect(pillCount()).toBe(7);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(pillCount()).toBe(0);
    expect(document.activeElement).toBe(chip);
  });

  it("an outside click closes the panel; a click inside does not", () => {
    render(
      <div>
        <button data-testid="outside">elsewhere</button>
        <DeliveryDayRow cityActive="חיפה" daysActive={[]} onSelectDay={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(pillCount()).toBe(7);

    // Inside first — the panel must survive its own pills.
    fireEvent.mouseDown(screen.getByTestId("delivery-day-pill-שלישי"));
    expect(pillCount()).toBe(7);

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(pillCount()).toBe(0);
  });

  it("SWITCHING city closes an open panel, and it does not spring back", () => {
    const { rerender } = render(
      <DeliveryDayRow cityActive="חיפה" daysActive={["שישי"]} onSelectDay={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(pillCount()).toBe(7);

    // The panel's hint names the city; a switch makes it name the wrong one.
    rerender(<DeliveryDayRow cityActive="עכו" daysActive={["שישי"]} onSelectDay={vi.fn()} />);
    expect(pillCount()).toBe(0);

    // Clearing and re-picking the SAME city must not reopen it either — the
    // reset tracks the transition, not the city's identity.
    rerender(<DeliveryDayRow cityActive={null} daysActive={[]} onSelectDay={vi.fn()} />);
    rerender(<DeliveryDayRow cityActive="עכו" daysActive={[]} onSelectDay={vi.fn()} />);
    expect(pillCount()).toBe(0);
    expect(screen.getByTestId("delivery-day-chip")).toHaveAttribute("aria-expanded", "false");
  });

  it("losing the city closes an open panel", () => {
    const { rerender } = render(
      <DeliveryDayRow cityActive="חיפה" daysActive={["שישי"]} onSelectDay={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("delivery-day-chip"));
    expect(pillCount()).toBe(7);
    // The city ✕ / "נקו הכל" path: the panel's hint names a city that no
    // longer exists and its pills can no longer filter.
    rerender(<DeliveryDayRow cityActive={null} daysActive={[]} onSelectDay={vi.fn()} />);
    expect(pillCount()).toBe(0);
    expect(screen.getByTestId("delivery-day-chip")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("ActiveFilterChip is LOCATION-ONLY (MEH-2186)", () => {
  it("renders the plain city form even when days are active elsewhere", () => {
    render(<ActiveFilterChip geoActive={false} cityActive="חיפה" onClear={vi.fn()} />);
    expect(screen.getByText('home.producers.city_chip:{"city":"חיפה"}')).toBeInTheDocument();
    // The day value belongs to the day chip now — exactly once on screen.
    expect(screen.queryByText(/city_day_chip/)).not.toBeInTheDocument();
    expect(screen.queryByText(/days_chip_more/)).not.toBeInTheDocument();
  });

  it("ignores a daysActive prop entirely if a stale call site still passes one", () => {
    // A leftover prop must not resurrect the deleted label — the component no
    // longer destructures it, so this is the regression guard for a partial
    // revert of the call-site change.
    render(
      <ActiveFilterChip
        geoActive={false}
        cityActive="חיפה"
        daysActive={["שישי", "שלישי"]}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText('home.producers.city_chip:{"city":"חיפה"}')).toBeInTheDocument();
    expect(screen.getByTestId("location-filter-chip")).toHaveAttribute(
      "aria-label",
      "home.producers.clear_location_filter",
    );
  });
});
