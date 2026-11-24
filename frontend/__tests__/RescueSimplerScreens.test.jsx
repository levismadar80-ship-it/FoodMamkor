/**
 * MEH-3823 — simpler rescue screens for a new business (the Too Good To Go
 * study, Sapir 24/11).
 *
 * Rendered with the real next-intl provider and the real he.json, so ICU
 * plurals («סל אחד» / «4 סלים») are what ships, not a stub's output.
 *
 * Cells (rule «state × count»): allergen chips 0 / 1 / many marked × the
 * disclosure closed / open; cancellable bags 0 / 1 / many; the publish card's
 * place with 0 bags out vs some out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: (...a) => put(...a) },
}));

const { default: RescueTab } = await import("@/components/dashboard/RescueTab");
const { default: TimeOfDaySelect } = await import("@/components/ui/TimeOfDaySelect");
const { default: BagRow } = await import("@/components/rescue/BagRow");
const { default: AllergenSection } = await import("@/components/offer-detail/AllergenSection");

const HOUR = 3_600_000;
const D = he.rescue.dashboard;
const LOCS = [{ id: "loc1", location_precision: "exact", is_primary: true }];

function wrap(ui) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      {ui}
    </NextIntlClientProvider>,
  );
}

function liveBag(over = {}) {
  return {
    id: "of1",
    date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()),
    qty_total: 4,
    qty_left: 4,
    status: "active",
    leftover: 0,
    qty_donated: 0,
    pickup_start: new Date(Date.now() + HOUR).toISOString(),
    pickup_end: new Date(Date.now() + 2 * HOUR).toISOString(),
    ...over,
  };
}

function mockDay({ offers = [], orders = [], allergens = [] } = {}) {
  get.mockImplementation((url) => {
    if (url.includes("typical-items")) return Promise.resolve({ data: { items: ["לחם"], allergens } });
    if (url === "/producers/me/locations") return Promise.resolve({ data: LOCS });
    if (url === "/producers/me/rescue/offers") return Promise.resolve({ data: offers });
    if (url === "/producers/me/rescue/orders") return Promise.resolve({ data: orders });
    if (url === "/producers/me") return Promise.resolve({ data: { name: "מאפיית הכרמל", status: "approved" } });
    return Promise.resolve({ data: { location_ids: ["loc1"] } });
  });
}

async function loaded() {
  await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me/rescue/offers"));
  await screen.findByTestId("rescue-publish-today");
  await act(async () => {});
}

/** DOM order: true when `a` comes before `b`. */
const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: {} });
  put.mockResolvedValue({ data: { items: [] } });
});

describe("allergens behind a closed disclosure (owner)", () => {
  it.each([
    [0, []],
    [1, ["milk"]],
    [3, ["milk", "gluten", "sesame"]],
  ])("starts closed with %i marked, and the summary says how many", async (n, codes) => {
    mockDay({ allergens: codes });
    wrap(<RescueTab />);
    await loaded();
    const box = screen.getByTestId("rescue-allergens-disclosure");
    expect(box.hasAttribute("open")).toBe(false);
    expect(screen.getByTestId("rescue-allergens-summary").textContent).toContain(D.allergens_toggle);
    const count = screen.queryByTestId("rescue-allergens-count");
    if (n === 0) expect(count).toBeNull();
    else if (n === 1) expect(count.textContent).toContain("סומן אחד");
    else expect(count.textContent).toContain(`סומנו ${n}`);
  });

  it("the chips inside the fold work and save as before", async () => {
    mockDay({ allergens: ["milk"] });
    wrap(<RescueTab />);
    await loaded();
    const box = screen.getByTestId("rescue-allergens-disclosure");
    fireEvent.click(within(box).getByTestId("rescue-allergen-sesame"));
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    await waitFor(() => expect(put.mock.calls.at(-1)[1].allergens).toEqual(["milk", "sesame"]));
  });
});

describe("the publish card's place", () => {
  it("comes before the counters when nothing is out today or tomorrow", async () => {
    mockDay({ offers: [], orders: [] });
    wrap(<RescueTab />);
    await loaded();
    expect(before(screen.getByTestId("rescue-publish-today"), screen.getByTestId("rescue-counters"))).toBe(true);
  });

  it("stays in its place when the offers read fails — a failure is not «nothing out»", async () => {
    mockDay();
    const base = get.getMockImplementation();
    get.mockImplementation((url) => (url === "/producers/me/rescue/offers" ? Promise.reject(new Error("500")) : base(url)));
    wrap(<RescueTab />);
    await loaded();
    expect(before(screen.getByTestId("rescue-counters"), screen.getByTestId("rescue-publish-today"))).toBe(true);
  });

  it("does not jump after the first publish: the form stays where it was", async () => {
    let out = [];
    mockDay();
    const base = get.getMockImplementation();
    get.mockImplementation((url) => (url === "/producers/me/rescue/offers" ? Promise.resolve({ data: out }) : base(url)));
    wrap(<RescueTab />);
    await loaded();
    const button = screen.getByTestId("rescue-publish-today");
    out = [liveBag()];
    fireEvent.click(button);
    await screen.findByTestId("rescue-offer-cancel");
    // Same node (no remount), still above the counters.
    expect(screen.getByTestId("rescue-publish-today")).toBe(button);
    expect(before(button, screen.getByTestId("rescue-counters"))).toBe(true);
  });

  it("many bags out: below the orders", async () => {
    mockDay({ offers: [liveBag({ id: "a" }), liveBag({ id: "b" }), liveBag({ id: "c" })] });
    wrap(<RescueTab />);
    await loaded();
    expect(before(screen.getByTestId("rescue-counters"), screen.getByTestId("rescue-publish-today"))).toBe(true);
  });

  it("stays below the orders once a bag is out", async () => {
    mockDay({ offers: [liveBag()] });
    wrap(<RescueTab />);
    await loaded();
    expect(before(screen.getByTestId("rescue-counters"), screen.getByTestId("rescue-publish-today"))).toBe(true);
  });
});

describe("«שווי הסל»", () => {
  it("is sent as value_min_agorot when filled", async () => {
    mockDay();
    wrap(<RescueTab />);
    await loaded();
    fireEvent.change(screen.getByTestId("rescue-publish-worth"), { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].value_min_agorot).toBe(4500);
  });

  it("is left out when not above the price — buyers would never see it", async () => {
    mockDay();
    wrap(<RescueTab />);
    await loaded();
    fireEvent.change(screen.getByTestId("rescue-publish-worth"), { target: { value: "15" } });
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect("value_min_agorot" in post.mock.calls[0][1]).toBe(false);
  });

  it("is left out when empty — no struck price is invented", async () => {
    mockDay();
    wrap(<RescueTab />);
    await loaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect("value_min_agorot" in post.mock.calls[0][1]).toBe(false);
  });
});

describe("24-hour times", () => {
  it("offers 00–23 and no AM/PM, and sends the picked hour", async () => {
    mockDay();
    wrap(<RescueTab />);
    await loaded();
    const hour = screen.getByTestId("rescue-publish-from-hour");
    const labels = [...hour.querySelectorAll("option")].map((o) => o.textContent);
    expect(labels).toHaveLength(24);
    expect(labels[0]).toBe("00");
    expect(labels[23]).toBe("23");
    expect(screen.getByTestId("rescue-publish-from").textContent).not.toMatch(/AM|PM/);
    expect(screen.getByTestId("rescue-tab").querySelector('input[type="time"]')).toBeNull();
    fireEvent.change(hour, { target: { value: "17" } });
    fireEvent.change(screen.getByTestId("rescue-publish-from-minute"), { target: { value: "30" } });
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const start = new Date(post.mock.calls[0][1].pickup_start);
    const wall = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
    expect(wall).toBe("17:30");
  });

  it("keeps a value that is off the minute step", () => {
    const onChange = vi.fn();
    wrap(<TimeOfDaySelect value="18:07" onChange={onChange} hourLabel="h" minuteLabel="m" testId="t" />);
    expect(screen.getByTestId("t-minute").value).toBe("07");
    fireEvent.change(screen.getByTestId("t-hour"), { target: { value: "09" } });
    expect(onChange).toHaveBeenCalledWith("09:07");
  });
});

describe("each cancel link names its bag", () => {
  it("shows no cancel box with no live bag", async () => {
    mockDay({ offers: [] });
    wrap(<RescueTab />);
    await loaded();
    expect(screen.queryByTestId("rescue-offer-cancel-box")).toBeNull();
  });

  it("one bag: a «today» line, then the pickup window and «סל אחד» beside the link", async () => {
    mockDay({ offers: [liveBag({ qty_total: 1 })] });
    wrap(<RescueTab />);
    await loaded();
    expect(screen.getByTestId("rescue-offers-today-title").textContent).toBe(D.offers_title_today);
    const label = screen.getByTestId("rescue-offer-cancel-label").textContent;
    expect(label).toContain("סל אחד");
    // The window is isolated left-to-right, or RTL text shows it reversed.
    expect(label).toMatch(/\u2066\d{2}:\d{2}–\d{2}:\d{2}\u2069/);
    expect(screen.getByTestId("rescue-offer-cancel").getAttribute("aria-label")).toMatch(/^לבטל את הסל, איסוף \u2066\d{2}:\d{2}–\d{2}:\d{2}\u2069$/);
  });

  it("many bags: one labelled row each", async () => {
    mockDay({
      offers: [
        liveBag({ id: "a", qty_total: 4 }),
        liveBag({ id: "b", qty_total: 2, pickup_start: new Date(Date.now() + 3 * HOUR).toISOString(), pickup_end: new Date(Date.now() + 4 * HOUR).toISOString() }),
      ],
    });
    wrap(<RescueTab />);
    await loaded();
    const labels = screen.getAllByTestId("rescue-offer-cancel-label").map((n) => n.textContent);
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain("4 סלים");
    expect(labels[1]).toContain("2 סלים");
    expect(labels[0]).not.toBe(labels[1]);
  });
});

describe("the buyer side", () => {
  const offer = {
    id: "of1",
    price_agorot: 1500,
    value_min_agorot: 4500,
    qty_left: 2,
    pickup_start: new Date(Date.now() + HOUR).toISOString(),
    pickup_end: new Date(Date.now() + 2 * HOUR).toISOString(),
    typical_items: ["לחם מחמצת", "בורקס גבינה", "עוגיות חמאה", "רוגלך שוקולד", "חלה מתוקה"],
    producer: { id: "p1", name: "מאפיית הכרמל", city: "חיפה" },
  };

  it("the bag row wraps its contents to two lines instead of cutting them", () => {
    wrap(<BagRow offer={offer} />);
    const where = screen.getByTestId("rescue-row-where");
    expect(where.className).toContain("line-clamp-2");
    expect(where.className).not.toContain("truncate");
  });

  it("the bag row says «שווי 45 ₪, משלמים 15 ₪» to a screen reader", () => {
    wrap(<BagRow offer={offer} />);
    expect(screen.getByTestId("rescue-row-worth-sr").textContent).toBe("שווי 45 ₪, משלמים 15 ₪");
  });

  it("the bag row reads no worth when the business gave none", () => {
    wrap(<BagRow offer={{ ...offer, value_min_agorot: null }} />);
    expect(screen.queryByTestId("rescue-row-worth-sr")).toBeNull();
  });

  it.each([
    ["declared", ["milk"]],
    ["not declared", null],
  ])("the bag page always shows the «ask at pickup» line (%s)", (_name, allergens) => {
    wrap(<AllergenSection allergens={allergens} headingId="h" testId="x" askAtPickup />);
    expect(screen.getByTestId("x-ask").textContent).toBe(he.rescue.section.allergens_ask);
  });

  it("the group buy, which does not ask for it, has no such line", () => {
    wrap(<AllergenSection allergens={null} headingId="h" testId="x" />);
    expect(screen.queryByTestId("x-ask")).toBeNull();
    expect(screen.getByTestId("x-none").textContent).toBe(he.rescue.section.allergens_undeclared);
  });
});
