/**
 * MEH-2803 — the business page says its hours ONCE: one «שעות» section, each
 * set under its own label (Google Business Profile «More hours»), one set when
 * the two are identical.
 *
 * Rendered through the REAL ProducerSections + OrderWindowStrip + OpeningHours
 * under the real NextIntlClientProvider + he.json, so a missing key reds the
 * run (onError is collected, not swallowed) and the page text is the text a
 * visitor reads.
 *
 * Cells (CLAUDE.md 5-state rule, state × disclosure is a MATRIX):
 *   orders-only / store-only / both-different / both-identical / neither
 *   × closed / open.
 * Plus guard 11 («one fact, one place») and the demo-seed shape.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";

vi.mock("next/image", () => ({ default: (p) => <img alt={p.alt} src={p.src} /> }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/app/[locale]/producer/[id]/components/ProducerActivities", () => ({ default: () => null }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal()),
  optimizeCloudinary: (u) => u,
}));
vi.mock("@phosphor-icons/react", () => {
  const Icon = () => <span />;
  return {
    Leaf: Icon, SealCheck: Icon, Truck: Icon, Package: Icon, Certificate: Icon, Carrot: Icon,
    GrainsSlash: Icon, Barn: Icon, Medal: Icon, HandHeart: Icon, DropSlash: Icon, Cube: Icon,
    Clock: Icon, Storefront: Icon, CaretLeft: Icon, MapPin: Icon, WhatsappLogo: Icon, X: Icon,
    Phone: Icon, Globe: Icon, EnvelopeSimple: Icon, InstagramLogo: Icon, FacebookLogo: Icon,
    Receipt: Icon, CalendarCheck: Icon, CaretDown: Icon, CaretUp: Icon,
  };
});
vi.mock("@/components/DeliveryBlock", () => ({ default: () => <div data-testid="delivery" /> }));
vi.mock("@/components/ReviewsSection", () => ({ default: () => <div data-testid="reviews" /> }));
vi.mock("@/components/DirectoryDisclaimer", () => ({ default: () => <div data-testid="disclaimer" /> }));
vi.mock("@/components/ReportButton", () => ({ default: () => <div data-testid="report" /> }));
vi.mock("@/components/OwnerSectionEditLink", () => ({ default: () => null }));
vi.mock("@/components/ProducerCard", () => ({ default: () => null }));
vi.mock("@/components/public/RecipeCard", () => ({ default: () => null }));
vi.mock("@/components/FadeInSection", () => ({
  default: ({ children, ...rest }) => <section {...rest}>{children}</section>,
  REVEAL_PRESET: {},
}));

import ProducerSections from "@/app/[locale]/producer/[id]/components/ProducerSections";

const HOURS = he.producer.detail.hours ?? {};
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const range = (open, close) => [{ open, close }];
const everyDay = (open, close) => Object.fromEntries(DAYS.map((d) => [d, range(open, close)]));
// Same seven days as a store-hours string. Every day open, so the collapsed
// OpeningHours row («היום · …») shows a range whatever day the suite runs on.
const EVERY_DAY_STORE = "Sun-Sat 07:00-14:00";
const PIN = { kind: "branch", is_primary: true, lat: 32, lng: 34, precision: "exact", id: 1 };

// The demo business (backend/scripts/seed_demo_business.py): Friday differs.
const SEED_ORDER_WINDOW = {
  ...Object.fromEntries(DAYS.slice(0, 5).map((d) => [d, range("07:00", "14:00")])),
  friday: [
    { open: "06:30", close: "10:00" },
    { open: "11:00", close: "13:00" },
  ],
};
const SEED_STORE = "א'-ה' 07:00-14:00, ו' 06:30-13:00";

function renderPage(extra) {
  const onError = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={onError}>
      <ProducerSections
        producer={{
          id: 7,
          name: "חוות",
          slug: "h",
          description: "תיאור",
          products: [],
          offers_delivery: false,
          delivery_areas: [],
          categories: [],
          ...extra,
        }}
        events={[]}
        similarProducers={[]}
        sectionRefs={{ current: {} }}
        reviewsContainerRef={{ current: null }}
        reviewsVisible={true}
      />
    </NextIntlClientProvider>,
  );
  return { onError, ...utils };
}

const sets = () => screen.queryAllByTestId("hours-set");
const labelOf = (set) => set.querySelector("h3")?.textContent;
const occurrences = (text, needle) => text.split(needle).length - 1;

describe("«שעות» — one fact, one place (MEH-2803 guard 11)", () => {
  it("identical order window + store hours → ONE set, and each time range is said once", () => {
    const { container } = renderPage({
      order_window: everyDay("07:00", "14:00"),
      opening_hours: EVERY_DAY_STORE,
      has_physical_location: true,
      locations: [PIN],
    });
    // Split so a red names the defect: the duplicate first, the structure second.
    expect(occurrences(container.textContent, "7:00–14:00"), "«7:00–14:00» on the page").toBe(1);
    expect(sets()).toHaveLength(1);
    expect(labelOf(sets()[0])).toBe(HOURS.label_both);
  });
});

describe("«שעות» states × disclosure (MEH-2803)", () => {
  it("orders-only, closed: one section, one «מקבלים הזמנות» set, no location section", () => {
    const { onError } = renderPage({
      order_window: Object.fromEntries(DAYS.slice(0, 5).map((d) => [d, range("09:00", "14:00")])),
    });
    expect(screen.getAllByRole("heading", { name: HOURS.heading })).toHaveLength(1);
    expect(sets().map(labelOf)).toEqual([HOURS.label_orders]);
    expect(screen.queryByTestId("order-window-week")).toBeNull();
    expect(document.querySelector("#section-location")).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("orders-only, open: the full week replaces the summary inside the same set", () => {
    renderPage({
      order_window: Object.fromEntries(DAYS.slice(0, 5).map((d) => [d, range("09:00", "14:00")])),
    });
    fireEvent.click(screen.getByTestId("order-window-week-toggle"));
    const set = sets()[0];
    expect(within(set).getByTestId("order-window-week")).toBeTruthy();
    expect(within(set).getAllByTestId("order-window-week-row")).toHaveLength(5);
    expect(within(set).queryAllByTestId("order-window-schedule-row")).toHaveLength(0);
  });

  it("store-only, closed: one «פתוח למבקרים» set with today's row; location keeps city + map, no hours card", () => {
    renderPage({
      opening_hours: EVERY_DAY_STORE,
      has_physical_location: true,
      city: "חיפה",
      locations: [PIN],
    });
    expect(sets().map(labelOf)).toEqual([HOURS.label_visit]);
    // Option ב׳ (07/11): the visit set shows its week at once, like the orders
    // set — not a collapsed «היום · …» row that on a closed day says only «סגור».
    const visitRows = within(sets()[0]).getAllByTestId("visit-hours-schedule-row");
    expect(visitRows).toHaveLength(1);
    expect(visitRows[0].textContent).toContain("7:00–14:00");
    expect(screen.queryByTestId("hours-toggle")).toBeNull();
    const location = document.querySelector("#section-location");
    expect(location).toBeTruthy();
    expect(within(location).getByTestId("minimap")).toBeTruthy();
    expect(within(location).getByText("חיפה")).toBeTruthy();
    expect(within(location).queryByTestId("hours-toggle")).toBeNull();
    expect(within(location).queryByTestId("location-no-hours")).toBeNull();
  });

  it("store-only, open: the weekly table opens inside the set", () => {
    renderPage({ opening_hours: EVERY_DAY_STORE });
    fireEvent.click(screen.getByTestId("visit-hours-week-toggle"));
    const set = sets()[0];
    expect(within(set).getAllByTestId("visit-hours-week-row")).toHaveLength(7);
    expect(within(set).queryAllByTestId("visit-hours-schedule-row")).toHaveLength(0);
  });

  it("store hours with no location: the «שעות» section renders and the location section does not", () => {
    renderPage({ opening_hours: EVERY_DAY_STORE, has_physical_location: false, locations: [] });
    expect(sets()).toHaveLength(1);
    expect(document.querySelector("#section-location")).toBeNull();
  });

  it("both-different (the demo seed, Friday differs), closed: two labelled sets, orders first", () => {
    const { onError } = renderPage({
      order_window: SEED_ORDER_WINDOW,
      opening_hours: SEED_STORE,
      has_physical_location: true,
      locations: [PIN],
    });
    expect(sets().map(labelOf)).toEqual([HOURS.label_orders, HOURS.label_visit]);
    // The Hebrew store string now parses (AC 7) and, option ב׳, both sets share
    // one structure: summary rows shown at once, the label as the card's header.
    const visitRows = within(sets()[1]).getAllByTestId("visit-hours-schedule-row");
    expect(visitRows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("7:00–14:00"),
      expect.stringContaining("6:30–13:00"),
    ]);
    expect(within(sets()[0]).getAllByTestId("order-window-schedule-row")).toHaveLength(2);
    expect(within(within(sets()[0]).getByTestId("order-window-schedule")).getByTestId("hours-set-label").textContent).toBe(HOURS.label_orders);
    expect(within(within(sets()[1]).getByTestId("visit-hours-schedule")).getByTestId("hours-set-label").textContent).toBe(HOURS.label_visit);
    expect(screen.queryByTestId("hours-raw")).toBeNull();
    expect(screen.queryByTestId("hours-toggle")).toBeNull();
    expect(screen.getAllByRole("heading", { name: HOURS.heading })).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("both-different, open: each disclosure opens inside its own set", () => {
    renderPage({ order_window: SEED_ORDER_WINDOW, opening_hours: SEED_STORE });
    fireEvent.click(screen.getByTestId("order-window-week-toggle"));
    fireEvent.click(screen.getByTestId("visit-hours-week-toggle"));
    const [orders, visit] = sets();
    expect(within(orders).getByTestId("order-window-week")).toBeTruthy();
    expect(within(visit).getByTestId("visit-hours-week")).toBeTruthy();
    // Friday's split order window vs the store's single Friday range, side by side.
    expect(within(orders).getByTestId("order-window-week").textContent).toContain("6:30–10:00");
    expect(within(visit).getByTestId("visit-hours-week").textContent).toContain("6:30–13:00");
  });

  it("an unparseable store string is never merged: both sets, the store set shows the text as typed", () => {
    renderPage({ order_window: everyDay("07:00", "14:00"), opening_hours: "בתיאום מראש" });
    expect(sets().map(labelOf)).toEqual([HOURS.label_orders, HOURS.label_visit]);
    expect(within(sets()[1]).getByTestId("hours-raw").textContent).toContain("בתיאום מראש");
  });

  it("both-identical, closed: one «הזמנות וביקור במקום» set rendered with the order-window card", () => {
    renderPage({ order_window: everyDay("07:00", "14:00"), opening_hours: EVERY_DAY_STORE });
    expect(sets()).toHaveLength(1);
    expect(labelOf(sets()[0])).toBe(HOURS.label_both);
    expect(within(sets()[0]).getByTestId("order-window-schedule")).toBeTruthy();
    expect(screen.queryByTestId("hours-toggle")).toBeNull();
  });

  it("identical weeks but an upcoming special date → NOT merged (an order override is not a visit fact)", () => {
    // Clock pinned so «upcoming» is deterministic: Sunday 01/11/2026 10:00 Israel.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-01T08:00:00Z") });
    try {
      renderPage({
        order_window: everyDay("07:00", "14:00"),
        opening_hours: EVERY_DAY_STORE,
        special_hours: { "2026-11-20": { ranges: [], note: "סגור להזמנות" } },
      });
      expect(sets().map(labelOf)).toEqual([HOURS.label_orders, HOURS.label_visit]);
      expect(within(sets()[0]).getByTestId("order-window-special")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("both-identical with merged days, open: the disclosure still works in the merged set", () => {
    const weekdays = Object.fromEntries(DAYS.slice(0, 5).map((d) => [d, range("09:00", "14:00")]));
    renderPage({ order_window: weekdays, opening_hours: "א׳–ה׳ 9:00–14:00" });
    expect(sets()).toHaveLength(1);
    fireEvent.click(screen.getByTestId("order-window-week-toggle"));
    expect(within(sets()[0]).getAllByTestId("order-window-week-row")).toHaveLength(5);
  });

  it("neither: no «שעות» heading and no set at all", () => {
    renderPage({ has_physical_location: true, locations: [PIN] });
    expect(screen.queryByRole("heading", { name: HOURS.heading ?? "שעות" })).toBeNull();
    expect(sets()).toHaveLength(0);
    // The location still renders, with its no-hours note.
    expect(screen.getByTestId("location-no-hours")).toBeTruthy();
  });

  it("the order-window subtitle that restated its heading is gone", () => {
    const { container } = renderPage({ order_window: everyDay("07:00", "14:00") });
    expect(container.textContent).not.toContain("הימים והשעות שבהם בית העסק מקבל הזמנות");
    expect(he.producer.detail.order_window.schedule_subtitle).toBeUndefined();
  });

  it("the four strings are the approved wording (COPY_BANK §14)", async () => {
    const en = (await import("@/messages/en.json")).default;
    expect(he.producer.detail.hours).toEqual({
      heading: "שעות",
      label_orders: "מקבלים הזמנות",
      label_visit: "פתוח למבקרים",
      label_both: "הזמנות וביקור במקום",
    });
    expect(en.producer.detail.hours).toEqual({
      heading: "Hours",
      label_orders: "Taking orders",
      label_visit: "Open to visitors",
      label_both: "Orders and visits",
    });
  });
});
