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
    expect(screen.queryByTestId("area-terms-time")).toBeNull();
    expect(screen.queryByTestId("area-terms-cutoff")).toBeNull();
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
    const times = screen.getAllByTestId("area-terms-time");
    expect(times.map((el) => el.textContent)).toEqual(["מגיע תוך 1–2 ימי עסקים"]);
    expect(screen.getAllByTestId("area-terms-cutoff")).toHaveLength(1);
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

// Sapir 20/11: a day group of towns with nothing of their own reads as one
// line of names; a town with its own minimum keeps its row.
describe("plain towns in a day group read as one line", () => {
  const town = (id, city, day, extra = {}) => ({ id, city, delivery_day: day, delivery_days: [day], ...extra });
  const producer = {
    offers_delivery: true,
    delivery_areas: [
      town("1", "עמיקם", "רביעי"),
      town("2", "אביאל", "רביעי"),
      town("3", "זכרון יעקב", "רביעי", { min_order: 120 }),
      town("4", "קיסריה", "חמישי"),
    ],
  };

  it("many plain + one detailed: one line of names, one row", () => {
    renderBlock(producer);
    const lines = screen.getAllByTestId("area-plain-cities").map((el) => el.textContent);
    expect(lines).toEqual(["עמיקם, אביאל", "קיסריה"]);
    expect(screen.getByText("זכרון יעקב")).toBeInTheDocument();
  });

  it("fees vary: towns on the business fee still read as one line, with that fee once", () => {
    renderBlock({
      offers_delivery: true,
      delivery_fee: 25,
      delivery_areas: [
        town("z", "קריית ביאליק", "שני", { delivery_fee: 15, min_order: 120 }),
        ...["קיסריה", "אור עקיבא", "חדרה", "עין שמר", "בנימינה", "גבעת עדה", "עמיקם"].map((c, i) =>
          town(`p${i}`, c, "חמישי"),
        ),
      ],
    });
    const names = screen.getByTestId("area-plain-cities-names").textContent;
    expect(names).toBe("קיסריה, אור עקיבא, חדרה, עין שמר, בנימינה, גבעת עדה, עמיקם");
    expect(screen.getByTestId("area-plain-cities").textContent).toContain("משלוח: 25₪");
    // Two drawn rows, under the cap of 6: no «הצגת עוד».
    expect(screen.queryByText(/הצגת עוד/)).toBeNull();
  });

  it("towns with the same terms share one row, and the terms are stated once", () => {
    const kiryot = { delivery_fee: 15, min_order: 120, zone_name: "קריות", delivery_days_max: 2 };
    renderBlock({
      offers_delivery: true,
      delivery_fee: 25,
      delivery_areas: [
        town("b", "קריית ביאליק", "שני", kiryot),
        town("m", "קריית מוצקין", "שני", kiryot),
        town("h", "חיפה", "שני"),
      ],
    });
    const rows = screen.getAllByTestId("area-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("קריות");
    expect(rows[0].textContent).toContain("קריית ביאליק, קריית מוצקין");
    expect(screen.getAllByTestId("area-terms-time")).toHaveLength(1);
    expect(screen.getByTestId("area-plain-cities-names").textContent).toBe("חיפה");
  });

  it("no plain town: no line", () => {
    renderBlock({ ...producer, delivery_areas: [town("3", "זכרון יעקב", "רביעי", { min_order: 120 }), town("5", "חדרה", "חמישי", { min_order: 90 })] });
    expect(screen.queryByTestId("area-plain-cities")).toBeNull();
  });
});

// Fresh-reviewer finding 3: a zone with its own cutoff and a plain town on the
// same day share a heading; the zone row states its own next date.
describe("a day group whose rows do not share a cutoff", () => {
  it("the zone row carries its own «המשלוח הבא», the group line keeps the business one", () => {
    // Mon 23/11 09:00. Zone closes Mon 08:00 → misses this Tuesday → 1.12.
    renderBlock({
      offers_delivery: true,
      delivery_areas: [
        { id: "z", city: "רמת גן", delivery_day: "שלישי", delivery_days: ["שלישי"], zone_name: "אקספרס", order_cutoff_day: "שני", order_cutoff_time: "08:00" },
        { id: "p", city: "חולון", delivery_day: "שלישי", delivery_days: ["שלישי"] },
      ],
    });
    const lines = screen.getAllByText(/המשלוח הבא/).map((el) => el.textContent);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes("24.11"))).toBe(true);
    expect(lines.some((l) => l.includes("1.12"))).toBe(true);
  });
});
