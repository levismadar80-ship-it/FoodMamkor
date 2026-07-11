import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

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
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
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
      "CalendarX", "CookingPot", "Drop", "MapTrifold", "Path", "Plant",
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
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips, activeKey, onChipClick }) => (
    <div data-testid="chip-row">
      {chips.map((c) => (
        <button
          key={c.key}
          data-key={c.key}
          data-active={String(c.key === activeKey)}
          onClick={() => onChipClick(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  ),
}));

const EXPERIENCES_TAB = "events.list.tab_experiences";

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
    params = { city: "חיפה", category: "סדנה" }; // סדנה ∈ EVENT_CATEGORIES
    setUrl("/events?city=חיפה&category=סדנה");
    render(<EventsClient />);

    expect(cityInput()).toHaveValue("חיפה");
    // active category chip mirrors the URL category
    expect(chipRow().querySelector('[data-key="סדנה"]').dataset.active).toBe("true");
  });

  it("rejects a category outside the initial tab's vocabulary (cross-tab guard)", () => {
    // בישול ∈ EXPERIENCE_CATEGORIES only — on the events tab it must NOT seed.
    params = { city: "חיפה", category: "בישול" };
    setUrl("/events?city=חיפה&category=בישול");
    render(<EventsClient />);

    expect(cityInput()).toHaveValue("חיפה"); // city still seeds
    // category rejected → the "all" sentinel chip is active, not בישול
    expect(chipRow().querySelector('[data-key="all"]').dataset.active).toBe("true");
    expect(chipRow().querySelector('[data-key="בישול"]')).toBeNull();
  });

  it("changing category then city writes the updated query via replaceState", async () => {
    render(<EventsClient />);
    replaceSpy.mockClear();

    fireEvent.click(chip("שוק"));
    await waitFor(() => {
      expect(lastReplaceParams(replaceSpy)?.get("category")).toBe("שוק");
    });

    fireEvent.change(cityInput(), { target: { value: "תל אביב" } });
    await waitFor(() => {
      const p = lastReplaceParams(replaceSpy);
      expect(p?.get("city")).toBe("תל אביב");
      expect(p?.get("category")).toBe("שוק"); // category preserved alongside city
    });
  });

  it("switchTab clears city + category from the URL (intentional reset)", async () => {
    params = { city: "חיפה", category: "סדנה" };
    setUrl("/events?city=חיפה&category=סדנה");
    render(<EventsClient />);
    replaceSpy.mockClear();

    fireEvent.click(screen.getByRole("tab", { name: EXPERIENCES_TAB }));

    await waitFor(() => {
      const p = lastReplaceParams(replaceSpy);
      expect(p, "replaceState should have fired on tab switch").not.toBeNull();
      expect(p.get("tab")).toBe("experiences");
      expect(p.get("city")).toBeNull();
      expect(p.get("category")).toBeNull();
    });
  });
});
