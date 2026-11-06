/**
 * MEH-2649 — the business's counter tool (chunk 5 of MEH-2643).
 *
 * The assertion that matters most: «לא הגיע» is DISABLED until the pickup
 * window has closed. The server refuses it earlier with a 409, so a button
 * that offers it earlier is a button whose only outcome is an error — and the
 * person tapping it is standing at a till with a customer in front of them.
 *
 * Keys resolve against the real messages/he.json, so a test cannot pass while
 * the shipped Hebrew says something else.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

import heMessages from "../messages/he.json";

function lookup(key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), heMessages);
}
function format(raw, values = {}) {
  if (typeof raw !== "string") return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k) => (values[k] !== undefined ? String(values[k]) : `{${k}}`));
}
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, values) => format(lookup(ns ? `${ns}.${key}` : key), values),
}));

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a), put: (...a) => put(...a) },
}));

// Pass-through spy: the real map is empty today, so the only way to see the
// component hand the pickup town to the lookup is to watch the call (MEH-2702).
const leftoverSpy = vi.hoisted(() => ({ fn: null }));
vi.mock("@/lib/rescue", async (importOriginal) => {
  const real = await importOriginal();
  leftoverSpy.fn = vi.fn(real.leftoverGroupUrl);
  return { ...real, leftoverGroupUrl: (...a) => leftoverSpy.fn(...a) };
});

const { default: RescueTab } = await import("@/components/dashboard/RescueTab");

const HOUR = 3600_000;
function order(over = {}) {
  const now = Date.now();
  return {
    id: "o1",
    offer_id: "of1",
    qty: 1,
    pickup_code: "0431",
    status: "reserved",
    handed_at: null,
    cancelled_at: null,
    created_at: new Date(now).toISOString(),
    pickup_start: new Date(now - HOUR).toISOString(),
    pickup_end: new Date(now + HOUR).toISOString(), // still open
    ...over,
  };
}

// MEH-2678: the tab loads the business's own pickup points. It used to take
// them as a prop that the only page rendering it never passed, so every real
// publish said «צריך נקודת איסוף» while these tests, which passed the prop,
// stayed green.
let locs = [{ id: "loc1", location_precision: "exact", is_primary: true }];
function mockOrders(rows) {
  get.mockImplementation((url) => {
    if (url.includes("typical-items")) return Promise.resolve({ data: { items: ["לחם"] } });
    if (url === "/producers/me/locations") return Promise.resolve({ data: locs });
    return Promise.resolve({ data: rows });
  });
}

// The pickup points arrive asynchronously; publishing before they have is
// the no-location path, so the publish tests wait for them first.
async function pointsLoaded() {
  await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me/locations"));
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  locs = [{ id: "loc1", location_precision: "exact", is_primary: true }];
  mockOrders([]);
  post.mockResolvedValue({ data: {} });
  put.mockResolvedValue({ data: { items: [] } });
});

describe("the three counters", () => {
  it("count the list they are shown beside, so they cannot disagree with it", async () => {
    mockOrders([
      order({ id: "a", status: "reserved" }),
      order({ id: "b", status: "handed", pickup_code: "0002" }),
      order({ id: "c", status: "handed", pickup_code: "0003" }),
      order({ id: "d", status: "no_show", pickup_code: "0004" }),
    ]);
    render(<RescueTab />);
    await waitFor(() => expect(screen.getByTestId("rescue-counter-reserved").textContent).toBe("1"));
    expect(screen.getByTestId("rescue-counter-handed").textContent).toBe("2");
    expect(screen.getByTestId("rescue-counter-no_show").textContent).toBe("1");
    expect(await screen.findAllByTestId("rescue-order-row")).toHaveLength(4);
  });
});

describe("the order list", () => {
  it("puts orders still waiting at the counter first and cancelled ones last", async () => {
    mockOrders([
      order({ id: "c", status: "cancelled", pickup_code: "0001" }),
      order({ id: "h", status: "handed", pickup_code: "0002" }),
      order({ id: "r", status: "reserved", pickup_code: "0003" }),
      order({ id: "n", status: "no_show", pickup_code: "0004" }),
      order({ id: "r2", status: "reserved", pickup_code: "0005" }),
    ]);
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    const codes = screen.getAllByTestId("rescue-order-code").map((el) => el.textContent);
    expect(codes).toEqual(["0003", "0005", "0002", "0004", "0001"]);
  });
});

describe("«לא הגיע» and the pickup window", () => {
  it("is DISABLED while the window is still open", async () => {
    mockOrders([order()]);
    render(<RescueTab />);
    const btn = await screen.findByTestId("rescue-order-noshow");
    expect(btn.disabled).toBe(true);
    // And it says why, rather than looking broken.
    expect(btn.getAttribute("title")).toBe(lookup("rescue.dashboard.no_show_too_early"));
  });

  it("is ENABLED once the window has closed", async () => {
    mockOrders([order({ pickup_end: new Date(Date.now() - 60_000).toISOString() })]);
    render(<RescueTab />);
    const btn = await screen.findByTestId("rescue-order-noshow");
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("title")).toBeNull();
  });

  it("marking a no-show posts to the no_show route", async () => {
    mockOrders([order({ pickup_end: new Date(Date.now() - 60_000).toISOString() })]);
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-order-noshow"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/rescue/orders/o1/no_show"));
  });
});

describe("handing a bag over", () => {
  it("the row button posts to handed", async () => {
    mockOrders([order()]);
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-order-hand"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/rescue/orders/o1/handed"));
  });

  it("typing the code hands over THAT order", async () => {
    mockOrders([order({ id: "x", pickup_code: "0777" }), order({ id: "y", pickup_code: "0888" })]);
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    fireEvent.change(screen.getByTestId("rescue-code-input"), { target: { value: "0888" } });
    fireEvent.click(screen.getByTestId("rescue-code-submit"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/rescue/orders/y/handed"));
  });

  it("an unknown code says so and posts nothing", async () => {
    mockOrders([order({ pickup_code: "0777" })]);
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    fireEvent.change(screen.getByTestId("rescue-code-input"), { target: { value: "1234" } });
    fireEvent.click(screen.getByTestId("rescue-code-submit"));
    expect(await screen.findByTestId("rescue-tab-notice")).toHaveProperty(
      "textContent",
      lookup("rescue.dashboard.code_not_found"),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("a code that was already handed over is not re-handed", async () => {
    mockOrders([order({ status: "handed", pickup_code: "0431" })]);
    render(<RescueTab />);
    await screen.findAllByTestId("rescue-order-row");
    fireEvent.change(screen.getByTestId("rescue-code-input"), { target: { value: "0431" } });
    fireEvent.click(screen.getByTestId("rescue-code-submit"));
    expect(await screen.findByTestId("rescue-tab-notice")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("a handed row shows the time and offers no buttons", async () => {
    mockOrders([order({ status: "handed", handed_at: "2026-11-04T16:42:00+00:00" })]);
    render(<RescueTab />);
    const handed = await screen.findByTestId("rescue-order-handed");
    expect(handed.textContent).toContain("✓");
    expect(screen.queryByTestId("rescue-order-hand")).toBeNull();
    expect(screen.queryByTestId("rescue-order-noshow")).toBeNull();
  });
});

describe("the list never shows who the buyer is", () => {
  it("renders only the code, the quantity and the state", async () => {
    mockOrders([order()]);
    render(<RescueTab />);
    const row = await screen.findByTestId("rescue-order-row");
    expect(row.textContent).toContain("0431");
    // Nothing resembling an identity reaches the screen — the API does not
    // send one, and this asserts the component does not invent one either.
    expect(row.textContent).not.toMatch(/@/);
  });

  it("the code renders LTR so four digits are not reversed", async () => {
    mockOrders([order()]);
    render(<RescueTab />);
    expect((await screen.findByTestId("rescue-order-code")).getAttribute("dir")).toBe("ltr");
  });
});

describe("publishing", () => {
  it("with no pickup point, shows what is missing and links to the address editor instead of the form", async () => {
    locs = [];
    mockOrders([]);
    render(<RescueTab />);
    const box = await screen.findByTestId("rescue-needs-address");
    expect(box.textContent).toContain(lookup("rescue.dashboard.needs_address"));
    expect(box.textContent).toContain(lookup("rescue.dashboard.needs_address_privacy"));
    const link = screen.getByTestId("rescue-needs-address-link");
    expect(link.textContent).toBe(lookup("rescue.dashboard.needs_address_cta"));
    expect(link.getAttribute("href")).toContain("/producer/dashboard/edit#locations");
    expect(screen.queryByTestId("rescue-publish-today")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps the form (and its server-side guard) when the pickup points could not be loaded", async () => {
    get.mockImplementation((url) =>
      url === "/producers/me/locations" ? Promise.reject(new Error("down")) : Promise.resolve({ data: [] }),
    );
    render(<RescueTab />);
    await pointsLoaded();
    expect(screen.queryByTestId("rescue-needs-address")).toBeNull();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    expect(await screen.findByTestId("rescue-tab-notice")).toHaveProperty(
      "textContent",
      lookup("rescue.dashboard.no_location"),
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("loads its own pickup point and publishes at it — the page passes nothing", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].producer_location_id).toBe("loc1");
  });

  it("skips an approximate point (the server refuses it) and uses an exact one", async () => {
    locs = [
      { id: "approx", location_precision: "approximate", is_primary: true },
      { id: "exact2", location_precision: "exact", is_primary: false },
    ];
    mockOrders([]);
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].producer_location_id).toBe("exact2");
  });

  it("with only an approximate point, asks for an exact address instead of offering a publish the server refuses", async () => {
    locs = [{ id: "approx", location_precision: "approximate", is_primary: true }];
    mockOrders([]);
    render(<RescueTab />);
    expect(await screen.findByTestId("rescue-needs-address")).toBeTruthy();
    expect(screen.queryByTestId("rescue-publish-today")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("dates the bag by the Israel calendar, not UTC (00:30 in Israel is still yesterday in UTC)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T22:30:00Z")); // 00:30 on 06/11 in Israel
    try {
      render(<RescueTab />);
      await pointsLoaded();
      fireEvent.click(screen.getByTestId("rescue-publish-today"));
      await waitFor(() => expect(post).toHaveBeenCalled());
      expect(post.mock.calls[0][1].date).toBe("2026-11-06");
    } finally {
      vi.useRealTimers();
    }
  });

  // Sapir 6/11: the business picks the free-cancel cutoff. Default stays
  // half an hour before pickup, the value that was hard-coded before.
  const minutesBefore = (body) =>
    (new Date(body.pickup_start).getTime() - new Date(body.cancel_until).getTime()) / 60000;

  it("offers the three free-cancel cutoffs and defaults to half an hour", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    const select = screen.getByTestId("rescue-publish-cancel");
    expect(select.tagName).toBe("SELECT");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "חצי שעה לפני האיסוף",
      "שעה לפני האיסוף",
      "שעתיים לפני האיסוף",
    ]);
    expect(screen.getByText("ביטול חינם עד")).toBeTruthy();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(minutesBefore(post.mock.calls[0][1])).toBe(30);
  });

  it("sends the cutoff the business chose", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.change(screen.getByTestId("rescue-publish-cancel"), { target: { value: "120" } });
    fireEvent.click(screen.getByTestId("rescue-publish-tomorrow"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(minutesBefore(post.mock.calls[0][1])).toBe(120);
  });

  it("sends agorot, not shekels", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.change(screen.getByTestId("rescue-publish-price"), { target: { value: "18" } });
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].price_agorot).toBe(1800);
  });

  it("the tomorrow button publishes for the NEXT day", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-tomorrow"));
    await waitFor(() => expect(post).toHaveBeenCalled());
    const today = new Date().toISOString().slice(0, 10);
    expect(post.mock.calls[0][1].date).not.toBe(today);
  });

  it("surfaces the server's own refusal rather than a generic message", async () => {
    post.mockRejectedValue({ response: { data: { detail: "סלי הפתעה עדיין לא פתוחים ביישוב הזה" } } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    expect(await screen.findByTestId("rescue-tab-notice")).toHaveProperty(
      "textContent",
      "סלי הפתעה עדיין לא פתוחים ביישוב הזה",
    );
  });
});

describe("the «בדרך כלל» editor", () => {
  it("loads what is stored and saves a trimmed list", async () => {
    render(<RescueTab />);
    await waitFor(() => expect(screen.getByTestId("rescue-items-input").value).toBe("לחם"));
    fireEvent.change(screen.getByTestId("rescue-items-input"), {
      target: { value: " לחם , חלה ,, בורקס " },
    });
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/producers/me/rescue/typical-items", {
        items: ["לחם", "חלה", "בורקס"],
        allergens: [],
      }),
    );
  });

  it("MEH-2752: ticking an allergen sends it, in canonical order", async () => {
    render(<RescueTab />);
    await waitFor(() => expect(screen.getByTestId("rescue-items-input").value).toBe("לחם"));
    // Ticked out of order on purpose: the payload must still be canonical, so
    // the bag card and the product sheet read the same way.
    fireEvent.click(screen.getByTestId("rescue-allergen-sesame"));
    fireEvent.click(screen.getByTestId("rescue-allergen-gluten"));
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    await waitFor(() =>
      expect(put.mock.calls.at(-1)[1].allergens).toEqual(["gluten", "sesame"]),
    );
  });

  it("MEH-2752: ticking nothing sends [], which the server stores as NULL", async () => {
    render(<RescueTab />);
    await waitFor(() => expect(screen.getByTestId("rescue-items-input").value).toBe("לחם"));
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    // NOT omitted and NOT a claim of "no allergens" — the server turns [] into
    // NULL, which is "nothing declared". See backend/app/allergens.py.
    await waitFor(() => expect(put.mock.calls.at(-1)[1].allergens).toEqual([]));
  });

  it("MEH-2752: unticking clears a previous declaration", async () => {
    get.mockImplementation((url) =>
      url.includes("typical-items")
        ? Promise.resolve({ data: { items: ["לחם"], allergens: ["milk"] } })
        : Promise.resolve({ data: [] }),
    );
    render(<RescueTab />);
    const milk = await screen.findByTestId("rescue-allergen-milk");
    await waitFor(() => expect(milk.getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(milk);
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    await waitFor(() => expect(put.mock.calls.at(-1)[1].allergens).toEqual([]));
  });

  it("MEH-2752: the chips use the product sheet's Hebrew labels", async () => {
    render(<RescueTab />);
    expect((await screen.findByTestId("rescue-allergen-sesame")).textContent).toBe("שומשום");
    expect(screen.getByTestId("rescue-allergen-gluten").textContent).toBe("גלוטן");
  });
});

describe("the empty day", () => {
  it("says there are no reservations rather than showing an empty frame", async () => {
    mockOrders([]);
    render(<RescueTab />);
    expect(await screen.findByTestId("rescue-orders-empty")).toHaveProperty(
      "textContent",
      lookup("rescue.dashboard.orders_empty"),
    );
    expect(screen.getByTestId("rescue-counter-reserved").textContent).toBe("0");
  });
});

// MEH-2702 — where uncollected bags can go. The 05/11 scan found no local
// food-rescue group in any Wave 1 town, so today every town gets the national
// group; a town added to the map must get its own link instead.
// MEH-2703: what was not collected. The server sends `leftover` per offer —
// 0 until pickup_end — so the box keys on it, never on the clock here.
let todaysOffers = [];
function mockDay({ offers = [], points = locs, name = "מאפיית הכרמל" } = {}) {
  todaysOffers = offers;
  get.mockImplementation((url) => {
    if (url.includes("typical-items")) return Promise.resolve({ data: { items: [] } });
    if (url === "/producers/me/locations") return Promise.resolve({ data: points });
    if (url === "/producers/me/rescue/offers") return Promise.resolve({ data: todaysOffers });
    if (url === "/producers/me") return Promise.resolve({ data: { name } });
    return Promise.resolve({ data: [] });
  });
}
function bag(over = {}) {
  return { id: "of1", qty_total: 4, qty_left: 2, status: "active", leftover: 3, qty_donated: 0, ...over };
}
const ZICHRON = [{ id: "loc1", location_precision: "exact", is_primary: true, city: "זכרון יעקב" }];

describe("what was not collected", () => {
  it("shows nothing while no bag is left over (before the window closes the server sends 0)", async () => {
    mockDay({ offers: [bag({ leftover: 0 })], points: ZICHRON });
    render(<RescueTab />);
    await pointsLoaded();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me/rescue/offers"));
    await act(async () => {});
    expect(screen.queryByTestId("rescue-leftover")).toBeNull();
  });

  it("offers WhatsApp, the rescue group and «נמסרו בחינם» once bags were left", async () => {
    mockDay({ offers: [bag({ leftover: 3 })], points: ZICHRON });
    render(<RescueTab />);
    expect(await screen.findByTestId("rescue-leftover")).toBeTruthy();
    expect(screen.getByTestId("rescue-leftover").textContent).toContain(
      lookup("rescue.dashboard.leftover_hint"),
    );
    // No recipient: the business picks the contact or group in WhatsApp.
    const share = (await screen.findByTestId("rescue-leftover-share")).getAttribute("href");
    expect(share.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(share.slice("https://wa.me/?text=".length));
    await waitFor(() =>
      expect(
        decodeURIComponent(
          screen.getByTestId("rescue-leftover-share").getAttribute("href").slice("https://wa.me/?text=".length),
        ),
      ).toContain("מאפיית הכרמל"),
    );
    expect(text).toContain("זכרון יעקב");
    const group = screen.getByTestId("rescue-leftover-link");
    expect(group.getAttribute("href")).toBe("https://www.facebook.com/groups/freefood/");
    expect(group.getAttribute("rel")).toContain("noopener");
    expect(screen.getByTestId("rescue-leftover-donated").textContent).toBe(
      lookup("rescue.dashboard.leftover_donated"),
    );
  });

  it("adds up the leftover across today's bags and reports each one as given", async () => {
    mockDay({
      offers: [bag({ id: "a", leftover: 2 }), bag({ id: "b", leftover: 1 }), bag({ id: "c", leftover: 0 })],
      points: ZICHRON,
    });
    put.mockImplementation(async (url, body) => {
      const id = url.split("/").at(-2);
      todaysOffers = todaysOffers.map((o) => (o.id === id ? { ...o, qty_donated: body.qty } : o));
      return { data: {} };
    });
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-leftover-donated"));
    expect(await screen.findByTestId("rescue-leftover-done")).toBeTruthy();
    expect(put).toHaveBeenCalledWith("/producers/me/rescue/offers/a/donated", { qty: 2 });
    expect(put).toHaveBeenCalledWith("/producers/me/rescue/offers/b/donated", { qty: 1 });
    // A bag with nothing left over is not reported at all.
    expect(put).not.toHaveBeenCalledWith("/producers/me/rescue/offers/c/donated", expect.anything());
    expect(screen.queryByTestId("rescue-leftover-donated")).toBeNull();
  });

  it("says what the server refused instead of claiming the bags were given", async () => {
    mockDay({ offers: [bag({ leftover: 3 })], points: ZICHRON });
    put.mockRejectedValue({ response: { data: { detail: "אפשר לסמן עד 2 סלים שלא נאספו" } } });
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-leftover-donated"));
    expect(await screen.findByTestId("rescue-tab-notice")).toHaveProperty(
      "textContent",
      "אפשר לסמן עד 2 סלים שלא נאספו",
    );
    expect(screen.queryByTestId("rescue-leftover-done")).toBeNull();
  });

  it("hides the WhatsApp button while the business name is missing, so the text has no empty slot", async () => {
    mockDay({ offers: [bag({ leftover: 3 })], points: ZICHRON, name: "" });
    render(<RescueTab />);
    await screen.findByTestId("rescue-leftover");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me"));
    await act(async () => {});
    expect(screen.queryByTestId("rescue-leftover-share")).toBeNull();
    // The group link and «נמסרו בחינם» need no name and stay.
    expect(screen.getByTestId("rescue-leftover-link")).toBeTruthy();
    expect(screen.getByTestId("rescue-leftover-donated")).toBeTruthy();
  });

  it("reloads after a failure part-way, so a bag already saved shows as given", async () => {
    mockDay({ offers: [bag({ id: "a", leftover: 2 }), bag({ id: "b", leftover: 1 })], points: ZICHRON });
    put.mockImplementation(async (url, body) => {
      const id = url.split("/").at(-2);
      if (id === "b") throw { response: { data: { detail: "שגיאה" } } };
      todaysOffers = todaysOffers.map((o) => (o.id === id ? { ...o, qty_donated: body.qty } : o));
      return { data: {} };
    });
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-leftover-donated"));
    await screen.findByTestId("rescue-tab-notice");
    const offerLoads = () => get.mock.calls.filter(([u]) => u === "/producers/me/rescue/offers").length;
    await waitFor(() => expect(offerLoads()).toBeGreaterThanOrEqual(2));
  });

  it("reports only the number chosen when some bags were given, spread over the offers in order", async () => {
    mockDay({ offers: [bag({ id: "a", leftover: 2 }), bag({ id: "b", leftover: 2 })], points: ZICHRON });
    put.mockResolvedValue({ data: {} });
    render(<RescueTab />);
    const qty = await screen.findByTestId("rescue-leftover-qty");
    expect(qty.value).toBe("4");
    fireEvent.change(qty, { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("rescue-leftover-donated"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenCalledWith("/producers/me/rescue/offers/a/donated", { qty: 2 });
    expect(put).toHaveBeenCalledWith("/producers/me/rescue/offers/b/donated", { qty: 1 });
  });

  it("undoes a report by setting every offer back to 0", async () => {
    mockDay({ offers: [bag({ id: "a", leftover: 2, qty_donated: 2 }), bag({ id: "b", leftover: 1, qty_donated: 1 })], points: ZICHRON });
    put.mockResolvedValue({ data: {} });
    render(<RescueTab />);
    expect(await screen.findByTestId("rescue-leftover-done")).toBeTruthy();
    expect(screen.queryByTestId("rescue-leftover-donated")).toBeNull();
    fireEvent.click(screen.getByTestId("rescue-leftover-undo"));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put).toHaveBeenCalledWith("/producers/me/rescue/offers/a/donated", { qty: 0 });
    expect(put).toHaveBeenCalledWith("/producers/me/rescue/offers/b/donated", { qty: 0 });
  });

  it("tells the business ahead of time where the box will appear while the window is open", async () => {
    const later = new Date(Date.now() + 3600_000).toISOString();
    mockDay({ offers: [bag({ leftover: 0, pickup_end: later })], points: ZICHRON });
    render(<RescueTab />);
    expect((await screen.findByTestId("rescue-leftover-upcoming")).textContent).toBe(
      lookup("rescue.dashboard.leftover_upcoming"),
    );
    expect(screen.queryByTestId("rescue-leftover")).toBeNull();
  });

  it("says nothing ahead of time on a day with no bags published", async () => {
    mockDay({ offers: [], points: ZICHRON });
    render(<RescueTab />);
    await pointsLoaded();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/producers/me/rescue/offers"));
    await act(async () => {});
    expect(screen.queryByTestId("rescue-leftover-upcoming")).toBeNull();
  });

  it("looks the group up by the town of the exact pickup point, not an approximate one", async () => {
    mockDay({
      offers: [bag()],
      points: [
        { id: "loc0", location_precision: "approximate", is_primary: true, city: "בנימינה" },
        { id: "loc1", location_precision: "exact", is_primary: false, city: "חדרה" },
      ],
    });
    leftoverSpy.fn.mockClear();
    render(<RescueTab />);
    await screen.findByTestId("rescue-leftover");
    expect(leftoverSpy.fn).toHaveBeenLastCalledWith("חדרה");
    expect(leftoverSpy.fn).not.toHaveBeenCalledWith("בנימינה");
  });
});

describe("leftoverGroupUrl", () => {
  it("returns a town's own group when the map has one, the national group otherwise", async () => {
    const { leftoverGroupUrl, RESCUE_LEFTOVER_GROUP_NATIONAL } = await import("@/lib/rescue");
    const groups = { "חדרה": "https://example.org/hadera" };
    expect(leftoverGroupUrl("חדרה", groups)).toBe("https://example.org/hadera");
    expect(leftoverGroupUrl(" חדרה ", groups)).toBe("https://example.org/hadera");
    expect(leftoverGroupUrl("בנימינה", groups)).toBe(RESCUE_LEFTOVER_GROUP_NATIONAL);
    expect(leftoverGroupUrl(undefined, groups)).toBe(RESCUE_LEFTOVER_GROUP_NATIONAL);
    // An inherited property is not a group: a plain lookup returned a function here.
    expect(leftoverGroupUrl("constructor", groups)).toBe(RESCUE_LEFTOVER_GROUP_NATIONAL);
    expect(leftoverGroupUrl("toString")).toBe(RESCUE_LEFTOVER_GROUP_NATIONAL);
  });
});

// MEH-2730: Sapir saw «משהו נתקע. נסו שוב.» under the code box after a PUBLISH
// was refused (staging logs: 5× POST /rescue/offers → 403). One shared notice
// sat under the code box for every action on the screen, and an object
// `detail` (the verified-email gate) could not be shown at all.
describe("MEH-2730 each message sits next to what caused it", () => {
  beforeEach(() => {
    locs = [{ id: "loc1", location_precision: "exact", is_primary: true }];
    mockOrders([]);
    post.mockReset();
    put.mockReset();
  });

  const sectionOf = (el) => el.closest("[data-notice-scope]")?.getAttribute("data-notice-scope");

  it("a refused publish is shown in the publish box, not under the code box", async () => {
    post.mockRejectedValue({ response: { status: 403, data: { detail: "רק בית עסק מאושר יכול לפרסם סל הפתעה" } } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    const notice = await screen.findByTestId("rescue-tab-notice");
    expect(notice.textContent).toBe("רק בית עסק מאושר יכול לפרסם סל הפתעה");
    expect(sectionOf(notice)).toBe("publish");
    expect(sectionOf(screen.getByTestId("rescue-publish-today"))).toBe("publish");
  });

  it("an unknown code is shown by the code box", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.change(screen.getByTestId("rescue-code-input"), { target: { value: "222" } });
    fireEvent.click(screen.getByTestId("rescue-code-submit"));
    const notice = await screen.findByTestId("rescue-tab-notice");
    expect(sectionOf(notice)).toBe("code");
    expect(sectionOf(screen.getByTestId("rescue-code-input"))).toBe("code");
  });

  it("the verified-email refusal (an object detail) shows its sentence instead of crashing", async () => {
    post.mockRejectedValue({
      response: { status: 403, data: { detail: { code: "email_unverified", message: "יש לאמת את כתובת האימייל תחילה" } } },
    });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    expect((await screen.findByTestId("rescue-tab-notice")).textContent).toBe("יש לאמת את כתובת האימייל תחילה");
  });

  it("a validation error (array detail) shows its sentence instead of crashing", async () => {
    post.mockRejectedValue({ response: { status: 422, data: { detail: [{ msg: "Value error, המחיר חייב להיות חיובי" }] } } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    expect((await screen.findByTestId("rescue-tab-notice")).textContent).toBe("המחיר חייב להיות חיובי");
  });

  it("a failed «בדרך כלל יש בסל» save is shown in that box", async () => {
    put.mockRejectedValue({ response: { status: 500, data: {} } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    const notice = await screen.findByTestId("rescue-tab-notice");
    expect(notice.textContent).toBe(lookup("error.mapper.server"));
    expect(sectionOf(notice)).toBe("items");
  });

  it("only one message is on screen at a time", async () => {
    post.mockRejectedValue({ response: { data: { detail: "סירוב" } } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.change(screen.getByTestId("rescue-code-input"), { target: { value: "222" } });
    fireEvent.click(screen.getByTestId("rescue-code-submit"));
    await screen.findByTestId("rescue-tab-notice");
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() => expect(screen.getByTestId("rescue-tab-notice").textContent).toBe("סירוב"));
    expect(screen.getAllByTestId("rescue-tab-notice")).toHaveLength(1);
  });

  it("a refused hand-over on an order row is shown in the orders box", async () => {
    mockOrders([order()]);
    post.mockRejectedValue({ response: { status: 409, data: { detail: "ההזמנה כבר נמסרה" } } });
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-order-hand"));
    const notice = await screen.findByTestId("rescue-tab-notice");
    expect(notice.textContent).toBe("ההזמנה כבר נמסרה");
    expect(sectionOf(notice)).toBe("orders");
  });

  it("a refused «נמסרו בחינם» is shown in the leftover box", async () => {
    mockDay({ offers: [bag({ leftover: 3 })], points: ZICHRON });
    put.mockRejectedValue({ response: { data: { detail: "אפשר לסמן עד 2 סלים שלא נאספו" } } });
    render(<RescueTab />);
    fireEvent.click(await screen.findByTestId("rescue-leftover-donated"));
    const notice = await screen.findByTestId("rescue-tab-notice");
    expect(sectionOf(notice)).toBe("leftover");
  });

  it("an old message clears as soon as another box starts its request", async () => {
    let release;
    post.mockImplementation(() => new Promise((r) => { release = r; }));
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.change(screen.getByTestId("rescue-code-input"), { target: { value: "222" } });
    fireEvent.click(screen.getByTestId("rescue-code-submit"));
    await screen.findByTestId("rescue-tab-notice");
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    // The publish is still in flight: the code box's message must already be gone.
    await waitFor(() => expect(screen.queryByTestId("rescue-tab-notice")).toBeNull());
    expect(release).toBeTypeOf("function");
    await act(async () => release({ data: {} }));
  });

  it("a 5xx shows the generic line, not the server's own text", async () => {
    post.mockRejectedValue({ response: { status: 502, data: { detail: "Bad Gateway" } } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    expect((await screen.findByTestId("rescue-tab-notice")).textContent).toBe(lookup("error.mapper.server"));
  });

  // MEH-2745: 401 / 429 / no response get the site's own sentences
  // (error.mapper.*), never whatever text the server or a proxy sent.
  for (const [label, err, key] of [
    ["an expired session (401)", { response: { status: 401, data: { detail: "Not authenticated" } } }, "error.mapper.unauthorized"],
    ["too many attempts (429)", { response: { status: 429, data: { detail: "Rate limit exceeded: 5 per 1 minute" } } }, "error.mapper.rate_limited"],
    ["no response at all (network)", { message: "Network Error" }, "error.mapper.network"],
    ["a plain thrown Error (no response)", new Error("x"), "error.mapper.network"],
  ]) {
    it(`${label} shows the site's sentence, not the raw text`, async () => {
      post.mockRejectedValue(err);
      render(<RescueTab />);
      await pointsLoaded();
      fireEvent.click(screen.getByTestId("rescue-publish-today"));
      const notice = await screen.findByTestId("rescue-tab-notice");
      expect(notice.textContent).toBe(lookup(key));
      expect(sectionOf(notice)).toBe("publish");
    });
  }

  it("a successful publish stays «published» even when the reload after it fails", async () => {
    post.mockResolvedValue({ data: {} });
    render(<RescueTab />);
    await pointsLoaded();
    get.mockImplementation(() => Promise.reject({ response: { status: 500, data: {} } }));
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    await waitFor(() =>
      expect(screen.getByTestId("rescue-tab-notice").textContent).toBe(lookup("rescue.dashboard.published")),
    );
    await act(async () => {});
    expect(screen.getByTestId("rescue-tab-notice").textContent).toBe(lookup("rescue.dashboard.published"));
  });

  it("a refusal is an alert, a confirmation is a status", async () => {
    post.mockRejectedValueOnce({ response: { status: 403, data: { detail: "סירוב" } } });
    render(<RescueTab />);
    await pointsLoaded();
    fireEvent.click(screen.getByTestId("rescue-publish-today"));
    expect((await screen.findByTestId("rescue-tab-notice")).getAttribute("role")).toBe("alert");
    put.mockResolvedValue({ data: { items: [] } });
    fireEvent.click(screen.getByTestId("rescue-items-save"));
    await waitFor(() =>
      expect(screen.getByTestId("rescue-tab-notice").textContent).toBe(lookup("rescue.dashboard.items_saved")),
    );
    expect(screen.getByTestId("rescue-tab-notice").getAttribute("role")).toBe("status");
  });

  it("the time fields can shrink inside their column (iOS draws them wider)", async () => {
    render(<RescueTab />);
    await pointsLoaded();
    for (const id of ["rescue-publish-from", "rescue-publish-to"]) {
      const input = screen.getByTestId(id);
      expect(input.className).toContain("min-w-0");
      expect(input.closest("label").className).toContain("min-w-0");
    }
  });
});
