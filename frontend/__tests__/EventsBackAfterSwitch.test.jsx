import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

// MEH-3090: Back right after an in-place tab switch must land on the tab the
// URL names. usePathname lags EventsClient's own history.pushState (Next
// applies it in a transition), so a quick Back can see the hook read
// /events → /events and never move. Here the hook is pinned to one value for
// the whole test — the lag held forever — so only the browser's own popstate
// can bring the tab back. Before the fix the events tab stayed
// aria-selected="false" (CI run 44378115964, 46-hub-tab-switch.spec.ts:114).
// REUSES: __tests__/EventsUrlSync.test.jsx — the same module stubs.

let params = {}; // drives useSearchParams().get(key)

vi.mock("next/navigation", () => ({
  // MEH-2847: EventsClient reads the category axis with getAll (multi-select);
  // a param may be a string or an array of strings.
  useSearchParams: () => ({
    get: (k) => (k in params ? [].concat(params[k])[0] : null),
    getAll: (k) => (k in params ? [].concat(params[k]) : []),
  }),
}));
// MEH-2245: switching tab is a route change through next-intl's router;
// stub it (HANDOFF lesson: next-intl navigation under vitest needs the
// 5-line @/i18n/navigation stub, same as the Register suites).
const pushMock = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));
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


const CITY = "חיפה";
const tab = (value) => document.querySelector(`[role="tab"][data-tab-value="${value}"]`);

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/events");
});

describe("Back across an in-place switch, with usePathname lagging (MEH-3090)", () => {
  it("lands on the events tab and restores the city from the URL", async () => {
    window.history.replaceState(null, "", `/events?city=${encodeURIComponent(CITY)}`);
    render(<EventsClient titles={{ events: "Events", experiences: "Experiences" }} />);
    await waitFor(() => expect(screen.getByTestId("city-input")).toHaveValue(CITY));
    expect(tab("events")).toHaveAttribute("aria-selected", "true");

    fireEvent.click(tab("experiences"));
    await waitFor(() => expect(tab("experiences")).toHaveAttribute("aria-selected", "true"));
    expect(window.location.pathname).toBe("/experiences");

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/events"));
    await waitFor(() => expect(tab("events")).toHaveAttribute("aria-selected", "true"));
    expect(tab("experiences")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("city-input")).toHaveValue(CITY);
  });
});
