/**
 * MEH-3704 — send the pickup code to whoever collects, and sort the /rescue
 * list by time / closest / cheapest / rating.
 *
 * Copy chosen by Claude under Sapir's standing delegation in the thread
 * («מאשרת את הנוסח שתבחר», 24/11/2026); the assertions read it from the real
 * messages/he.json (renderHe), so a test stays true to what ships.
 *
 * Shown red against a broken build (PR body):
 *   - sortBags returns the rows unchanged  -> every «הכי זול» / «דירוג» case
 *   - a missing value sorted first          -> "no rating yet sorts last"
 *   - the control shown for one bag         -> "one bag: no sort control"
 *   - the share button left on a handed bag -> "gone once the bag is handed"
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderHe as render } from "./helpers/render-with-he";
import he from "../messages/he.json";
import { israelToday } from "@/lib/israel-date";
import { sortBags } from "@/lib/rescue-sort";

const fetchOffers = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth-context", () => ({ useOptionalAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/rescue", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, rescueBagsEnabled: () => true, fetchOffers: (...a) => fetchOffers(...a) };
});
// A bare field: typing calls onChange, Enter calls onSubmit, as the real one does.
vi.mock("@/components/CitySearch", () => ({
  default: ({ value, onChange, onSubmit }) => (
    <input
      data-testid="city-field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
    />
  ),
}));
let userLoc = null;
vi.mock("@/lib/user-location", () => ({ useUserLocation: () => userLoc }));

const { default: RescueList } = await import("@/components/rescue/RescueList");
const { default: RescueConfirmation } = await import("@/components/rescue/RescueConfirmation");

const HOUR = 3_600_000;
const TODAY = israelToday();
const r = he.rescue;

function offer(id, over = {}) {
  const now = Date.now();
  return {
    id,
    date: TODAY,
    status: "active",
    qty_left: 2,
    qty_total: 4,
    price_agorot: 1500,
    value_min_agorot: null,
    pickup_start: new Date(now + HOUR).toISOString(),
    pickup_end: new Date(now + 2 * HOUR).toISOString(),
    cancel_until: new Date(now + HOUR / 2).toISOString(),
    producer: { id: `p-${id}`, name: `עסק ${id}`, city: "חיפה", location_city: "חיפה", avg_rating: null, reviews_count: 0 },
    typical_items: [],
    distance_km: null,
    ...over,
  };
}

const ids = () => screen.getAllByTestId("rescue-bag-row").map((el) => el.closest("li")?.textContent ?? "");
const order = (names) => {
  const rows = ids();
  return names.map((n) => rows.findIndex((text) => text.includes(n)));
};

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* jsdom always has it */
  }
});

describe("sortBags", () => {
  const rows = [
    { id: "a", price_agorot: 2000, distance_km: 3, producer: { avg_rating: 4.2 } },
    { id: "b", price_agorot: 1000, distance_km: null, producer: { avg_rating: null } },
    { id: "c", price_agorot: 1500, distance_km: 1, producer: { avg_rating: 4.9 } },
  ];
  const by = (sort) => sortBags(rows, sort).map((o) => o.id);

  it("time keeps the server's order", () => expect(by("time")).toEqual(["a", "b", "c"]));
  it("cheapest first", () => expect(by("cheap")).toEqual(["b", "c", "a"]));
  it("closest first; no distance sorts last", () => expect(by("near")).toEqual(["c", "a", "b"]));
  it("highest rated first; no rating yet sorts last", () => expect(by("rating")).toEqual(["c", "a", "b"]));
  it("0 and 1 rows, and it never mutates the input", () => {
    expect(sortBags([], "cheap")).toEqual([]);
    expect(sortBags([rows[0]], "rating")).toEqual([rows[0]]);
    by("cheap");
    expect(rows.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
  it("ties keep the server's order", () => {
    const tie = [{ id: "x", price_agorot: 1 }, { id: "y", price_agorot: 1 }];
    expect(sortBags(tie, "cheap").map((o) => o.id)).toEqual(["x", "y"]);
  });
});

describe("the sort control on /rescue", () => {
  afterEach(() => {
    userLoc = null;
    fetchOffers.mockReset();
  });

  it("a location that arrives after the person typed a town keeps that town", async () => {
    fetchOffers.mockResolvedValue([offer("a")]);
    const { rerender } = render(<RescueList initialCity="חיפה" />);
    await screen.findAllByTestId("rescue-bag-row");
    expect(fetchOffers).toHaveBeenCalledTimes(1);
    const field = screen.getByTestId("city-field");
    fireEvent.change(field, { target: { value: "עכו" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(2));
    userLoc = { lat: 32.8, lng: 35 };
    rerender(<RescueList initialCity="חיפה" />);
    await waitFor(() => expect(fetchOffers).toHaveBeenCalledTimes(3));
    expect(fetchOffers.mock.calls[2][0]).toEqual({ city: "עכו", lat: 32.8, lng: 35 });
    expect(field.value).toBe("עכו");
  });

  it("no bags: no control", async () => {
    fetchOffers.mockResolvedValue([]);
    render(<RescueList />);
    await screen.findByTestId("rescue-list-empty");
    expect(screen.queryByTestId("rescue-list-sort")).toBeNull();
  });

  it("one bag: no sort control", async () => {
    fetchOffers.mockResolvedValue([offer("a")]);
    render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    expect(screen.queryByTestId("rescue-list-sort")).toBeNull();
  });

  it("many bags: the server's order by default, then cheapest and rating reorder", async () => {
    fetchOffers.mockResolvedValue([
      offer("1", { price_agorot: 3000, producer: { ...offer("1").producer, avg_rating: 4.1 } }),
      offer("2", { price_agorot: 1000, producer: { ...offer("2").producer, avg_rating: null } }),
      offer("3", { price_agorot: 2000, producer: { ...offer("3").producer, avg_rating: 4.8 } }),
    ]);
    render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    const select = screen.getByLabelText(r.list.sort_label);
    expect(select.value).toBe("time");
    expect(order(["עסק 1", "עסק 2", "עסק 3"])).toEqual([0, 1, 2]);

    fireEvent.change(select, { target: { value: "cheap" } });
    expect(order(["עסק 2", "עסק 3", "עסק 1"])).toEqual([0, 1, 2]);

    fireEvent.change(select, { target: { value: "rating" } });
    expect(order(["עסק 3", "עסק 1", "עסק 2"])).toEqual([0, 1, 2]);
  });

  it("«הכי קרוב» is offered only when the rows carry a distance", async () => {
    fetchOffers.mockResolvedValue([offer("1"), offer("2")]);
    const { unmount } = render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    expect(screen.queryByRole("option", { name: r.list.sort_near })).toBeNull();
    unmount();

    fetchOffers.mockResolvedValue([offer("1", { distance_km: 4 }), offer("2", { distance_km: 0.5 })]);
    render(<RescueList />);
    await screen.findAllByTestId("rescue-bag-row");
    fireEvent.change(screen.getByLabelText(r.list.sort_label), { target: { value: "near" } });
    expect(order(["עסק 2", "עסק 1"])).toEqual([0, 1]);
  });

  it("a saved location is sent, so the rows can carry a distance", async () => {
    userLoc = { lat: 32.8, lng: 35 };
    fetchOffers.mockResolvedValue([]);
    render(<RescueList />);
    await waitFor(() => expect(fetchOffers).toHaveBeenCalled());
    expect(fetchOffers.mock.calls.at(-1)[0]).toMatchObject({ lat: 32.8, lng: 35 });
  });
});

describe("send the code to whoever collects", () => {
  const reserved = (over = {}) => ({
    id: "ord1",
    offer_id: "o1",
    date: TODAY,
    qty: 1,
    pickup_code: "0431",
    status: "reserved",
    handed_at: null,
    price_agorot: 1500,
    pickup_start: new Date(Date.now() + HOUR).toISOString(),
    pickup_end: new Date(Date.now() + 2 * HOUR).toISOString(),
    cancel_until: new Date(Date.now() + HOUR / 2).toISOString(),
    ...over,
  });
  const place = { name: "מאפיית ההצלה", address: "הנביאים 5, חיפה" };
  let shareSpy;
  const realShare = navigator.share;

  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: realShare, configurable: true });
    vi.restoreAllMocks();
  });

  it("opens the share sheet with the code, the business, the window, the address and what to say", async () => {
    shareSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
    render(<RescueConfirmation order={reserved()} onCancel={() => {}} place={place} />);
    fireEvent.click(screen.getByRole("button", { name: r.share.button }));
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const text = shareSpy.mock.calls[0][0].text;
    expect(text).toContain("0431");
    expect(text).toContain(place.name);
    expect(text).toContain(place.address);
    expect(text).toContain(r.share.line_say_pay.replace("{price}", "15"));
  });

  it("without a share sheet, WhatsApp opens with the same text", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<RescueConfirmation order={reserved()} onCancel={() => {}} place={{ name: null, address: null }} />);
    fireEvent.click(screen.getByRole("button", { name: r.share.button }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = open.mock.calls[0][0];
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]);
    expect(text.split("\n")[0]).toBe(r.share.line_code.replace("{code}", "0431"));
  });

  it("a sheet that refuses falls back to WhatsApp; a cancelled sheet does not", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const refuse = Object.assign(new Error("no"), { name: "NotAllowedError" });
    Object.defineProperty(navigator, "share", { value: vi.fn().mockRejectedValue(refuse), configurable: true });
    const { unmount } = render(<RescueConfirmation order={reserved()} onCancel={() => {}} place={place} />);
    fireEvent.click(screen.getByRole("button", { name: r.share.button }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    unmount();
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const cancelSpy = vi.fn().mockRejectedValue(abort);
    Object.defineProperty(navigator, "share", { value: cancelSpy, configurable: true });
    render(<RescueConfirmation order={reserved()} onCancel={() => {}} place={place} />);
    fireEvent.click(screen.getByRole("button", { name: r.share.button }));
    await waitFor(() => expect(cancelSpy).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("gone once the bag is handed or cancelled", () => {
    const { rerender } = render(<RescueConfirmation order={reserved({ status: "handed" })} onCancel={() => {}} />);
    expect(screen.queryByTestId("rescue-share-code")).toBeNull();
    rerender(<RescueConfirmation order={reserved({ status: "cancelled" })} onCancel={() => {}} />);
    expect(screen.queryByTestId("rescue-share-code")).toBeNull();
  });
});
