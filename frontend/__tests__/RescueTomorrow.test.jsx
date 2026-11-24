/**
 * MEH-3702 — a rescue bag for tomorrow, on every screen that shows one.
 *
 * Copy approved word for word by Sapir in the thread, 24/11/2026; the
 * assertions read it from the real messages/he.json (renderHe), so a test
 * stays true to what ships.
 *
 * The day is decided by `bagDay(date)` against the Israel clock. Each test
 * builds its dates from `israelToday()` itself, so it holds at any hour.
 *
 * Shown red against a broken build (PR body):
 *   - bagDay always "today"            -> every «מחר» case below
 *   - the home block's filter removed  -> "the home block shows today's bags only"
 *   - tomorrow counted at the counter  -> "the counters and the code box are today's"
 *   - the deadline without its day     -> "says «מחר ב-» when the deadline…"
 *   - no useIsraelToday in the screen  -> "«איסוף מחר» turns into today's window…" (MEH-3805)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";

import { renderHe as render } from "./helpers/render-with-he";
import he from "../messages/he.json";
import { israelToday } from "@/lib/israel-date";

const fetchOffers = vi.fn();
const fetchMyOrders = vi.fn();
const get = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: vi.fn(), put: vi.fn() },
}));
vi.mock("@/lib/rescue", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rescueBagsEnabled: () => true,
    fetchOffers: (...a) => fetchOffers(...a),
    fetchMyOrders: (...a) => fetchMyOrders(...a),
  };
});
vi.mock("@/components/CitySearch", () => ({ default: () => null }));

const { bagDay } = await import("@/lib/rescue");
const { default: RescueList } = await import("@/components/rescue/RescueList");
const { default: RescueHomeModule } = await import("@/components/rescue/RescueHomeModule");
const { default: RescueConfirmation } = await import("@/components/rescue/RescueConfirmation");
const { default: RescueTab } = await import("@/components/dashboard/RescueTab");

const HOUR = 3_600_000;
const TODAY = israelToday();
const TOMORROW = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 24 * HOUR).toISOString().slice(0, 10);
const LATER = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 48 * HOUR).toISOString().slice(0, 10);
const r = he.rescue;

function offer(over = {}) {
  const now = Date.now();
  return {
    id: "o1",
    date: TODAY,
    status: "active",
    qty_left: 2,
    qty_total: 4,
    price_agorot: 1500,
    value_min_agorot: null,
    pickup_start: new Date(now + HOUR).toISOString(),
    pickup_end: new Date(now + 2 * HOUR).toISOString(),
    cancel_until: new Date(now + HOUR / 2).toISOString(),
    producer: { id: "p1", name: "מאפיית ההצלה", city: "חיפה", location_city: "חיפה" },
    typical_items: [],
    distance_km: null,
    ...over,
  };
}

function order(over = {}) {
  const now = Date.now();
  return {
    id: "ord1",
    offer_id: "o1",
    date: TODAY,
    qty: 1,
    pickup_code: "0431",
    status: "reserved",
    handed_at: null,
    price_agorot: 1500,
    pickup_start: new Date(now + HOUR).toISOString(),
    pickup_end: new Date(now + 2 * HOUR).toISOString(),
    cancel_until: new Date(now + HOUR / 2).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyOrders.mockResolvedValue([]);
});

describe("bagDay", () => {
  it("is tomorrow only for the next Israel day", () => {
    expect(bagDay(TOMORROW)).toBe("tomorrow");
    expect(bagDay(TODAY)).toBe("today");
    // Anything else reads as today, so an older API row never gains «מחר».
    expect(bagDay(LATER)).toBe("today");
    expect(bagDay(undefined)).toBe("today");
  });

  it("crosses a month end", () => {
    expect(bagDay("2026-12-01", "2026-11-30")).toBe("tomorrow");
  });
});

describe("the /rescue list", () => {
  it("only today's bags: no day headings, the list looks as it did", async () => {
    fetchOffers.mockResolvedValue([offer({ id: "a" }), offer({ id: "b" })]);
    render(<RescueList />);
    expect(await screen.findAllByTestId("rescue-bag-row")).toHaveLength(2);
    expect(screen.queryByTestId("rescue-list-day")).toBeNull();
  });

  it("today's and tomorrow's: «היום» first, then «מחר», each with its own rows", async () => {
    fetchOffers.mockResolvedValue([
      offer({ id: "t1", date: TOMORROW }),
      offer({ id: "a" }),
      offer({ id: "t2", date: TOMORROW }),
    ]);
    render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    const days = screen.getAllByTestId("rescue-list-day").map((el) => el.textContent);
    expect(days).toEqual([he.events.list.when_today, he.events.list.when_tomorrow]);
    const tomorrow = screen.getByTestId("rescue-list-group-tomorrow");
    expect(within(tomorrow).getAllByTestId("rescue-bag-row")).toHaveLength(2);
    expect(within(screen.getByTestId("rescue-list-group-today")).getAllByTestId("rescue-bag-row")).toHaveLength(1);
  });

  it("only tomorrow's: the «מחר» heading alone", async () => {
    fetchOffers.mockResolvedValue([offer({ id: "t1", date: TOMORROW })]);
    render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    expect(screen.getAllByTestId("rescue-list-day").map((el) => el.textContent)).toEqual([he.events.list.when_tomorrow]);
  });
});

describe("the home block", () => {
  it("shows today's bags only — its title says «היום»", async () => {
    fetchOffers.mockResolvedValue([offer({ id: "a" }), offer({ id: "t1", date: TOMORROW })]);
    render(<RescueHomeModule city="חיפה" />);
    await screen.findByTestId("rescue-home-module");
    expect(screen.getAllByTestId("rescue-bag-row")).toHaveLength(1);
  });

  it("is hidden when every bag is tomorrow's", async () => {
    fetchOffers.mockResolvedValue([offer({ id: "t1", date: TOMORROW })]);
    const { container } = render(<RescueHomeModule city="חיפה" />);
    await waitFor(() => expect(fetchOffers).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="rescue-home-module"]')).toBeNull();
  });
});

describe("the confirmation", () => {
  it("says «איסוף מחר» for tomorrow's bag and the bare window for today's", () => {
    const { rerender } = render(<RescueConfirmation order={order({ date: TOMORROW })} onCancel={() => {}} />);
    expect(screen.getByTestId("rescue-confirmation-window").textContent.startsWith("איסוף מחר ")).toBe(true);
    rerender(<RescueConfirmation order={order()} onCancel={() => {}} />);
    expect(screen.getByTestId("rescue-confirmation-window").textContent.startsWith("איסוף מחר")).toBe(false);
  });
});

describe("a page left open across midnight (MEH-3805)", () => {
  it("«איסוף מחר» turns into today's window when the Israel day changes, with no reload", () => {
    // 23:59 in Israel (winter, UTC+2) on 10/12; the bag is for 11/12.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      vi.setSystemTime(new Date("2026-12-10T21:59:00Z"));
      render(<RescueConfirmation order={order({ date: "2026-12-11" })} onCancel={() => {}} />);
      const line = () => screen.getByTestId("rescue-confirmation-window").textContent;
      expect(line().startsWith("איסוף מחר ")).toBe(true);
      act(() => {
        vi.advanceTimersByTime(2 * 60_000); // 00:01 on 11/12
      });
      expect(line().startsWith("איסוף מחר")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the /rescue list moves a bag from «מחר» to «היום» when the Israel day changes", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      vi.setSystemTime(new Date("2026-12-10T21:59:00Z"));
      fetchOffers.mockResolvedValue([offer({ id: "t1", date: "2026-12-11" })]);
      render(<RescueList />);
      await screen.findAllByTestId("rescue-bag-row");
      expect(screen.getByTestId("rescue-list-group-tomorrow")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(2 * 60_000); // 00:01 on 11/12
      });
      expect(screen.queryByTestId("rescue-list-group-tomorrow")).toBeNull();
      expect(screen.getAllByTestId("rescue-bag-row")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the free-cancel deadline", () => {
  it("says «מחר ב-» when the deadline is on the next Israel day, the bare time when today", () => {
    const at = (day) => `${day}T09:00:00Z`; // 11:00/12:00 in Israel, same date
    const { rerender } = render(
      <RescueConfirmation order={order({ date: TOMORROW, cancel_until: at(TOMORROW) })} onCancel={() => {}} />,
    );
    const tomorrowText = r.row.cancel_at_tomorrow.replace("{time}", "");
    expect(document.body.textContent).toContain(tomorrowText);
    rerender(<RescueConfirmation order={order()} onCancel={() => {}} />);
    expect(document.body.textContent).not.toContain(tomorrowText);
  });
});

describe("the business dashboard", () => {
  function mockDashboard({ orders = [], offers = [] }) {
    get.mockImplementation((url) => {
      if (url === "/producers/me/rescue/orders") return Promise.resolve({ data: orders });
      if (url === "/producers/me/rescue/offers") return Promise.resolve({ data: offers });
      if (url === "/producers/me/locations") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
  }

  it("the counters and the code box are today's; tomorrow's orders get their own list", async () => {
    mockDashboard({
      orders: [order({ id: "a" }), order({ id: "t", date: TOMORROW, offer_id: "o2", pickup_code: "9999" })],
      offers: [offer(), offer({ id: "o2", date: TOMORROW })],
    });
    render(<RescueTab />);
    const tomorrow = await screen.findByTestId("rescue-orders-tomorrow");
    expect(within(tomorrow).getByText(r.dashboard.orders_title_tomorrow)).toBeTruthy();
    expect(within(tomorrow).getByTestId("rescue-order-code").textContent).toBe("9999");
    // Handed over on its own day: no buttons on tomorrow's row.
    expect(within(tomorrow).queryByTestId("rescue-order-hand")).toBeNull();
    expect(screen.getByTestId("rescue-counter-reserved").textContent).toBe("1");
    expect(screen.getAllByTestId("rescue-order-hand")).toHaveLength(1);
  });

  it("a bag for tomorrow with no orders yet says so", async () => {
    mockDashboard({ offers: [offer({ id: "o2", date: TOMORROW })] });
    render(<RescueTab />);
    expect((await screen.findByTestId("rescue-orders-tomorrow-empty")).textContent).toBe(r.dashboard.orders_empty_tomorrow);
    expect(screen.getByTestId("rescue-offers-tomorrow-title").textContent).toBe(r.dashboard.offers_title_tomorrow);
  });

  it("no bag for tomorrow: no tomorrow section at all", async () => {
    mockDashboard({ orders: [order()], offers: [offer()] });
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    expect(screen.queryByTestId("rescue-orders-tomorrow")).toBeNull();
    expect(screen.queryByTestId("rescue-offers-tomorrow-title")).toBeNull();
  });
});
