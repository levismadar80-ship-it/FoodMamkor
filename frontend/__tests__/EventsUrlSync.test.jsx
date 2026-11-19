import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within, act } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";
import { EVENT_CATEGORIES, EXPERIENCE_CATEGORIES } from "@/lib/event-categories";

// MEH-1131 (MEH-1085 / DISC-08): /events city + category are deep-linkable and
// mirrored back to the URL via a single shallow history.replaceState writer
// (EventsClient.jsx:157-167). These jsdom tests pin that contract without
// touching the source:
//   1. mount with ?city=&category= seeds state (category validated vs the
//      initial tab's vocabulary)
//   2. changing city / category writes an updated query via replaceState
//   3. switchTab clears city + category from the URL (intentional reset)
// Pattern mirrors __tests__/useHomePageDietChipsUrl.test.jsx (jsdom + a
// history spy) adapted for a full component render.

let params = {}; // drives useSearchParams().get(key)

vi.mock("next/navigation", () => ({
  // MEH-2847: EventsClient reads the category axis with getAll (multi-select);
  // a param may be a string or an array of strings.
  useSearchParams: () => ({
    get: (k) => (k in params ? [].concat(params[k])[0] : null),
    getAll: (k) => (k in params ? [].concat(params[k]) : []),
  }),
}));
// MEH-2245: switching tab is a route change through next-intl's router.
// MEH-3463: the stub router behaves like the real one where it matters here —
// push() writes the URL (keeping an /en prefix) and moves usePathname, which
// is now the ONLY source of the tab.
const nav = vi.hoisted(() => {
  const listeners = new Set();
  return {
    listeners,
    path: () => window.location.pathname.replace(/^\/en(?=\/|$)/, "") || "/",
    emit: () => listeners.forEach((l) => l()),
  };
});
const routerPush = (href) => {
  const prefix = /^\/en(\/|$)/.test(window.location.pathname) ? "/en" : "";
  window.history.pushState(null, "", `${prefix}${href}`);
  nav.emit();
};
const pushMock = vi.fn(routerPush);
vi.mock("@/i18n/navigation", async () => {
  const React = await import("react");
  return {
    useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () =>
      React.useSyncExternalStore(
        (l) => (nav.listeners.add(l), () => nav.listeners.delete(l)),
        nav.path,
      ),
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  };
});
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));
// Phosphor icons EventsClient imports by name → inert stubs.
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "ArrowCounterClockwise", "ArrowRight", "Basket", "CalendarBlank",
      "CalendarX", "CookingPot", "ForkKnife", "MapTrifold", "Path", "Plant",
      "Plus", "Rows", "Storefront",
    ].map((name) => [name, Stub]),
  );
});
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
// CitySearch stand-in: a controlled input that forwards onChange(value).
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, label, id }) => (
    <input
      data-testid="city-input"
      aria-label={label}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
// ChipScrollRow stand-in: one button per chip, exposing key + active state.
// MEH-2859: the hub row grew to four tabs, two of them gated on their own
// supply fetch. Pinned OFF here so this file keeps testing exactly the
// events/experiences pair it was written for, and so the gates' requests
// do not land in this file's api.get expectations. The four-tab row has
// its own file: __tests__/ListingHubTabs.test.jsx.
vi.mock("@/lib/use-hub-nav-gate", () => ({ useHubNavGate: () => false }));
vi.mock("@/components/ChipScrollRow", () => ({
  // MEH-2847: EventsClient passes the selection as an `activeKeys` Set (the
  // real ChipScrollRow's multi-select prop); «הכל» is active while it is empty.
  default: ({ chips, activeKeys, onChipClick }) => (
    <div data-testid="chip-row">
      {chips.map((c) => (
        <button
          key={c.key}
          data-key={c.key}
          data-active={String(c.key === "all" ? activeKeys.size === 0 : activeKeys.has(c.key))}
          onClick={() => onChipClick(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  ),
}));

const EXPERIENCES_TAB = "events.list.tab_experiences_short";

// Category wire values sourced from the SoT so the test survives key renames.
// MEH-1657: was "workshop" — removed from the events vocab when סדנה/סיור moved
// to the experiences side of the locked axis. Any two event categories work here;
// the test is about URL sync, not about which categories exist.
const EVENT_CAT = EVENT_CATEGORIES.find((c) => c.labelKey === "harvest").key; // in the events vocab
const EVENT_CAT_ALT = EVENT_CATEGORIES.find((c) => c.labelKey === "market").key; // in the events vocab
const CROSS_TAB_CAT = EXPERIENCE_CATEGORIES.find((c) => c.labelKey === "cooking").key; // experiences-only
const CITY = "חיפה";
const CITY_ALT = "תל אביב";

const setUrl = (url) => window.history.replaceState(null, "", url);
const cityInput = () => screen.getByTestId("city-input");
const chipRow = () => screen.getByTestId("chip-row");
const chip = (key) => within(chipRow()).getByRole("button", { name: (n, el) => el.getAttribute("data-key") === key });
// The third arg to replaceState is the URL; parse it so Hebrew percent-encoding
// doesn't matter for the assertions.
const lastReplaceParams = (spy) => {
  const call = spy.mock.calls.at(-1);
  return call ? new URL(call[2], "http://localhost").searchParams : null;
};

let replaceSpy;

beforeEach(() => {
  params = {};
  setUrl("/events");
  replaceSpy = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  replaceSpy.mockRestore();
  cleanup();
});

describe("/events city + category URL sync (MEH-1131 / DISC-08)", () => {
  it("mount with ?city=&category= seeds state from the URL params", () => {
    params = { city: CITY, category: EVENT_CAT };
    setUrl(`/events?city=${CITY}&category=${EVENT_CAT}`);
    render(<EventsClient />);

    expect(cityInput()).toHaveValue(CITY);
    // active category chip mirrors the URL category
    expect(chipRow().querySelector(`[data-key="${EVENT_CAT}"]`).dataset.active).toBe("true");
  });

  // MEH-2984: the query is read in a mount effect (no useSearchParams), so the
  // first commit holds empty filters. The list must still be fetched ONCE,
  // already filtered — never an unfiltered request first.
  it("a deep link fetches the list exactly once, already filtered", async () => {
    const { default: api } = await import("@/lib/api");
    api.get.mockClear();
    params = {}; // the hook is gone — only the real URL may seed state
    setUrl(`/events?city=${CITY}&category=${EVENT_CAT}`);
    render(<EventsClient />);

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    const listCalls = api.get.mock.calls.filter(([url]) => url === "/events");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0][1].params).toEqual({ city: CITY, category: [EVENT_CAT] });
    // and the writer left the deep link in the address bar
    expect(new URLSearchParams(window.location.search).get("city")).toBe(CITY);
  });

  it("rejects a category outside the initial tab's vocabulary (cross-tab guard)", () => {
    // An experiences-only category must NOT seed on the events tab.
    params = { city: CITY, category: CROSS_TAB_CAT };
    setUrl(`/events?city=${CITY}&category=${CROSS_TAB_CAT}`);
    render(<EventsClient />);

    expect(cityInput()).toHaveValue(CITY); // city still seeds
    // category rejected → the "all" sentinel chip is active, not the cross-tab one
    expect(chipRow().querySelector('[data-key="all"]').dataset.active).toBe("true");
    expect(chipRow().querySelector(`[data-key="${CROSS_TAB_CAT}"]`)).toBeNull();
  });

  it("changing category then city writes the updated query via replaceState", async () => {
    render(<EventsClient />);
    replaceSpy.mockClear();

    fireEvent.click(chip(EVENT_CAT_ALT));
    await waitFor(() => {
      expect(lastReplaceParams(replaceSpy)?.get("category")).toBe(EVENT_CAT_ALT);
    });

    fireEvent.change(cityInput(), { target: { value: CITY_ALT } });
    await waitFor(() => {
      const p = lastReplaceParams(replaceSpy);
      expect(p?.get("city")).toBe(CITY_ALT);
      expect(p?.get("category")).toBe(EVENT_CAT_ALT); // category preserved alongside city
    });
  });

  it("switchTab clears city + category from the URL (intentional reset)", async () => {
    params = { city: CITY, category: EVENT_CAT };
    setUrl(`/events?city=${CITY}&category=${EVENT_CAT}`);
    render(<EventsClient />);
    replaceSpy.mockClear();

    fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));

    // MEH-3463: the router pushes the bare route (/experiences), so the query
    // is gone from the address bar the moment it lands; the writer then has
    // nothing to change. Read the URL itself, not one of its writers.
    await waitFor(() => {
      expect(window.location.pathname).toBe("/experiences");
      const p = new URLSearchParams(window.location.search);
      // MEH-2245: the tab is the route now, so the writer never mirrors it.
      expect(p.get("tab")).toBeNull();
      expect(p.get("city")).toBeNull();
      expect(p.get("category")).toBeNull();
    });
  });
});

// MEH-2245: route-as-tab. The experiences tab is the /experiences route, and
// the URL writer must never emit ?tab= — the redirect in next.config.js only
// exists for OLD links, nothing in the app may mint a new one.
// MEH-3463: the switch is a real router.push (scroll:false); the shared
// (whats-on)/layout.js keeps the hub mounted, so no loader and no remount.
// It must NEVER write the route by hand with history.pushState (MEH-2980's
// in-place switch showed one URL with the other page's tree, 20/11).
describe("/events ↔ /experiences route-as-tab (MEH-2245 · MEH-3463)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    pushMock.mockImplementation(routerPush);
  });

  it("clicking the experiences tab routes to /experiences and the whole screen follows", async () => {
    setUrl("/events");
    render(<EventsClient />);
    expect(screen.getByRole("tab", { name: "events.list.tab_events" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]).toEqual(["/experiences", { scroll: false }]);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: EXPERIENCES_TAB })).toHaveAttribute("aria-selected", "true");
    });
    // Every part of the screen names the same tab (the 20/11 screenshot had
    // the row on one tab and the heading, the add link and the chips on the other).
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("events.list.h1_experiences");
    expect(screen.getByRole("link", { name: /events\.list\.submit_experience/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /events\.list\.add_event/ })).toBeNull();
  });

  it("the router's own path wins: a Back to /events puts the whole screen on events", async () => {
    setUrl("/experiences");
    render(<EventsClient />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("events.list.h1_experiences");

    // A history move the component did not start (Back / Forward / a link).
    window.history.pushState(null, "", "/events");
    act(() => nav.emit());

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "events.list.tab_events" })).toHaveAttribute("aria-selected", "true");
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("events.list.title");
    expect(screen.getByRole("link", { name: /events\.list\.add_event/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /events\.list\.submit_experience/ })).toBeNull();
  });

  it("Back to /events?city=X restores the city and fetches once, already filtered", async () => {
    const { default: api } = await import("@/lib/api");
    setUrl("/experiences");
    render(<EventsClient />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    api.get.mockClear();
    replaceSpy.mockClear();

    window.history.pushState(null, "", `/events?city=${encodeURIComponent(CITY)}`);
    act(() => nav.emit());

    await waitFor(() => expect(cityInput()).toHaveValue(CITY));
    await new Promise((r) => setTimeout(r, 50));
    const listCalls = api.get.mock.calls.filter(([url]) => url === "/events");
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0][1].params).toEqual({ city: CITY });
    expect(api.get.mock.calls.filter(([url]) => url === "/experiences")).toEqual([]);
    // The entry's query survived (the writer did not wipe it before it was read).
    expect(new URLSearchParams(window.location.search).get("city")).toBe(CITY);
  });

  it("a quick A→B→A while the router is slow ends on A and keeps writing filters", async () => {
    setUrl("/events");
    render(<EventsClient />);
    const queued = [];
    pushMock.mockImplementation((href) => queued.push(href)); // the router has not landed yet

    fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));
    expect(screen.getByRole("tab", { name: EXPERIENCES_TAB })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "events.list.tab_events" }));
    expect(screen.getByRole("tab", { name: "events.list.tab_events" })).toHaveAttribute("aria-selected", "true");
    expect(queued).toEqual(["/experiences", "/events"]);

    // Nothing is left pending on the tab the URL already names: a filter is
    // still mirrored to the address bar.
    replaceSpy.mockClear();
    fireEvent.change(cityInput(), { target: { value: CITY } });
    await waitFor(() => expect(lastReplaceParams(replaceSpy)?.get("city")).toBe(CITY));
  });

  it("never writes the route by hand (no history.pushState from the component)", () => {
    setUrl("/events");
    render(<EventsClient />);
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    pushMock.mockImplementationOnce(() => {}); // the router call itself, without its URL write
    fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).not.toHaveBeenCalled();
    pushStateSpy.mockRestore();
  });

  it("from /en/experiences the router gets the bare route (next-intl keeps the prefix)", () => {
    setUrl("/en/experiences");
    render(<EventsClient />);

    fireEvent.click(screen.getByRole("tab", { name: "events.list.tab_events" }));

    expect(pushMock.mock.calls[0][0]).toBe("/events");
    expect(window.location.pathname).toBe("/en/events");
  });

  it("clicking the already-active tab does not navigate", () => {
    setUrl("/experiences");
    render(<EventsClient />);

    fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("the URL writer never contains tab= — on either route, through a switch and a filter", async () => {
    // Start on the experiences route with a filter so the writer has to fire.
    setUrl("/experiences");
    render(<EventsClient />);
    replaceSpy.mockClear();
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    fireEvent.change(cityInput(), { target: { value: CITY } });
    await waitFor(() => expect(lastReplaceParams(replaceSpy)?.get("city")).toBe(CITY));
    // Then switch tabs (the reset drops the filter from the new entry).
    fireEvent.click(screen.getByRole("tab", { name: "events.list.tab_events" }));
    await waitFor(() => expect(window.location.pathname).toBe("/events"));
    expect(new URLSearchParams(window.location.search).get("city")).toBeNull();

    // Derived, not stated: every URL replaceState / pushState wrote in this test.
    const written = [...replaceSpy.mock.calls, ...pushStateSpy.mock.calls].map((c) => String(c[2]));
    expect(written.length).toBeGreaterThan(0);
    expect(written.filter((u) => u.includes("tab="))).toEqual([]);
    pushStateSpy.mockRestore();
  });
});
