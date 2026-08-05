/**
 * MEH-1888 — the fetch that feeds the RENDERED producer tree validates without
 * losing a field.
 *
 * `page.js:73` renders `<ProducerDetail />` with no props, so
 * `initialProducer` defaults to null (`ProducerDetail.jsx:37`) and the server
 * fetch feeds only JSON-LD and metadata. The object `ContactCard` and its
 * siblings actually render comes from `useProducerData.js` — established by
 * measurement in `docs/audits/producer-detail-page-validation.md` §0, against a
 * ticket that had assumed otherwise.
 *
 * The risk that shapes every assertion below: `z.object` strips unknown keys,
 * and `ProducerDetailSchema` declares 51 of `ProducerDetailOut`'s 81 fields. A
 * plain parse here would silently delete 30 fields from the rendered object —
 * the MEH-901 class, committed by the very change meant to prevent it. So the
 * central test is not "does it validate" but **"does it keep every key"**.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const captureMessage = vi.fn();
const captureException = vi.fn();
const apiGet = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a) => captureMessage(...a),
  captureException: (...a) => captureException(...a),
}));
vi.mock("@/lib/api", () => ({ default: { get: (...a) => apiGet(...a) } }));
vi.mock("@/lib/recently-viewed", () => ({ pushRecentlyViewed: vi.fn() }));

const { useProducerData } = await import(
  "@/app/[locale]/producer/[id]/hooks/useProducerData"
);

/**
 * A payload shaped like a real GET /producers/{id} response: fields the Zod
 * detail schema declares, PLUS six it does not that the page renders anyway.
 * Those six are the point — they are what a stripping parse would delete.
 */
const UNDECLARED_BUT_RENDERED = {
  whatsapp_group: "https://chat.whatsapp.com/xyz", // ContactCard.jsx:125
  // MEH-1880 gave order_window a real shape on the LIST contract
  // (lib/schemas.js: record<day, OrderWindowRange | OrderWindowRange[] | null>).
  // This fixture used an invented `{ opens: "08:00" }`, which the schema
  // correctly rejected the moment that landed — caught by this file's own
  // "reports NOTHING on a valid payload" assertion rather than by review, which
  // is the assertion earning its keep. Canonical per-day list shape:
  order_window: { sunday: [{ open: "09:00", close: "13:00" }] }, // ContactCard.jsx:252
  contact_name: "רותי", //                            OwnerCard.jsx:31
  owner_bio: "אופה מזה 12 שנה", //                    OwnerCard.jsx:35
  established_year: 2014, //                          ProducerHeader.jsx:241
  products: [{ id: "prod-1", name: "לחם מחמצת" }], // ProducerSections.jsx:112
};

const VALID = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "מאפיית רוח השדה",
  city: "כפר סבא",
  phone: "050-1234567",
  website: "https://ruach-hasade.co.il",
  instagram: "ruach_hasade",
  facebook: "https://facebook.com/ruachhasade",
  external_order_form: "https://forms.gle/abc",
  avg_rating: 4.8,
  ...UNDECLARED_BUT_RENDERED,
};

// One contract violation: avg_rating is a number on ProducerListOut.
const INVALID = { ...VALID, avg_rating: "excellent" };

function mount(response) {
  apiGet.mockImplementation((path) => {
    if (path.startsWith("/producers/")) return Promise.resolve({ data: response });
    return Promise.resolve({ data: [] }); // events / similar / nearby feeds
  });
  return renderHook(() =>
    useProducerData({ params: { id: VALID.id }, fetchPath: null, initialProducer: null }),
  );
}

beforeEach(() => {
  captureMessage.mockClear();
  captureException.mockClear();
  apiGet.mockReset();
});

describe("MEH-1888 — useProducerData validation", () => {
  it("keeps EVERY key on a valid payload — .loose(), not a stripping parse", async () => {
    const { result } = mount(VALID);
    await waitFor(() => expect(result.current.producer).toBeTruthy());

    // NOT an equality assertion: a successful parse ADDS the four
    // `.default([])` keys (`images`, `categories`, `delivery_areas`,
    // `locations`) when the payload omits them. Gaining an empty array is
    // harmless — every consumer already reads these with `?.length`. LOSING a
    // key is the bug, so that is what is asserted.
    const kept = Object.keys(VALID).filter(
      (k) => !(k in result.current.producer),
    );
    expect(kept, "keys dropped by the parse").toEqual([]);
    expect(Object.keys(result.current.producer).length).toBeGreaterThanOrEqual(
      Object.keys(VALID).length,
    );
    // Named individually so a failure says WHICH field the page just lost.
    for (const field of Object.keys(UNDECLARED_BUT_RENDERED)) {
      expect(result.current.producer).toHaveProperty(field);
    }
    expect(result.current.producer.products).toEqual(UNDECLARED_BUT_RENDERED.products);
  });

  it("reports NOTHING on a valid payload", async () => {
    const { result } = mount(VALID);
    await waitFor(() => expect(result.current.producer).toBeTruthy());
    // Without this, "reports exactly once" below would pass equally against
    // code that reports on every response — a green with two causes.
    expect(captureMessage).toHaveBeenCalledTimes(0);
    expect(captureException).toHaveBeenCalledTimes(0);
  });

  it("on a schema mismatch still renders the producer and reports EXACTLY once", async () => {
    const { result } = mount(INVALID);
    await waitFor(() => expect(result.current.producer).toBeTruthy());

    // The visitor keeps the page: producer is set, and set to the RAW payload.
    expect(result.current.producer).not.toBeNull();
    expect(Object.keys(result.current.producer).length).toBe(Object.keys(INVALID).length);
    expect(result.current.producer.avg_rating).toBe("excellent");

    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledTimes(0);
    expect(captureMessage.mock.calls[0][0]).toBe(
      "Producer detail payload failed schema validation",
    );
    expect(captureMessage.mock.calls[0][1].extra.issues.length).toBeGreaterThan(0);
  });

  it("reports EXACTLY once when the request rejects, and still stops loading", async () => {
    apiGet.mockImplementation((path) =>
      path.startsWith("/producers/")
        ? Promise.reject(new Error("Network Error"))
        : Promise.resolve({ data: [] }),
    );
    const { result } = renderHook(() =>
      useProducerData({ params: { id: VALID.id }, fetchPath: null, initialProducer: null }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.producer).toBeNull(); // behaviour unchanged
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledTimes(0);
  });
});
