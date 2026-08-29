import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

// MEH-2199 chunk 2 — /events declares two tablists (the events/experiences pair
// and the list/calendar view toggle) with role="tab" + aria-selected, and until
// this ticket neither carried the keyboard layer that contract promises: every
// tab was its own tab-stop and the arrow keys did nothing.
//
// RTL arrow mapping is the house one — ArrowLeft = next, ArrowRight = prev
// (Lightbox.jsx:58) — so these assertions are direction-explicit on purpose: a
// suite that only checked "some other tab got focus" would pass against an LTR
// mapping, which is the regression most likely to be introduced here.
//
// Mock scaffolding mirrors __tests__/EventsUrlSync.test.jsx (same component,
// same dependency surface).

let params = {};

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "ArrowCounterClockwise", "ArrowRight", "Basket", "CalendarBlank",
      "CalendarX", "CookingPot", "Drop", "MapTrifold", "Path", "Plant",
      "Plus", "Rows", "Storefront",
    ].map((name) => [name, Stub]),
  );
});
// One row so the dataset is NOT empty — the view toggle is withheld on an
// empty dataset (EventsClient.jsx:342, MEH-1865), and a test that mocked an
// empty response would silently cover only half the surface.
const ROW = {
  id: "e1",
  title: "אירוע",
  date: "2026-09-01T10:00:00",
  city: "חיפה",
  category: "market",
};
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [ROW] })) },
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בספטמבר" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, label, id }) => (
    <input data-testid="city-input" aria-label={label} id={id} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/ChipScrollRow", () => ({ default: () => null }));

const TAB_EVENTS = "events.list.tab_events";
const TAB_EXPERIENCES = "events.list.tab_experiences";
const VIEW_LIST = "events.list.view_list";
const VIEW_CALENDAR = "events.list.view_calendar";

/** The events/experiences tablist — the first one on the page. */
const mainTablist = () => screen.getAllByRole("tablist")[0];
/** The list/calendar view toggle — rendered only on a non-empty dataset. */
const viewTablist = async () =>
  (await waitFor(() => {
    const lists = screen.getAllByRole("tablist");
    expect(lists.length).toBe(2);
    return lists;
  }))[1];

const tabsIn = (list) => within(list).getAllByRole("tab");
const tabIndexes = (list) => tabsIn(list).map((el) => el.getAttribute("tabindex"));

beforeEach(() => {
  params = {};
  window.history.replaceState(null, "", "/he/events");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EventsClient — events/experiences tablist keyboard (MEH-2199)", () => {
  it("exposes exactly one tab stop, on the selected tab", () => {
    render(<EventsClient />);
    const list = mainTablist();
    expect(tabIndexes(list)).toEqual(["0", "-1"]);
    // Numeric, not a spot check: N-1 tabs must be removed from the tab order.
    expect(tabIndexes(list).filter((v) => v === "0")).toHaveLength(1);
  });

  it("ArrowLeft moves to the NEXT tab and activates it (RTL contract)", async () => {
    render(<EventsClient />);
    const list = mainTablist();
    const [events, experiences] = tabsIn(list);
    events.focus();
    fireEvent.keyDown(events, { key: "ArrowLeft" });

    expect(document.activeElement).toBe(experiences);
    await waitFor(() => expect(experiences).toHaveAttribute("aria-selected", "true"));
    expect(events).toHaveAttribute("aria-selected", "false");
    // The tab stop follows the selection — it never lands on both or neither.
    expect(tabIndexes(list)).toEqual(["-1", "0"]);
  });

  it("ArrowRight moves to the PREVIOUS tab, wrapping (RTL contract)", async () => {
    render(<EventsClient />);
    const list = mainTablist();
    const [events, experiences] = tabsIn(list);
    events.focus();
    fireEvent.keyDown(events, { key: "ArrowRight" });

    expect(document.activeElement).toBe(experiences);
    await waitFor(() => expect(experiences).toHaveAttribute("aria-selected", "true"));
  });

  it("End selects the last tab and Home the first", async () => {
    render(<EventsClient />);
    const list = mainTablist();
    const [events, experiences] = tabsIn(list);

    events.focus();
    fireEvent.keyDown(events, { key: "End" });
    expect(document.activeElement).toBe(experiences);
    await waitFor(() => expect(experiences).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(experiences, { key: "Home" });
    expect(document.activeElement).toBe(events);
    await waitFor(() => expect(events).toHaveAttribute("aria-selected", "true"));
  });

  it("leaves an unhandled key alone — no preventDefault, no selection change", () => {
    render(<EventsClient />);
    const list = mainTablist();
    const [events] = tabsIn(list);
    events.focus();
    const handled = fireEvent.keyDown(events, { key: "a" });
    // fireEvent returns false when preventDefault was called.
    expect(handled).toBe(true);
    expect(events).toHaveAttribute("aria-selected", "true");
  });

  // The handler reads each tab's wire value off the DOM, which is what keeps
  // order and value single-owned — and what makes a tab added without the
  // attribute activate with `undefined`. The runtime bails silently on that by
  // design; THIS is the assertion that makes the omission loud.
  it("every tab on the page carries the wire value the handler reads", async () => {
    render(<EventsClient />);
    await waitFor(() => expect(screen.getAllByRole("tablist").length).toBe(2));
    const all = screen.getAllByRole("tab");
    expect(all.length).toBe(4);
    expect(all.map((el) => el.dataset.tabValue)).toEqual([
      "events", "experiences", "list", "calendar",
    ]);
  });

  it("names the tabs it moves between, so the mapping is not vacuous", () => {
    render(<EventsClient />);
    const [events, experiences] = tabsIn(mainTablist());
    expect(events).toHaveTextContent(TAB_EVENTS);
    expect(experiences).toHaveTextContent(TAB_EXPERIENCES);
  });
});

describe("EventsClient — list/calendar view tablist keyboard (MEH-2199)", () => {
  it("exposes exactly one tab stop, on the selected view", async () => {
    render(<EventsClient />);
    const list = await viewTablist();
    expect(tabIndexes(list)).toEqual(["0", "-1"]);
  });

  it("ArrowLeft moves to the NEXT view control and activates it", async () => {
    render(<EventsClient />);
    const list = await viewTablist();
    const [listTab, calendarTab] = tabsIn(list);
    expect(listTab).toHaveAttribute("aria-label", VIEW_LIST);
    expect(calendarTab).toHaveAttribute("aria-label", VIEW_CALENDAR);

    listTab.focus();
    fireEvent.keyDown(listTab, { key: "ArrowLeft" });

    expect(document.activeElement).toBe(calendarTab);
    await waitFor(() => expect(calendarTab).toHaveAttribute("aria-selected", "true"));
    expect(tabIndexes(list)).toEqual(["-1", "0"]);
  });

  it("Home returns to the list view", async () => {
    render(<EventsClient />);
    const list = await viewTablist();
    const [listTab, calendarTab] = tabsIn(list);
    listTab.focus();
    fireEvent.keyDown(listTab, { key: "ArrowLeft" });
    await waitFor(() => expect(calendarTab).toHaveAttribute("aria-selected", "true"));

    fireEvent.keyDown(calendarTab, { key: "Home" });
    expect(document.activeElement).toBe(listTab);
    await waitFor(() => expect(listTab).toHaveAttribute("aria-selected", "true"));
  });
});
