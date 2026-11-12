/**
 * MEH-2859 — the home «מה קורה אצל בתי העסק» strip: one row list over four
 * date-bound types (events, experiences, group buys, surprise baskets).
 *
 * What each test here would have caught, stated so a green is readable:
 *   - the strip asking its four endpoints on mount (MEH-2233: the home page's
 *     first paint spends no request on a section below the fold);
 *   - a section rendered around an empty list;
 *   - the ordering collapsing to "all events, then all experiences" — the
 *     round-robin is the feature, not the sort;
 *   - a group buy growing a countdown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, vars) => {
    const key = ns ? `${ns}.${k}` : k;
    const flat = {
      "home.whats_on.eyebrow": "קרוב לבית",
      "home.whats_on.heading": "מה קורה אצל בתי העסק",
      "home.whats_on.all": "לכל מה שקורה",
      "home.whats_on.type.event": "אירוע",
      "home.whats_on.type.experience": "חוויה",
      "home.whats_on.type.group_buy": "קבוצת רכישה",
      "home.whats_on.type.rescue": "סל הפתעה",
      // MEH-2962: the cards and the row headings reuse strings that already
      // exist under their own features.
      "events.detail.when_today": "היום",
      "events.detail.when_tomorrow": "מחר",
      "events.list.free": "כניסה חופשית",
      "events.categories.market": "שוק",
      "events.experience_categories.workshop": "סדנה",
      "group_buys.list.hero_title": "קבוצות רכישה",
      "group_buys.list.hero_subtitle": "קנו ביחד וחסכו — מוצרים מקומיים במחיר קבוצתי",
      "rescue.home.title": "מה נשאר היום",
      "rescue.home.lead": "סלים של מה שלא נמכר היום, במחיר מוזל. איסוף עצמי.",
      "rescue.home.all": "לכל הסלים",
      "producer.detail.sections.group_buys.show_all": "הצגת כל קבוצות הרכישה",
    };
    if (key === "home.whats_on.until") return `עד ${vars.date}`;
    return flat[key] ?? key;
  },
  useLocale: () => "he",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a data-intl-link="" href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

// MEH-2962: a card says «היום» / «מחר» for a date that close, so the strip now
// READS the Israel clock. Frozen here (testing.md, MEH-2290) at 01.08.2026:
// every fixture below is on or after it, and only the two cases that mean to
// be "today" / "tomorrow" sit on 01.08 / 02.08.
vi.mock("@/lib/israel-date", async (original) => ({
  ...(await original()),
  israelToday: () => "2026-08-01",
}));

// One response per endpoint, so a test says what each of the four answered.
// A path with no entry answers [] — the "this type has nothing" case.
const responses = { current: {} };
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));
// mockReset, not mockClear: one test below replaces the implementation with a
// rejection, and mockClear would leave that rejection in place for every test
// after it — which is exactly how this harness first read green-then-red.
function resetApi() {
  get.mockReset();
  get.mockImplementation((url) => Promise.resolve({ data: responses.current[url] ?? [] }));
}

let observers = [];
class FakeIO {
  constructor(cb, opts) {
    this.cb = cb;
    this.opts = opts;
    this.observed = [];
    this.disconnected = false;
    observers.push(this);
  }
  observe(el) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  fire(isIntersecting) { this.cb([{ isIntersecting, target: this.observed[0] }]); }
}

const EVENTS = "/events/upcoming";
const EXPERIENCES = "/experiences";
const GROUP_BUYS = "/group-buys";
const RESCUE = "/rescue/offers";

// Fixed dates, never derived from the clock. Since MEH-2962 a card DOES ask
// "is it today?" — against the frozen `israelToday` above, never the runner's
// clock, so there is still nothing to go wrong at 21:30 UTC
// (.claude/rules/testing.md, MEH-2290).
const event = (id, date, time = "18:30:00") => ({ id, title: `אירוע ${id}`, event_date: date, event_time: time });
const experience = (id, date) => ({ id, title: `חוויה ${id}`, event_date: date, event_time: "10:00:00" });
const groupBuy = (id, deadline) => ({ id, title: `רכישה ${id}`, deadline });
// 15:00Z in August is 18:00 in Israel (IDT, UTC+3) — the whole point of
// formatting a pickup window in Asia/Jerusalem and not the visitor's zone.
const basket = (id, date, pickupStart) => ({ id, date, pickup_start: pickupStart, producer: { name: "מחלבה" } });

/** Renders, then scrolls the strip into reach, which is what starts the fetches. */
async function renderNear(Component) {
  const out = render(<Component />);
  await act(async () => observers[0].fire(true));
  return out;
}

beforeEach(() => {
  observers = [];
  responses.current = {};
  resetApi();
  window.IntersectionObserver = FakeIO;
  vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
});
afterEach(() => {
  delete window.IntersectionObserver;
  vi.unstubAllEnvs();
});

describe("HomeWhatsOn — fetches only near the viewport (MEH-2233)", () => {
  it("first paint: no section, no request, one observer on its own sentinel", async () => {
    const { default: HomeWhatsOn, WHATS_ON_PRELOAD_MARGIN } = await import("@/components/HomeWhatsOn");
    render(<HomeWhatsOn />);
    expect(get, "zero requests before the strip is anywhere near the screen").not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-whats-on")).toBeNull();
    const sentinel = screen.getByTestId("home-whats-on-sentinel");
    expect(observers).toHaveLength(1);
    expect(observers[0].observed[0]).toBe(sentinel);
    expect(observers[0].opts.rootMargin).toBe(WHATS_ON_PRELOAD_MARGIN);
  });

  it("still out of reach: still no request", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    render(<HomeWhatsOn />);
    await act(async () => observers[0].fire(false));
    expect(get).not.toHaveBeenCalled();
  });

  it("near the viewport: asks all four public lists once, then stops observing", async () => {
    responses.current = { [EVENTS]: [event(1, "2026-08-15")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getByTestId("home-whats-on")).toBeTruthy());
    expect(get.mock.calls.map((c) => c[0]).sort()).toEqual([EVENTS, GROUP_BUYS, RESCUE, EXPERIENCES].sort());
    expect(get).toHaveBeenCalledTimes(4);
    expect(observers[0].disconnected).toBe(true);
  });

  it("no IntersectionObserver (old browser): fetches at once rather than never", async () => {
    delete window.IntersectionObserver;
    responses.current = { [EVENTS]: [event(1, "2026-08-15")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    render(<HomeWhatsOn />);
    await waitFor(() => expect(screen.getByTestId("home-whats-on")).toBeTruthy());
  });

  it("the pilot being off asks nothing of /rescue (lib/use-hub-nav-gate.js:81's rule)", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    responses.current = { [EVENTS]: [event(1, "2026-08-15")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getByTestId("home-whats-on")).toBeTruthy());
    expect(get.mock.calls.map((c) => c[0])).not.toContain(RESCUE);
  });
});

describe("HomeWhatsOn — nothing to show means no section at all", () => {
  it("all four lists empty: the section is absent, not an empty heading", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
    expect(screen.queryByTestId("home-whats-on")).toBeNull();
    expect(screen.queryByText("מה קורה אצל בתי העסק")).toBeNull();
    expect(screen.queryByText("לכל מה שקורה")).toBeNull();
  });

  it("every list failing is the same answer as every list being empty", async () => {
    get.mockImplementation(() => Promise.reject(new Error("network")));
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
    expect(screen.queryByTestId("home-whats-on")).toBeNull();
  });

  it("a body that is not a list contributes nothing (rule 19) instead of throwing", async () => {
    responses.current = { [EVENTS]: { oops: true }, [GROUP_BUYS]: [groupBuy(9, "2026-08-10T12:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getByTestId("home-whats-on")).toBeTruthy());
    const types = screen.getAllByTestId("whats-on-row").map((r) => r.getAttribute("data-type"));
    expect(types).toEqual(["groupBuy"]);
  });
});

describe("HomeWhatsOn — three rows, each only when it has something (MEH-2962)", () => {
  const groups = () => screen.getAllByTestId("whats-on-group").map((g) => g.getAttribute("data-group"));
  const typesIn = (id) =>
    [...screen.getByTestId("home-whats-on").querySelectorAll(`[data-group="${id}"] [data-testid="whats-on-row"]`)].map(
      (r) => r.getAttribute("data-type"),
    );

  it("events and experiences share the first row, one per type before a type repeats", async () => {
    // Events hold the two soonest dates. A plain date sort would put both of
    // them first; the round-robin spends the second card on the experience.
    responses.current = {
      [EVENTS]: [event(1, "2026-08-01"), event(2, "2026-08-02")],
      [EXPERIENCES]: [experience(3, "2026-08-20")],
      [GROUP_BUYS]: [groupBuy(4, "2026-08-10T12:00:00Z")],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(4));
    expect(groups()).toEqual(["go", "groupBuy"]);
    expect(typesIn("go")).toEqual(["event", "experience", "event"]);
    expect(typesIn("groupBuy")).toEqual(["groupBuy"]);
  });

  it("all four types in supply: three rows, in a fixed order whatever the dates", async () => {
    // The basket is the soonest and the event the latest — row order is by
    // KIND, not by date, so a reader finds each thing in the same place.
    responses.current = {
      [EVENTS]: [event(1, "2026-08-04")],
      [EXPERIENCES]: [experience(2, "2026-08-03")],
      [GROUP_BUYS]: [groupBuy(3, "2026-08-02T12:00:00Z")],
      [RESCUE]: [basket(4, "2026-08-01", "2026-08-01T15:00:00Z")],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(4));
    expect(groups()).toEqual(["go", "groupBuy", "rescue"]);
    expect(typesIn("go")).toEqual(["experience", "event"]);
  });

  it("a row with nothing in it is absent — heading, explanation and link included", async () => {
    responses.current = { [GROUP_BUYS]: [groupBuy(3, "2026-08-02T12:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect(groups()).toEqual(["groupBuy"]);
    // Control: the row that IS there says its heading, so the absences below
    // are not a page that rendered no headings at all.
    expect(screen.getByRole("heading", { name: "קבוצות רכישה" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "מה קורה אצל בתי העסק" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "מה נשאר היום" })).toBeNull();
    expect(screen.queryByText("סלים של מה שלא נמכר היום, במחיר מוזל. איסוף עצמי.")).toBeNull();
    expect(screen.queryByRole("link", { name: "לכל מה שקורה" })).toBeNull();
    expect(screen.queryByRole("link", { name: "לכל הסלים" })).toBeNull();
  });

  it("each row says its own heading, and the two unfamiliar ones explain themselves", async () => {
    responses.current = {
      [EVENTS]: [event(1, "2026-08-04")],
      [GROUP_BUYS]: [groupBuy(3, "2026-08-02T12:00:00Z")],
      [RESCUE]: [basket(4, "2026-08-01", "2026-08-01T15:00:00Z")],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    const group = (id) => screen.getByTestId("home-whats-on").querySelector(`[data-group="${id}"]`);
    // The rows are siblings: every heading is an h2, whichever renders first.
    expect(group("go").querySelector("h2").textContent).toBe("מה קורה אצל בתי העסק");
    expect(group("go").querySelector("p"), "events need no explanation").toBeNull();
    expect(group("groupBuy").querySelector("h2").textContent).toBe("קבוצות רכישה");
    expect(group("groupBuy").querySelector("p").textContent).toBe("קנו ביחד וחסכו — מוצרים מקומיים במחיר קבוצתי");
    expect(group("rescue").querySelector("h2").textContent).toBe("מה נשאר היום");
    expect(screen.getByTestId("home-whats-on").querySelector("h3"), "no row is nested under another").toBeNull();
    expect(group("rescue").querySelector("p").textContent).toBe("סלים של מה שלא נמכר היום, במחיר מוזל. איסוף עצמי.");
    // MEH-2962: the two unfamiliar rows carry a glyph, hidden from assistive
    // tech (the heading's name stays exactly the text above); the first row,
    // whose cards carry their own category glyphs, has none.
    const glyph = (id) => group(id).querySelector('[data-testid="whats-on-group-icon"]');
    expect(glyph("go"), "the events row has no heading glyph").toBeNull();
    expect(glyph("groupBuy").getAttribute("aria-hidden")).toBe("true");
    expect(glyph("rescue").getAttribute("aria-hidden")).toBe("true");
    expect(group("groupBuy").querySelector("h2").contains(glyph("groupBuy"))).toBe(true);
    // Three links, three names, three destinations.
    const link = (name) => screen.getByRole("link", { name }).getAttribute("href");
    expect(link("לכל מה שקורה")).toBe("/events");
    expect(link("הצגת כל קבוצות הרכישה")).toBe("/group-buys");
    expect(link("לכל הסלים")).toBe("/rescue");
    // DESIGN.md (MEH-2831): each one looks tappable with no hover — a
    // permanent underline (not `hover:underline`) and an arrow.
    for (const name of ["לכל מה שקורה", "הצגת כל קבוצות הרכישה", "לכל הסלים"]) {
      const classes = screen.getByRole("link", { name }).className.split(/\s+/);
      expect(classes, name).toContain("underline");
      expect(classes, name).not.toContain("hover:underline");
      expect(screen.getByRole("link", { name }).querySelector('svg[aria-hidden="true"]'), name).toBeTruthy();
    }
  });

  it("a row holds at most WHATS_ON_MAX_CARDS cards", async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      groupBuy(i + 1, `2026-08-${String(10 + i).padStart(2, "0")}T12:00:00Z`),
    );
    responses.current = { [GROUP_BUYS]: many };
    const { default: HomeWhatsOn, WHATS_ON_MAX_CARDS } = await import("@/components/HomeWhatsOn");
    expect(many.length, "control: the fixture holds more than the cap").toBeGreaterThan(WHATS_ON_MAX_CARDS);
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(WHATS_ON_MAX_CARDS));
    // Soonest first: the first card is the one closing on the 10th.
    expect(screen.getAllByTestId("whats-on-row")[0].textContent).toContain("רכישה 1");
  });

  it("one type with everything: it repeats, in its own date order", async () => {
    responses.current = { [EVENTS]: [event(1, "2026-08-09"), event(2, "2026-08-07"), event(3, "2026-08-08")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    expect(screen.getAllByTestId("whats-on-row").map((r) => r.textContent)).toEqual([
      expect.stringContaining("אירוע 2"),
      expect.stringContaining("אירוע 3"),
      expect.stringContaining("אירוע 1"),
    ]);
  });

  it("same type, same day: the earlier time leads", async () => {
    responses.current = { [EVENTS]: [event(1, "2026-08-05", "20:00:00"), event(2, "2026-08-05", "09:15:00")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(2));
    expect(screen.getAllByTestId("whats-on-row")[0].textContent).toContain("אירוע 2");
  });
});

describe("HomeWhatsOn — what one row says", () => {
  beforeEach(() => {
    responses.current = {
      [EVENTS]: [event(1, "2026-08-15", "18:30:00")],
      [EXPERIENCES]: [experience(2, "2026-08-20")],
      [GROUP_BUYS]: [groupBuy(3, "2026-08-10T12:00:00Z")],
    };
  });

  it("label, title, when, and a link to the item's own page", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    const { container } = await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    // No category on these fixtures ⇒ the label falls back to the type. A group
    // buy carries no label of its own: its row's heading already says it.
    expect(screen.getAllByTestId("whats-on-label").map((l) => l.textContent)).toEqual(["אירוע", "חוויה"]);
    expect(screen.getByText("אירוע 1")).toBeInTheDocument();
    // Every link is next-intl's, so /en keeps its prefix (MEH-2497).
    const hrefs = [...container.querySelectorAll("a")].map((a) => [
      a.getAttribute("href"),
      a.hasAttribute("data-intl-link"),
    ]);
    // Row by row: the event (15.08) before the experience (20.08), their link,
    // then the group buy and its link.
    expect(hrefs).toEqual([
      ["/events/1", true],
      ["/experiences/2", true],
      ["/events", true],
      ["/group-buys/3", true],
      ["/group-buys", true],
    ]);
  });

  it("an event and an experience show weekday + time; a group buy shows «עד» + a date", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    const when = (type) =>
      screen.getByTestId("home-whats-on").querySelector(`[data-type="${type}"] [data-testid="whats-on-when"]`)
        .textContent;
    // 15.08.2026 is a Saturday, 20.08.2026 a Thursday. The day of the month is
    // on the card's date tile, so the line does not repeat it.
    expect(when("event")).toBe("יום שבת · 18:30");
    expect(when("experience")).toBe("יום חמישי · 10:00");
    expect(when("groupBuy")).toBe("עד 10.08");
    const tile = (type) =>
      screen.getByTestId("home-whats-on").querySelector(`[data-type="${type}"] [data-testid="whats-on-date-tile"]`);
    expect(tile("event").textContent).toMatch(/15$/);
    expect(tile("groupBuy"), "a closing date is not an occasion — no tile").toBeNull();
  });

  it("«היום» and «מחר» replace the weekday when the date is that close", async () => {
    // Against the frozen israelToday (01.08.2026), not the runner's clock.
    responses.current = {
      [EVENTS]: [
        event(1, "2026-08-01", "18:30:00"),
        event(2, "2026-08-02", "09:00:00"),
        event(3, "2026-08-03", "09:00:00"),
      ],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    expect(screen.getAllByTestId("whats-on-when").map((w) => w.textContent)).toEqual([
      "היום · 18:30",
      "מחר · 09:00",
      "יום שני · 09:00",
    ]);
  });

  it("the label is the category a visitor knows; «אחר» falls back to the type", async () => {
    responses.current = {
      [EVENTS]: [
        { ...event(1, "2026-08-05"), category: "שוק" },
        { ...event(2, "2026-08-06"), category: "אחר" },
      ],
      [EXPERIENCES]: [{ ...experience(3, "2026-08-07"), category: "סדנה" }],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    const label = (title) =>
      screen.getByText(title).closest('[data-testid="whats-on-row"]').querySelector('[data-testid="whats-on-label"]')
        .textContent;
    expect(label("אירוע 1")).toBe("שוק");
    expect(label("אירוע 2")).toBe("אירוע");
    expect(label("חוויה 3")).toBe("סדנה");
  });

  it("price: a number when there is one, «כניסה חופשית» for a free event, nothing for a priceless group buy", async () => {
    responses.current = {
      [EVENTS]: [
        { ...event(1, "2026-08-05"), price: 90 },
        { ...event(2, "2026-08-06"), price: 0 },
      ],
      [EXPERIENCES]: [{ ...experience(3, "2026-08-07"), price_per_person: "180.00" }],
      [GROUP_BUYS]: [
        {
          ...groupBuy(4, "2026-08-10T12:00:00Z"),
          price_per_unit_group: "38.00",
          price_per_unit_regular: "48.00",
        },
        groupBuy(5, "2026-08-11T12:00:00Z"),
      ],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(5));
    const price = (title) =>
      screen.getByText(title).closest('[data-testid="whats-on-row"]').querySelector('[data-testid="whats-on-price"]');
    expect(price("אירוע 1").textContent).toBe("90₪");
    expect(price("אירוע 2").textContent).toBe("כניסה חופשית");
    expect(price("חוויה 3").textContent).toBe("180₪");
    // The group price, with the regular one struck through before it.
    expect(price("רכישה 4").textContent).toBe("48₪38₪");
    expect(price("רכישה 4").querySelector(".line-through").textContent).toBe("48₪");
    expect(price("רכישה 5"), "no price on record ⇒ no price shown, and never «free»").toBeNull();
  });

  it("agorot are kept, and a regular price that is not higher is not struck (MEH-2962 review)", async () => {
    responses.current = {
      [GROUP_BUYS]: [
        { ...groupBuy(1, "2026-08-10T12:00:00Z"), price_per_unit_group: "37.50", price_per_unit_regular: "38.40" },
        { ...groupBuy(2, "2026-08-11T12:00:00Z"), price_per_unit_group: "40.00", price_per_unit_regular: "40.00" },
      ],
      [RESCUE]: [{ ...basket(3, "2026-08-01", "2026-08-01T15:00:00Z"), price_agorot: 2550 }],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    const price = (type, at) =>
      screen.getAllByTestId("whats-on-row").filter((row) => row.dataset.type === type)[at].querySelector('[data-testid="whats-on-price"]');
    // 37.50 is not «38₪», and 38.40 beside it is not a second «38₪».
    expect(price("groupBuy", 0).textContent).toBe("38.4₪37.5₪");
    expect(price("groupBuy", 1).textContent).toBe("40₪");
    expect(price("groupBuy", 1).querySelector(".line-through")).toBeNull();
    expect(price("rescue", 0).textContent).toBe("25.5₪");
  });

  it("a basket with no photo shows the business once: the seed alone on the plate", async () => {
    responses.current = { [RESCUE]: [basket(4, "2026-08-01", "2026-08-01T15:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    const plate = screen.getByTestId("whats-on-plate");
    expect(plate.textContent).toBe("");
    expect(plate.querySelector("svg")).toBeTruthy();
    expect(screen.getAllByText("מחלבה")).toHaveLength(1);
  });

  it("a dated card says its date in words a screen reader gets, not only on the tile", async () => {
    responses.current = { [EVENTS]: [event(1, "2026-08-04")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    const spoken = screen.getByTestId("whats-on-date-spoken");
    expect(spoken.textContent).toBe("04.08");
    expect(spoken.closest('[aria-hidden="true"]'), "said, so not inside the hidden picture").toBeNull();
    // The tile that shows the same day is inside the hidden picture.
    expect(screen.getByTestId("whats-on-date-tile").closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("a picture when there is one; otherwise the business's name on the plate, never an empty frame", async () => {
    responses.current = {
      [EVENTS]: [
        {
          ...event(1, "2026-08-05"),
          image_url: "https://res.cloudinary.com/x/image/upload/a.jpg",
        },
        {
          ...event(2, "2026-08-06"),
          owner_image_url: "https://res.cloudinary.com/x/image/upload/b.jpg",
        },
        { ...event(3, "2026-08-07"), producer_name: "משק ברק" },
        event(4, "2026-08-08"),
      ],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(4));
    const card = (title) => screen.getByText(title).closest('[data-testid="whats-on-row"]');
    const image = (title) => card(title).querySelector('[data-testid="whats-on-image"]');
    const plate = (title) => card(title).querySelector('[data-testid="whats-on-plate"]');
    expect(image("אירוע 1").style.backgroundImage).toContain("a.jpg");
    expect(image("אירוע 2").style.backgroundImage, "the owner's photo stands in").toContain("b.jpg");
    expect(image("אירוע 3")).toBeNull();
    expect(plate("אירוע 3").textContent).toBe("משק ברק");
    // No picture and no business to name: the seed alone, not the title twice.
    expect(plate("אירוע 4").textContent).toBe("");
    expect(plate("אירוע 4").querySelector("svg")).toBeTruthy();
  });

  // Review #3726 / the MEH-2859 reviewer: `GroupBuy.deadline` is a NAIVE
  // datetime — models.py:2352 `Column(DateTime)` with no UTC validator on
  // GroupBuyOut — so the API sends "2026-08-10T22:30:00" with NO `Z`, and a
  // bare `new Date()` reads it in the VISITOR's zone.
  //
  // The runner's TZ is pinned to Asia/Jerusalem for these two, deliberately:
  // CI runs in UTC, where local == UTC and the bug is INVISIBLE. A test that
  // only ever sees a `Z`-suffixed deadline (as every other case in this file
  // does) is green under both the broken and the fixed code — exactly the
  // "green with two possible causes" testing.md rules out.
  describe("a naive deadline is read as UTC, not as the visitor's clock", () => {
    /**
     * `GroupBuy.deadline` is a NAIVE datetime — models.py:2352
     * `Column(DateTime)` with no UTC validator on GroupBuyOut — so the API
     * sends "2026-08-10T22:30:00" with NO `Z`, and a bare `new Date()` reads it
     * in the VISITOR's zone. For an Israeli reader that renders a cut-off
     * between midnight and 03:00 as the PREVIOUS day.
     *
     * WHY THERE IS NO RENDERED-OUTPUT TEST FOR THE WRONG DAY, stated instead of
     * quietly shipping a green that proves nothing. CI runs in UTC, where
     * local == UTC and the broken parse and the correct one AGREE — so a
     * component-level assertion is green under both and discriminates nothing
     * (.claude/rules/testing.md: "a green that has two possible causes").
     * Pinning the zone does not help either: `process.env.TZ` is not honoured
     * inside vitest's worker — measured, the control below came back UTC.
     *
     * Out-of-band measurement, plain node, same Intl path the component uses,
     * deadline "2026-08-10T22:30:00" whose true Israel date is 11.08:
     *     TZ=Asia/Jerusalem -> 10.08   (wrong day — what shipped first)
     *     TZ=UTC            -> 11.08
     *     TZ=America/LA     -> 11.08
     *
     * So the two guards below are what CI can actually falsify: the parse is
     * pinned at its call site, and the two wire shapes are pinned to agree.
     */
    it("the deadline goes through parseNaiveUtc, not a bare new Date()", () => {
      const src = fs.readFileSync(path.resolve(__dirname, "../components/HomeWhatsOn.jsx"), "utf8");
      expect(src).toMatch(/import \{ parseNaiveUtc \} from "@\/lib\/dates"/);
      expect(src, "the group buy's deadline is parsed as naive UTC").toMatch(
        /at: parseNaiveUtc\(row\.deadline\)/,
      );
      // Control: the thing this would have to become to regress.
      expect(src, "no API date string is handed to a bare new Date()").not.toMatch(/new Date\(row\./);
    });

    it("the naive form and the same instant written with Z render identically", async () => {
      const renderOne = async (deadline) => {
        resetApi();
        observers = [];
        responses.current = { [GROUP_BUYS]: [{ id: 12, title: "שמן זית", deadline }] };
        const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
        const view = await renderNear(HomeWhatsOn);
        await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
        const text = screen.getByTestId("whats-on-when").textContent;
        view.unmount();
        return text;
      };
      const naive = await renderOne("2026-08-10T22:30:00");
      const zulu = await renderOne("2026-08-10T22:30:00Z");
      expect(naive, "the wire shape must not change which day is shown").toBe(zulu);
      expect(naive).toBe("עד 11.08");
    });
  });

  it("an event with no time shows its day alone", async () => {
    responses.current = { [EVENTS]: [{ id: 7, title: "יום פתוח", event_date: "2026-08-15", event_time: null }] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    // No time ⇒ the weekday alone; the date itself is on the tile.
    expect(screen.getByTestId("whats-on-when").textContent).toBe("יום שבת");
    expect(screen.getByTestId("whats-on-date-tile").textContent).toMatch(/15$/);
  });

  it("an EXPERIENCE with no time shows its day alone too", async () => {
    // The date fallback was covered for events only; an experience reaches it
    // through the same branch but by a different source record, and nothing
    // asserted that until the MEH-2859 reviewer pointed at the gap.
    responses.current = {
      [EXPERIENCES]: [{ id: 8, title: "קטיף זיתים", event_date: "2026-08-22", event_time: null }],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect(screen.getByTestId("whats-on-row").getAttribute("data-type")).toBe("experience");
    expect(screen.getByTestId("whats-on-when").textContent).toBe("יום שבת");
    expect(screen.getByTestId("whats-on-date-tile").textContent).toMatch(/22$/);
  });

  it("a row whose date is unusable is dropped, not rendered with a hole", async () => {
    responses.current = {
      [EVENTS]: [
        { id: 9, title: "תאריך שבור", event_date: "not-a-date", event_time: "10:00:00" },
        { id: 10, title: "תאריך תקין", event_date: "2026-08-15", event_time: "10:00:00" },
      ],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect(screen.getByText("תאריך תקין")).toBeInTheDocument();
    expect(screen.queryByText("תאריך שבור")).toBeNull();
  });

  it("a basket shows its pickup time in Israel's zone, not the visitor's", async () => {
    responses.current = { [RESCUE]: [basket(5, "2026-08-01", "2026-08-01T15:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    // 15:00Z + IDT(+3). A visitor-zone read would print 15:00 on a UTC runner.
    // «היום»: the basket is dated the frozen israelToday.
    expect(screen.getByTestId("whats-on-when").textContent).toBe("היום · 18:00");
    expect(screen.getByTestId("whats-on-row").getAttribute("data-type")).toBe("rescue");
  });

  it("a basket with a pickup window shows both ends of it, in Israel's zone", async () => {
    responses.current = {
      [RESCUE]: [
        {
          ...basket(5, "2026-08-03", "2026-08-03T15:00:00Z"),
          pickup_end: "2026-08-03T16:30:00Z",
        },
      ],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect(screen.getByTestId("whats-on-when").textContent).toBe("03.08 · 18:00–19:30");
  });

  it("a basket links to /rescue — the pilot has no per-bag page", async () => {
    responses.current = { [RESCUE]: [basket(5, "2026-08-01", "2026-08-01T15:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    const { container } = await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/rescue", "/rescue"]);
  });

  it("no countdown and no urgency copy anywhere in the strip", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    const { container } = await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    expect(container.textContent).not.toMatch(/נסגר בעוד|נותרו|ממש עוד מעט|מהרו/);
  });

  it("«לכל מה שקורה» goes to the hub", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    const all = await screen.findByRole("link", { name: "לכל מה שקורה" });
    expect(all.getAttribute("href")).toBe("/events");
  });

  it("carries the eyebrow + 32×1px gold rule + heading of the «קטגוריות» section", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getByTestId("home-whats-on")).toBeTruthy());
    expect(screen.getByText("קרוב לבית")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "מה קורה אצל בתי העסק" })).toBeTruthy();
    // Read the token off the «קטגוריות» grid rather than restating it, so a
    // change there reds here instead of the two drifting apart.
    const read = (f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
    const rule = /<span className="inline-block (w-8 h-px bg-accent)" aria-hidden="true" \/>/;
    const grid = read("app/[locale]/home/HomeCategoryGrid.jsx").match(rule);
    expect(grid, "control: the categories grid still has the gold rule").toBeTruthy();
    expect(read("components/HomeWhatsOn.jsx")).toContain(grid[1]);
  });
});

describe("HomeWhatsOn — it is what the home page renders, in the old strip's place", () => {
  it("HomeClient renders it after the businesses grid, and the events-only preview is gone", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../app/[locale]/home/HomeClient.jsx"), "utf8");
    expect(src).toMatch(/<HomeWhatsOn \/>/);
    expect(src, "the events-only preview left with MEH-2859").not.toMatch(/UpcomingEventsPreview/);
    // The control, without which this assertion cannot fail: a renamed grid
    // makes indexOf return -1 and then ANY position of the strip passes —
    // including above the grid, the one thing the AC pins.
    expect(src.indexOf("<HomeProducersGrid"), "control: the businesses grid is still named this").toBeGreaterThanOrEqual(0);
    expect(src.indexOf("<HomeWhatsOn />")).toBeGreaterThan(src.indexOf("<HomeProducersGrid"));
  });

  it("the replaced component no longer exists in the tree", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../app/[locale]/home/UpcomingEventsPreview.jsx"))).toBe(false);
  });
});
