/**
 * MEH-1908 — the three show-more toggles, through the REAL ICU formatter.
 *
 * DeliveryBlock.test.jsx mocks next-intl flat, so it can prove which KEY each
 * consumer reads and nothing at all about what that key renders. That is the
 * gap this file exists for, and it is the gap the bug lived in: the old shared
 * `show_all` = "הצג עוד {count} ערים" carried no `plural`, so count=1 rendered
 * «הצג עוד 1 ערים», and the noun "ערים" was wrong for pickup points at EVERY
 * count. A mocked assertion cannot see either defect — it asserts the mock.
 *
 * So: no next-intl mock here. `he.json` / `en.json` are loaded and formatted by
 * the same intl-messageformat the app ships, and every assertion below is a
 * string a reader would actually see.
 *
 * Coverage is 3 consumers × {count===1, count===2, count>2} × {he, en}.
 *
 * MEH-2235 added the middle column. Hebrew has FOUR plural categories, so the
 * validator requires a `two` branch these three keys shipped without; the
 * matrix was {1, many} while the language has a distinct form at exactly 2.
 * The he/en pair at count===2 is the discriminating one: Hebrew takes `two`
 * («הצג שתי ערים נוספות») and English, which has no such category, stays on
 * `other` («Show 2 more cities»). A single-locale test cannot tell those
 * apart.
 *
 * REUSES: frontend/__tests__/MastheadPopoverRealIntl.test.jsx (the
 * NextIntlClientProvider-over-a-real-catalogue idiom, MEH-1843).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";

// DeliveryChecker reaches auth/network on a coverage lookup and renders nothing
// this file asserts on. Stubbed so a failure here can only be about the toggles.
vi.mock("@/components/DeliveryChecker", () => ({ default: () => null }));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    Truck: Stub,
    Package: Stub,
    WhatsappLogo: Stub,
    CaretDown: Stub,
    CaretUp: Stub,
    NavigationArrow: Stub,
    ChatCircle: Stub,
  };
});

import DeliveryBlock from "@/components/DeliveryBlock";

const MESSAGES = { he, en };
const producer = { id: 1, name: "חוות", phone: "0501234567" };

function toggleNames(locale, props) {
  render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} onError={() => {}}>
      <DeliveryBlock nationwide={false} pickup={false} producer={producer} {...props} />
    </NextIntlClientProvider>,
  );
  // Every disclosure control in this block is the only <button> its section
  // renders, and the fixtures below light exactly one section each.
  return screen.getAllByRole("button").map((b) => b.textContent.trim());
}

// CITY_PREVIEW_LIMIT = 15. City-only areas (no min_order, no day) → CompactCities.
const cities = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, city: `עיר ${String(i + 1).padStart(2, "0")}` }));

// PICKUP_PREVIEW_LIMIT = 3.
const pickups = (n) =>
  Array.from({ length: n }, (_, i) => ({
    kind: "pickup",
    label: `נקודה ${String(i + 1).padStart(2, "0")}`,
    city: `עיר ${String(i + 1).padStart(2, "0")}`,
  }));

// AREA_PREVIEW_LIMIT = 6. min_order makes a row info-bearing, which keeps it out
// of compact mode and on the editorial AreaToggle path.
const areas = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    city: `עיר ${String(i + 1).padStart(2, "0")}`,
    min_order: 100,
    delivery_day: "שישי",
  }));

describe("MEH-1908 — pluralised show-more copy, real ICU (he)", () => {
  it("cities: count===1 takes the singular branch, not «הצג עוד 1 ערים»", () => {
    expect(toggleNames("he", { areas: cities(16) })).toEqual(["הצג עיר נוספת"]);
  });

  it("cities: count===2 takes the `two` branch, not «הצג עוד 2 ערים»", () => {
    expect(toggleNames("he", { areas: cities(17) })).toEqual(["הצג שתי ערים נוספות"]);
  });

  it("cities: count>2 names cities in the plural", () => {
    expect(toggleNames("he", { areas: cities(18) })).toEqual(["הצג עוד 3 ערים"]);
  });

  it("pickup: says «נקודת איסוף», never «עיר» — the count===1 branch", () => {
    expect(toggleNames("he", { areas: [], pickup: true, producer: { ...producer, locations: pickups(4) } }))
      .toEqual(["הצג נקודת איסוף נוספת"]);
  });

  it("pickup: count===2 takes the `two` branch, still «נקודות איסוף»", () => {
    expect(toggleNames("he", { areas: [], pickup: true, producer: { ...producer, locations: pickups(5) } }))
      .toEqual(["הצג שתי נקודות איסוף נוספות"]);
  });

  it("pickup: says «נקודות איסוף», never «ערים» — the plural branch", () => {
    expect(toggleNames("he", { areas: [], pickup: true, producer: { ...producer, locations: pickups(10) } }))
      .toEqual(["הצג עוד 7 נקודות איסוף"]);
  });

  it("areas: count===1 takes the singular branch", () => {
    expect(toggleNames("he", { areas: areas(7) })).toEqual(["הצג אזור משלוח נוסף"]);
  });

  it("areas: count===2 takes the `two` branch, not «הצג עוד 2 אזורי משלוח»", () => {
    expect(toggleNames("he", { areas: areas(8) })).toEqual(["הצג שני אזורי משלוח נוספים"]);
  });

  it("areas: count>2 names delivery areas in the plural", () => {
    expect(toggleNames("he", { areas: areas(9) })).toEqual(["הצג עוד 3 אזורי משלוח"]);
  });
});

// One render per test: testing-library cleans up between tests, not within one,
// so two renders in a single `it` share a document and toggleNames returns both.
describe("MEH-1908 — pluralised show-more copy, real ICU (en)", () => {
  it("cities: «Show 1 more city»", () => {
    expect(toggleNames("en", { areas: cities(16) })).toEqual(["Show 1 more city"]);
  });

  // The control for the he `two` cases above: English has no `two` category,
  // so the same count must NOT produce a distinct form. Without this pair, a
  // `two` branch accidentally added to en.json would go unnoticed.
  it("cities: count===2 stays on `other` — English has no `two`", () => {
    expect(toggleNames("en", { areas: cities(17) })).toEqual(["Show 2 more cities"]);
  });

  it("cities: «Show 3 more cities»", () => {
    expect(toggleNames("en", { areas: cities(18) })).toEqual(["Show 3 more cities"]);
  });

  it("pickup: «Show 1 more pickup point»", () => {
    expect(toggleNames("en", { areas: [], pickup: true, producer: { ...producer, locations: pickups(4) } }))
      .toEqual(["Show 1 more pickup point"]);
  });

  it("pickup: «Show 7 more pickup points»", () => {
    expect(toggleNames("en", { areas: [], pickup: true, producer: { ...producer, locations: pickups(10) } }))
      .toEqual(["Show 7 more pickup points"]);
  });

  it("areas: «Show 1 more delivery area»", () => {
    expect(toggleNames("en", { areas: areas(7) })).toEqual(["Show 1 more delivery area"]);
  });

  it("areas: «Show 2 more delivery areas»", () => {
    expect(toggleNames("en", { areas: areas(8) })).toEqual(["Show 2 more delivery areas"]);
  });
});
