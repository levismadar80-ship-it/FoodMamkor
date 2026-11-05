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
      }),
    );
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
describe("the leftover-bags line", () => {
  it("links the national group when the pickup town has no local group", async () => {
    locs = [{ id: "loc1", location_precision: "exact", is_primary: true, city: "זכרון יעקב" }];
    render(<RescueTab />);
    await pointsLoaded();
    expect(screen.getByTestId("rescue-leftover-hint").textContent).toContain(
      lookup("rescue.dashboard.leftover_hint"),
    );
    const link = screen.getByTestId("rescue-leftover-link");
    expect(link.getAttribute("href")).toBe("https://www.facebook.com/groups/freefood/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("looks the group up by the town of the exact pickup point, not an approximate one", async () => {
    locs = [
      { id: "loc0", location_precision: "approximate", is_primary: true, city: "בנימינה" },
      { id: "loc1", location_precision: "exact", is_primary: false, city: "חדרה" },
    ];
    leftoverSpy.fn.mockClear();
    render(<RescueTab />);
    await pointsLoaded();
    expect(leftoverSpy.fn).toHaveBeenLastCalledWith("חדרה");
    expect(leftoverSpy.fn).not.toHaveBeenCalledWith("בנימינה");
  });

  it("is hidden when the business has no exact pickup point (no bags can be published)", async () => {
    locs = [{ id: "loc0", location_precision: "approximate", is_primary: true, city: "בנימינה" }];
    render(<RescueTab />);
    await pointsLoaded();
    expect(screen.queryByTestId("rescue-leftover-hint")).toBeNull();
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
