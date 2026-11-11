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

// Fixed dates, never derived from the clock, and nothing here is COMPARED with
// the clock either — the display rule is per type (a basket shows its pickup
// time, a group buy its closing date), so there is no "is it today?" read to
// go wrong at 21:30 UTC (.claude/rules/testing.md, MEH-2290).
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

describe("HomeWhatsOn — row order: one per type before a type repeats", () => {
  it("three types in date order, and the second event never beats a first-of-type", async () => {
    // Events hold the two soonest dates. A plain date sort would show both of
    // them; the round-robin must spend row 2 and row 3 on the other types.
    responses.current = {
      [EVENTS]: [event(1, "2026-08-01"), event(2, "2026-08-02")],
      [EXPERIENCES]: [experience(3, "2026-08-20")],
      [GROUP_BUYS]: [groupBuy(4, "2026-08-10T12:00:00Z")],
    };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    const rows = screen.getAllByTestId("whats-on-row");
    expect(rows.map((r) => r.getAttribute("data-type"))).toEqual(["event", "groupBuy", "experience"]);
    expect(screen.queryByText("אירוע 2"), "the second event waits for a second pass").toBeNull();
  });

  it("caps at three rows even with four types in supply", async () => {
    responses.current = {
      [EVENTS]: [event(1, "2026-08-04")],
      [EXPERIENCES]: [experience(2, "2026-08-03")],
      [GROUP_BUYS]: [groupBuy(3, "2026-08-02T12:00:00Z")],
      [RESCUE]: [basket(4, "2026-08-01", "2026-08-01T15:00:00Z")],
    };
    const { default: HomeWhatsOn, WHATS_ON_MAX_ROWS } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(WHATS_ON_MAX_ROWS));
    expect(screen.getAllByTestId("whats-on-row").map((r) => r.getAttribute("data-type"))).toEqual([
      "rescue",
      "groupBuy",
      "experience",
    ]);
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

  it("type label, title, when, and a link to the item's own page", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    const { container } = await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    expect(screen.getByText("אירוע")).toBeInTheDocument();
    expect(screen.getByText("קבוצת רכישה")).toBeInTheDocument();
    expect(screen.getByText("חוויה")).toBeInTheDocument();
    expect(screen.getByText("אירוע 1")).toBeInTheDocument();
    // Every link is next-intl's, so /en keeps its prefix (MEH-2497).
    const hrefs = [...container.querySelectorAll("a")].map((a) => [
      a.getAttribute("href"),
      a.hasAttribute("data-intl-link"),
    ]);
    // Date order across the three types: the group buy closes 10.08, the event
    // is 15.08, the experience 20.08 — and «לכל מה שקורה» sits after the rows.
    expect(hrefs).toEqual([
      ["/group-buys/3", true],
      ["/events/1", true],
      ["/experiences/2", true],
      ["/events", true],
    ]);
  });

  it("an event shows its start time; an experience and a group buy show a date", async () => {
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(3));
    const when = (type) =>
      screen.getByTestId("home-whats-on").querySelector(`[data-type="${type}"] [data-testid="whats-on-when"]`)
        .textContent;
    expect(when("event")).toBe("18:30");
    expect(when("experience")).toBe("10:00");
    expect(when("groupBuy")).toBe("עד 10.08");
  });

  it("an event with no time falls back to its date", async () => {
    responses.current = { [EVENTS]: [{ id: 7, title: "יום פתוח", event_date: "2026-08-15", event_time: null }] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect(screen.getByTestId("whats-on-when").textContent).toBe("15.08");
  });

  it("a basket shows its pickup time in Israel's zone, not the visitor's", async () => {
    responses.current = { [RESCUE]: [basket(5, "2026-08-01", "2026-08-01T15:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    // 15:00Z + IDT(+3). A visitor-zone read would print 15:00 on a UTC runner.
    expect(screen.getByTestId("whats-on-when").textContent).toBe("18:00");
    expect(screen.getByTestId("whats-on-row").getAttribute("data-type")).toBe("rescue");
  });

  it("a basket links to /rescue — the pilot has no per-bag page", async () => {
    responses.current = { [RESCUE]: [basket(5, "2026-08-01", "2026-08-01T15:00:00Z")] };
    const { default: HomeWhatsOn } = await import("@/components/HomeWhatsOn");
    const { container } = await renderNear(HomeWhatsOn);
    await waitFor(() => expect(screen.getAllByTestId("whats-on-row")).toHaveLength(1));
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/rescue", "/events"]);
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
    expect(src.indexOf("<HomeWhatsOn />")).toBeGreaterThan(src.indexOf("<HomeProducersGrid"));
  });

  it("the replaced component no longer exists in the tree", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../app/[locale]/home/UpcomingEventsPreview.jsx"))).toBe(false);
  });
});
