import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import EventsClient from "@/app/[locale]/events/EventsClient";

// MEH-2559: the heart needs AuthProvider; its behaviour is SaveButton.test.jsx's.
vi.mock("@/components/SaveButton", () => ({ default: () => null }));

// MEH-2461 — the «מארגן: {name}» line on the /events list card. The harness
// below (params / api mock / row factory) is copied from the MEH-1865 empty-
// states suite so the cases render the real EventsClient; the matrix this file
// covers is the one in the describe block's header further down.

let params = {}; // drives useSearchParams().get(key)

// The api mock models the two axes independently: what the endpoint returns
// with NO filter (the dataset) vs what it returns WITH one. Keeping them apart
// is what lets a test say "rows exist AND the filter matched none" — the state
// a single fixture list cannot express.
let unfilteredRows = [];
let filteredRows = [];

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (k) => (k in params ? params[k] : null) }),
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
  // MEH-2461: values are appended so the «מארגן: {name}» interpolation is
  // observable (the name must reach the line, not just the key).
  useTranslations: (ns) => (k, v) =>
    `${ns ? `${ns}.${k}` : k}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
  useLocale: () => "he",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
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
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((_endpoint, config = {}) => {
      const p = config.params || {};
      const filtered = Boolean(p.city || p.category);
      return Promise.resolve({ data: filtered ? filteredRows : unfilteredRows });
    }),
  },
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/components/CalendarView", () => ({ default: () => null }));
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, label, id }) => (
    <input
      data-testid="city-input"
      data-filter-control="city"
      aria-label={label}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
vi.mock("@/components/ChipScrollRow", () => ({
  default: ({ chips, activeKey, onChipClick }) => (
    <div data-testid="chip-row" data-filter-control="category">
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


/**
 * MEH-2461 — the «מארגן: {name}» line on the /events list card.
 * Harness above is EventsEmptyStates.test.jsx's, copied (same mocks, same
 * full-component render); only the translation mock appends values.
 * Cells: owner organizer vs business; organizer row without a name.
 */
const row = (id, extra = {}) => ({
  id,
  title: `event ${id}`,
  event_date: "2026-11-0" + id,
  event_time: "10:00",
  city: "חיפה",
  category: "שוק",
  price: 0,
  description: "",
  ...extra,
});

const mount = async () => {
  render(<EventsClient initialTab="events" />);
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
};

beforeEach(() => {
  params = {};
  unfilteredRows = [];
  filteredRows = [];
  window.history.replaceState(null, "", "/events");
});
afterEach(cleanup);

describe("MEH-2461 — organizer line on the events card", () => {
  it("organizer-owned event: «מארגן: {name}» with the organizer's name", async () => {
    unfilteredRows = [row(1, { producer_name: "שוק גלם", owner_kind: "organizer", owner_slug: "gelem" })];
    await mount();
    expect(screen.getByText(/events\.list\.organizer_line שוק גלם/)).toBeInTheDocument();
  });

  it("business-owned event: the bare business name, no organizer line", async () => {
    unfilteredRows = [row(1, { producer_name: "חוות הניסוי", owner_kind: "producer", owner_slug: "farm" })];
    await mount();
    expect(screen.getByText(/חוות הניסוי/)).toBeInTheDocument();
    expect(screen.queryByText(/organizer_line/)).not.toBeInTheDocument();
  });

  it("many rows, mixed owners: each row labelled by its own owner", async () => {
    unfilteredRows = [
      row(1, { producer_name: "שוק גלם", owner_kind: "organizer", owner_slug: "gelem" }),
      row(2, { producer_name: "חוות הניסוי", owner_kind: "producer", owner_slug: "farm" }),
      row(3, { producer_name: "שוק הנמל", owner_kind: "organizer", owner_slug: "port" }),
    ];
    await mount();
    expect(screen.getAllByText(/events\.list\.organizer_line/)).toHaveLength(2);
    expect(screen.getByText(/חוות הניסוי/).textContent).not.toMatch(/organizer_line/);
  });

  it("a payload without owner_kind (pre-MEH-2459 API) reads as a business", async () => {
    unfilteredRows = [row(1, { producer_name: "חוות הניסוי" })];
    await mount();
    expect(screen.queryByText(/organizer_line/)).not.toBeInTheDocument();
  });
});

/**
 * MEH-2468 — the owner's cover image on the list row. Cells: with image /
 * without image / many rows mixed. MEH-2546: without one the row gets a
 * category tile (no photo, no brand name) — never an empty box.
 */
describe("MEH-2468 — event cover image on the /events row", () => {
  it("row with image_url: one thumbnail carrying that image", async () => {
    unfilteredRows = [row(1, { image_url: "https://res.cloudinary.com/x/image/upload/a.jpg" })];
    await mount();
    const thumbs = screen.getAllByTestId("event-row-image");
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0].style.backgroundImage).toContain("a.jpg");
  });

  it("row without image_url: a category tile, no photo", async () => {
    unfilteredRows = [row(1, { image_url: null })];
    await mount();
    expect(screen.getByText("event 1")).toBeInTheDocument();
    const tile = screen.getByTestId("event-row-image");
    expect(tile.getAttribute("data-kind")).toBe("category");
    expect(tile.style.backgroundImage).toBe("");
  });

  it("the /experiences tab gets the same rule (experiences carry image_url too)", async () => {
    unfilteredRows = [
      row(1, { image_url: "https://res.cloudinary.com/x/image/upload/exp.jpg", host: { name: "מארחת" } }),
      row(2, { image_url: null, host: { name: "מארחת" } }),
    ];
    render(<EventsClient initialTab="experiences" />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const kinds = screen.getAllByTestId("event-row-image").map((el) => el.getAttribute("data-kind"));
    expect(kinds).toEqual(["event", "category"]);
    expect(screen.getAllByTestId("event-row-image")[0].style.backgroundImage).toContain("exp.jpg");
  });

  it("many rows, mixed: a photo only on the rows that have an image", async () => {
    unfilteredRows = [
      row(1, { image_url: "https://res.cloudinary.com/x/image/upload/a.jpg" }),
      row(2, { image_url: null }),
      row(3, { image_url: "https://res.cloudinary.com/x/image/upload/c.jpg" }),
    ];
    await mount();
    const kinds = screen.getAllByTestId("event-row-image").map((el) => el.getAttribute("data-kind"));
    expect(kinds).toEqual(["event", "category", "event"]);
  });

  it("MEH-2476: a recurring experience row names its schedule; a one-off does not", async () => {
    unfilteredRows = [
      { id: 5, title: "x", event_date: "2026-11-05", city: "חיפה", category: "בישול", price_per_person: 0,
        is_recurring: true, recurring_schedule: "כל יום שישי", host: { name: "נועה" } },
      { id: 6, title: "y", event_date: "2026-11-06", city: "עכו", category: "בישול", price_per_person: 0,
        is_recurring: false, recurring_schedule: "כל יום ראשון", host: { name: "דנה" } },
    ];
    render(<EventsClient initialTab="experiences" />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("נועה · חיפה · כל יום שישי")).toBeInTheDocument();
    expect(screen.getByText("דנה · עכו")).toBeInTheDocument();
  });
});
