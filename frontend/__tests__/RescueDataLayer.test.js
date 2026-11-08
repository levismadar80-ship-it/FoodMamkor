/**
 * MEH-2648 — lib/rescue.js, the rescue data layer.
 *
 * The case this file exists for: `fetchOffers` first returned [] when the Zod
 * parse failed, which renders the SAME empty shelf as a genuinely quiet
 * evening, with nothing in any log. A schema drift would have looked like "no
 * bags today" forever. These tests pin the three answers apart — rows, a
 * deliberate empty, and a thrown shape error — so that collapse cannot come
 * back quietly.
 *
 * The schema here is the GENERATED one (lib/generated/api.zod.js, produced
 * from backend/openapi.json in MEH-2646), not a local copy, so a payload that
 * passes here is one the real backend contract accepts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: (...a) => post(...a) } }));

const { fetchOffers, RescueShapeError, reserveErrorKey, walkingMinutes, shekels, israelTime } =
  await import("@/lib/rescue");

function validOffer(over = {}) {
  return {
    id: "11111111-0000-4000-8000-000000000001",
    date: "2026-11-04",
    qty_left: 2,
    qty_total: 4,
    price_agorot: 1500,
    value_min_agorot: null,
    value_max_agorot: null,
    pickup_start: "2026-11-04T16:00:00+00:00",
    pickup_end: "2026-11-04T18:00:00+00:00",
    cancel_until: "2026-11-04T15:30:00+00:00",
    producer: {
      id: "a1b2c3d4-0000-4000-8000-000000000001",
      name: "מאפיית ההצלה",
      slug: "hatzala",
      city: "חיפה",
      image_url: null,
      location_city: "חיפה",
      location_address: "הנביאים 10",
    },
    typical_items: ["לחם"],
    distance_km: 0.8,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchOffers — three different answers, never one", () => {
  it("returns the parsed rows on a good payload", async () => {
    get.mockResolvedValue({ data: [validOffer()] });
    const rows = await fetchOffers({ city: "חיפה" });
    expect(rows).toHaveLength(1);
    expect(rows[0].producer.name).toBe("מאפיית ההצלה");
  });

  it("returns [] for a 404 — the pilot being off server-side is not a fault", async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    await expect(fetchOffers()).resolves.toEqual([]);
  });

  it("THROWS on a payload the schema rejects, instead of looking like an empty evening", async () => {
    // qty_left as a string is the shape a drifting backend would send.
    get.mockResolvedValue({ data: [validOffer({ qty_left: "two" })] });
    await expect(fetchOffers()).rejects.toBeInstanceOf(RescueShapeError);
  });

  it("the thrown error carries the issues, so a report can name the field", async () => {
    get.mockResolvedValue({ data: [validOffer({ qty_left: "two" })] });
    await fetchOffers().catch((err) => {
      expect(Array.isArray(err.issues)).toBe(true);
      expect(JSON.stringify(err.issues)).toContain("qty_left");
    });
  });

  it("rethrows a 500 rather than swallowing it", async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    await expect(fetchOffers()).rejects.toBeTruthy();
  });

  it("an empty array from the server really is an empty evening", async () => {
    get.mockResolvedValue({ data: [] });
    await expect(fetchOffers()).resolves.toEqual([]);
  });

  it("sends lat/lng only when BOTH are numbers", async () => {
    get.mockResolvedValue({ data: [] });
    await fetchOffers({ lat: 32.79, lng: 34.99 });
    expect(get.mock.calls[0][1].params).toMatchObject({ lat: 32.79, lng: 34.99 });
    get.mockClear();
    await fetchOffers({ lat: 32.79 });
    expect(get.mock.calls[0][1].params.lat).toBeUndefined();
  });
});

describe("the unit helpers", () => {
  it("walking minutes are haversine × 1.3 at 5 km/h, floored at one", () => {
    // 1 km → 1.3 km of pavement → 15.6 min
    expect(walkingMinutes(1)).toBe(16);
    expect(walkingMinutes(0.01)).toBe(1);
    expect(walkingMinutes(null)).toBeNull();
  });

  it("agorot become whole shekels", () => {
    expect(shekels(1500)).toBe(15);
    expect(shekels(null)).toBeNull();
  });

  it("times render in Israel's zone, not the runner's", () => {
    // 16:00 UTC is 18:00 in Israel (IST, +02:00) on this November date.
    expect(israelTime("2026-11-04T16:00:00+00:00")).toBe("18:00");
    expect(israelTime("not-a-date")).toBeNull();
    expect(israelTime(null)).toBeNull();
  });

  it("maps each status the API returns to its own copy key", () => {
    expect(reserveErrorKey({ response: { status: 422 } })).toBe("errors.blocked");
    expect(reserveErrorKey({ response: { status: 401 } })).toBe("errors.sign_in");
    expect(reserveErrorKey({ response: { status: 404 } })).toBe("errors.gone");
    expect(reserveErrorKey({ response: { status: 409, data: { detail: "לא נשארו מספיק סלים" } } })).toBe("errors.sold_out");
    expect(reserveErrorKey({ response: { status: 409, data: { detail: "אפשר לשריין עד שני סלים" } } })).toBe("errors.max_two");
    expect(reserveErrorKey({})).toBe("errors.generic");
  });
});
