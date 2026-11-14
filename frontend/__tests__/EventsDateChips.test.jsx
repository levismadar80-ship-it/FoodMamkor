/**
 * MEH-3118 — date shortcuts on /events and /experiences: «היום», «מחר»,
 * «סוף השבוע». One row with the categories, right after «הכל»; one at a time;
 * tap again = off; «הכל» clears it; filtering never refetches.
 *
 * The clock is frozen (testing.md, Israel clock): today = Wednesday 2026-11-18,
 * so tomorrow = 19/11 and the weekend = Fri 20/11 + Sat 21/11.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import he from "../messages/he.json";
import api from "@/lib/api";
import { matchesWhen } from "@/lib/event-date-filter";

const TODAY = "2026-11-18"; // a Wednesday
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
const row = (id, event_date) => ({
  id, title: `event ${id}`, event_date, event_time: "10:00", city: "חיפה",
  category: "שוק", price: 0, producer_name: "בית עסק", description: "",
});
const ROWS = [
  row("today", "2026-11-18"), row("tomorrow", "2026-11-19"), row("fri", "2026-11-20"),
  row("sat", "2026-11-21"), row("next-sun", "2026-11-22"), row("next-fri", "2026-11-27"),
];
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/components/HubShell", () => ({ default: () => null }));
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

const chip = (k) => document.querySelector(`[data-key="${k}"]`);
const shown = () => ROWS.map((r) => r.id).filter((id) => screen.queryByText(`event ${id}`));
const mount = async () => {
  render(<EventsClient />);
  await screen.findByText("event today");
};

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: ROWS });
});
afterEach(cleanup);

describe("approved copy (MEH-3118 rows 7–9)", () => {
  it("is word for word", () => {
    expect(he.events.list.when_today).toBe("היום");
    expect(he.events.list.when_tomorrow).toBe("מחר");
    expect(he.events.list.when_weekend).toBe("סוף השבוע");
  });
});

describe("matchesWhen", () => {
  it("weekend = Friday and Saturday of this week, from any weekday", () => {
    expect(matchesWhen("2026-11-20", "weekend", TODAY)).toBe(true);
    expect(matchesWhen("2026-11-21", "weekend", TODAY)).toBe(true);
    expect(matchesWhen("2026-11-22", "weekend", TODAY)).toBe(false); // Sunday
    expect(matchesWhen("2026-11-27", "weekend", TODAY)).toBe(false); // next Friday
  });
  it("on a Friday the weekend is today and tomorrow; on a Saturday, today only", () => {
    expect(matchesWhen("2026-11-20", "weekend", "2026-11-20")).toBe(true);
    expect(matchesWhen("2026-11-21", "weekend", "2026-11-20")).toBe(true);
    expect(matchesWhen("2026-11-21", "weekend", "2026-11-21")).toBe(true);
    expect(matchesWhen("2026-11-22", "weekend", "2026-11-21")).toBe(false);
    expect(matchesWhen("2026-11-27", "weekend", "2026-11-21")).toBe(false);
  });
  it("on a Sunday the weekend is the coming Friday and Saturday", () => {
    expect(matchesWhen("2026-11-27", "weekend", "2026-11-22")).toBe(true);
    expect(matchesWhen("2026-11-28", "weekend", "2026-11-22")).toBe(true);
    expect(matchesWhen("2026-11-22", "weekend", "2026-11-22")).toBe(false);
  });
  it("no shortcut matches everything; an unreadable date matches none", () => {
    expect(matchesWhen("2026-11-22", null, TODAY)).toBe(true);
    expect(matchesWhen("not-a-date", "today", TODAY)).toBe(false);
  });
});

describe("the chips on the list", () => {
  it("sit right after «הכל», before the categories", async () => {
    await mount();
    const keys = [...document.querySelectorAll("[data-key]")].map((b) => b.dataset.key);
    expect(keys.slice(0, 4)).toEqual(["all", "when:today", "when:tomorrow", "when:weekend"]);
    expect(keys.length).toBeGreaterThan(4);
  });

  it("each narrows the rows, with no second request", async () => {
    await mount();
    const calls = api.get.mock.calls.length;
    fireEvent.click(chip("when:today"));
    expect(shown()).toEqual(["today"]);
    fireEvent.click(chip("when:tomorrow"));
    expect(shown()).toEqual(["tomorrow"]); // one at a time
    expect(chip("when:today").dataset.active).toBe("false");
    fireEvent.click(chip("when:weekend"));
    expect(shown()).toEqual(["fri", "sat"]);
    expect(api.get.mock.calls.length).toBe(calls);
  });

  it("tap again turns it off; «הכל» clears it", async () => {
    await mount();
    fireEvent.click(chip("when:today"));
    expect(chip("all").dataset.active).toBe("false");
    fireEvent.click(chip("when:today"));
    expect(shown().length).toBe(ROWS.length);
    expect(chip("all").dataset.active).toBe("true");
    fireEvent.click(chip("when:weekend"));
    fireEvent.click(chip("all"));
    expect(shown().length).toBe(ROWS.length);
  });

  it("a shortcut with no rows shows the filtered-to-zero surface, chips kept", async () => {
    api.get.mockResolvedValue({ data: [row("next-fri", "2026-11-27")] });
    render(<EventsClient />);
    await screen.findByText("event next-fri");
    fireEvent.click(chip("when:today"));
    await waitFor(() => expect(screen.queryByText("event next-fri")).toBeNull());
    expect(chip("when:today")).not.toBeNull(); // the way back is still there
    expect(screen.getByText("events.list.no_results_cta")).toBeTruthy();
  });
});
