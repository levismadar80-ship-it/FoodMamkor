/**
 * MEH-3511 — delivery time in business days, a business-wide minimum, a
 * zone's own order cutoff, and zones on a nationwide business, on the public
 * business page. Real he.json copy, frozen clock.
 *
 * States: nothing new filled (renders as before) · delivery time: upper bound
 * only / one number / range · cutoff: none / inherited / own · nationwide:
 * no zones / one zone (+ checker: zone city vs any other city).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import DeliveryBlock from "@/components/DeliveryBlock";
import { matchDeliveryCity } from "@/components/DeliveryChecker";
import { deliveryTimeMessage } from "@/lib/deliveryTime";
import { sharedCutoff } from "@/lib/nextDelivery";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })), post: vi.fn() },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...p }) => <a href={href} {...p}>{children}</a>,
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/he/p/x",
}));

// Mon 23/11/2026 09:00 Israel.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-23T07:00:00Z"));
  document.documentElement.lang = "he";
});
afterEach(() => vi.useRealTimers());

function renderBlock(producer) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}} timeZone="Asia/Jerusalem">
      <DeliveryBlock
        nationwide={!!producer.delivery_nationwide}
        excluded={producer.delivery_excluded_cities || []}
        areas={producer.delivery_areas || []}
        producer={producer}
      />
    </NextIntlClientProvider>,
  );
}

const EXPRESS = {
  id: "a1",
  city: "רמת גן",
  zone_name: "גוש דן, אקספרס",
  delivery_fee: 40,
  min_order: 100,
  delivery_days: ["שלישי"],
  delivery_day: "שלישי",
  delivery_days_min: 1,
  delivery_days_max: 2,
  order_cutoff_day: "שני",
  order_cutoff_time: "12:00",
};

const cardinal = (extra = {}) => ({
  offers_delivery: true,
  delivery_nationwide: true,
  delivery_fee: 30,
  delivery_min_order: 150,
  delivery_days_max: 5,
  delivery_areas: [EXPRESS],
  ...extra,
});

describe("deliveryTimeMessage", () => {
  it("reads nothing / an upper bound / one number / a range", () => {
    expect(deliveryTimeMessage(null, null)).toBeNull();
    expect(deliveryTimeMessage(null, 5)).toEqual({ key: "business_days_upto", values: { max: 5 } });
    expect(deliveryTimeMessage(3, null)).toEqual({ key: "business_days_exact", values: { days: 3 } });
    expect(deliveryTimeMessage(3, 3)).toEqual({ key: "business_days_exact", values: { days: 3 } });
    expect(deliveryTimeMessage(3, 5)).toEqual({ key: "business_days_range", values: { min: 3, max: 5 } });
  });
});

describe("sharedCutoff", () => {
  const own = { order_cutoff_day: "שני", order_cutoff_time: "12:00" };
  it("is the rows' common cutoff, and null when one row has none or they differ", () => {
    expect(sharedCutoff([own, own])).toEqual({ dayIndex: 1, close: "12:00" });
    expect(sharedCutoff([own, {}])).toBeNull();
    expect(sharedCutoff([own, { ...own, order_cutoff_time: "13:00" }])).toBeNull();
    expect(sharedCutoff([])).toBeNull();
  });
});

describe("business page (MEH-3511)", () => {
  it("a business that filled nothing new renders no new line", () => {
    renderBlock({
      offers_delivery: true,
      delivery_areas: [{ id: "h", city: "חיפה", delivery_day: "ראשון", min_order: 80 }],
    });
    expect(screen.queryByTestId("delivery-business-terms")).toBeNull();
    expect(screen.queryByTestId("area-terms")).toBeNull();
    expect(screen.queryByTestId("nationwide-zones")).toBeNull();
  });

  it("Cardinal: «עד 5 ימי עסקים», the minimum, and the express zone on its own terms", () => {
    renderBlock(cardinal());
    expect(screen.getByTestId("delivery-business-terms-time").textContent).toBe("מגיע תוך עד 5 ימי עסקים");
    expect(screen.getByTestId("delivery-business-terms-min").textContent).toBe("מינימום 150₪");
    // The top fee line stays the country-wide fee, not «מ-30₪».
    expect(screen.getByTestId("delivery-fee-line").textContent).toBe("משלוח: 30₪");
    const zone = screen.getByTestId("nationwide-zone");
    expect(zone.textContent).toContain("גוש דן, אקספרס");
    expect(zone.textContent).toContain("רמת גן");
    expect(screen.getByTestId("nationwide-zone-fee").textContent).toBe("משלוח: 40₪");
    expect(screen.getByTestId("nationwide-zone-terms-time").textContent).toBe("מגיע תוך 1–2 ימי עסקים");
    expect(screen.getByTestId("nationwide-zone-terms-cutoff").textContent).toBe(
      "מקבלים הזמנות עד יום שני 12:00",
    );
    // Monday 09:00, before Monday 12:00 → tomorrow's Tuesday run.
    expect(screen.getByTestId("next-delivery").textContent).toBe("המשלוח הבא: יום שלישי 24.11");
  });

  it("a zone row on a city business carries its time and cutoff", () => {
    renderBlock({
      offers_delivery: true,
      delivery_areas: [EXPRESS, { id: "h", city: "חיפה", delivery_day: "שלישי", min_order: 80 }],
    });
    const terms = screen.getAllByTestId("area-terms");
    expect(terms).toHaveLength(1);
    expect(terms[0].textContent).toContain("מגיע תוך 1–2 ימי עסקים");
  });
});

describe("checker on a nationwide business with a zone (MEH-3511)", () => {
  const args = { nationwide: true, excluded: [], areas: [EXPRESS] };
  it("a zone city gets the zone's answer, any other city «כל הארץ»", () => {
    expect(matchDeliveryCity({ ...args, city: "רמת גן" }).status).toBe("yes");
    expect(matchDeliveryCity({ ...args, city: "רמת גן" }).minOrder).toBe(100);
    expect(matchDeliveryCity({ ...args, city: "חיפה" }).status).toBe("yes_nationwide");
  });

  it("the checker shows on a nationwide business with zones (hidden before)", () => {
    renderBlock(cardinal());
    expect(screen.getByTestId("delivery-checker")).toBeTruthy();
  });
});
