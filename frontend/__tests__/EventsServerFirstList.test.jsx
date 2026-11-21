/**
 * MEH-2233 — /events and /experiences render their first list on the server.
 * (whats-on)/layout.js reads both unfiltered lists and hands them in as
 * `initialRows`; EventsClient uses the one for the tab the visit arrived on,
 * once, and only when the URL carries no filter. Everything else fetches as
 * before — which keeps MEH-3463's "one request per tab switch / Back" true
 * (e2e/flows/46-hub-tab-switch.spec.ts counts those requests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import api from "@/lib/api";
import { renderToString } from "react-dom/server";

vi.mock("@/lib/israel-date", () => ({ israelToday: () => "2026-11-18" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null, getAll: () => [] }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>{children}</a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
  useLocale: () => "he",
}));
// Two categories, so the category chips are drawn (MEH-3124 hides them when
// only one category has rows).
const row = (id, event_date, category = "שוק") => ({
  id, title: `event ${id}`, event_date, event_time: "10:00", city: "חיפה",
  category, price: 0, producer_name: "בית עסק", description: "",
});
const ROWS = [
  row("today", "2026-11-18"), row("tomorrow", "2026-11-19"), row("fri", "2026-11-20"),
  row("sat", "2026-11-21"), row("next-sun", "2026-11-22"), row("next-fri", "2026-11-27", "קטיף"),
];
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
// The shell is not the subject; it only has to hand back the tab switch.
vi.mock("@/components/HubShell", () => ({
  default: ({ onSelect }) => (
    <button data-testid="to-experiences" onClick={(e) => onSelect("experiences", e)}>x</button>
  ),
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({ default: () => null }));
vi.mock("@/components/ChipScrollRow", () => ({
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

import EventsClient from "@/app/[locale]/events/EventsClient";


const seeded = { events: ROWS, experiences: [row("exp-1", "2026-11-19", "סדנה")] };

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: ROWS });
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

describe("server-first list (MEH-2233)", () => {
  it("the server HTML already holds the rows — no skeleton", () => {
    const html = renderToString(<EventsClient initialRows={seeded} />);
    expect(html).toContain("event today");
    expect(html).not.toContain('aria-busy="true"');
  });

  it("with no server rows the server HTML is the skeleton, as before", () => {
    const html = renderToString(<EventsClient initialRows={{ events: null, experiences: null }} />);
    expect(html).not.toContain("event today");
    expect(html).toContain('aria-busy="true"');
  });

  it("an unfiltered arrival shows the server rows, then refreshes them without the skeleton", async () => {
    api.get.mockResolvedValue({ data: [row("fresh", "2026-11-20")] });
    const { container } = render(<EventsClient initialRows={seeded} />);
    expect(screen.getByText("event today")).toBeTruthy();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get.mock.calls[0][0]).toBe("/events");
    expect(api.get.mock.calls[0][1].params).toEqual({});
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    // the fresh answer replaces the cached one (a Back replays an old list)
    await waitFor(() => expect(screen.getByText("event fresh")).toBeTruthy());
    expect(screen.queryByText("event today")).toBeNull();
  });

  it("a failed quiet refresh keeps the server rows, with no error state", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    render(<EventsClient initialRows={seeded} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("event today")).toBeTruthy();
    expect(screen.queryByTestId("events-load-error")).toBeNull();
  });

  it("an arrival with a filter in the URL fetches, with that filter", async () => {
    window.history.replaceState(null, "", "/?city=%D7%97%D7%99%D7%A4%D7%94");
    render(<EventsClient initialRows={seeded} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get.mock.calls[0][0]).toBe("/events");
    expect(api.get.mock.calls[0][1].params.city).toBe("חיפה");
  });

  it("no server rows → one client request, as before", async () => {
    render(<EventsClient initialRows={{ events: null, experiences: null }} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get.mock.calls[0][0]).toBe("/events");
  });

  it("a category picked after a seeded arrival fetches with it (the seed is used once)", async () => {
    render(<EventsClient initialRows={seeded} />);
    // The one row holds «all», the date chips (when:*) and the categories.
    const chip = screen
      .getAllByTestId("chip-row")
      .flatMap((r) => [...r.querySelectorAll("button")])
      .find((b) => b.dataset.key !== "all" && !b.dataset.key.startsWith("when:"));
    expect(chip).toBeTruthy();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1)); // the quiet refresh
    fireEvent.click(chip);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get.mock.calls[1][0]).toBe("/events");
    expect(api.get.mock.calls[1][1].params.category).toBeTruthy();
  });

  it("the other tab is fetched on a switch, even though the server read it", async () => {
    render(<EventsClient initialRows={seeded} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1)); // the quiet refresh
    fireEvent.click(screen.getByTestId("to-experiences"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get.mock.calls[1][0]).toBe("/experiences");
  });
});
