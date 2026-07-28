import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1146 chunk B — editorial delivery: per-city rows (city · min order · day,
// fix 4) + an optional self-pickup line (fix 6). MEH-1466: the tertiary WhatsApp
// order CTA was removed (all producer-detail WA CTAs open the same wa.me).

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    // MEH-1233 B3: the delivery day is now labeled ("משלוח ביום {day}").
    if (key === "delivery_day_label") return `משלוח ביום ${vars?.day ?? ""}`;
    // MEH-1305 A: dispatch-day pivot copy.
    if (key === "dispatch_days") return `יוצאים בימי ${vars?.day ?? ""}`;
    if (key === "delivery_day_group") return `ימי ${vars?.day ?? ""}`;
    // MEH-1255: nationwide-with-exclusions display.
    if (key === "nationwide_except") return `משלוחים לכל הארץ (למעט ${vars?.cities ?? ""})`;
    // MEH-1435: compact city-list toggle copy.
    if (key === "show_all") return `הצג עוד ${vars?.count ?? ""} ערים`;
    // MEH-1646 (a): order-cutoff copy — with and without the day promise.
    if (key === "order_cutoff") return `מקבלים הזמנות עד ${vars?.day ?? ""} ${vars?.time ?? ""}`;
    if (key === "order_cutoff_with_day")
      return `מקבלים הזמנות עד ${vars?.day ?? ""} ${vars?.time ?? ""} · משלוח ביום ${vars?.delivery_day ?? ""}`;
    // MEH-1577: structured delivery-cost copy (amount is pre-formatted +
    // bidi-isolated by the component, so the mock just interpolates).
    if (key === "fee") return `משלוח: ${vars?.amount ?? ""}`;
    if (key === "free_above") return `מעל ${vars?.amount ?? ""} — חינם`;
    const map = {
      "heading": "משלוחים",
      "nationwide": "משלוחים לכל הארץ",
      "arranged": "בתיאום מראש",
      "arranged_group": "בתיאום מראש",
      "min_order": "מינימום",
      "pickup": "איסוף עצמי",
      "show_less": "הצג פחות",
      // MEH-1512: map.mini keys reused by the pickup-row Waze nav link.
      "open_in_waze": "Waze",
      "open_in_waze_aria": "פתיחה ב-Waze",
      // MEH-1646: pickup free tag + weekday label used by the cutoff line
      // (the mock ignores namespaces, so opening_hours.weekdays.wed → "wed").
      "free": "חינם",
      "wed": "יום רביעי",
      // MEH-1577: the fee=0 line. Deliberately NOT the bare "חינם" above —
      // see the combined-state test at the bottom of this file.
      "fee_free": "משלוח חינם",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  // MEH-1675 added ChatCircle to the icons this tree reaches: DeliveryChecker
  // renders CoverageRequestCta on a negative verdict. The stub list is
  // exhaustive, so a missing name throws rather than rendering nothing.
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

const producer = { id: 1, name: "חוות", phone: "0501234567" };

describe("DeliveryBlock (MEH-1146 chunk B)", () => {
  it("MEH-1305 A: one shared day is hoisted to a subline, rows carry city + min only", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" },
          { id: 2, city: "עתלית", min_order: 120, delivery_day: "שישי" },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    // Day stated ONCE in the hoisted subline, not repeated per row.
    expect(screen.getByText("יוצאים בימי שישי")).toBeInTheDocument();
    expect(screen.queryByText("משלוח ביום שישי")).not.toBeInTheDocument();
    expect(screen.getByText("זכרון יעקב")).toBeInTheDocument();
    expect(screen.getByText(/100₪/)).toBeInTheDocument(); // formatPrice canonical
  });

  it("MEH-1305 A: 2+ distinct days group under day headers", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
          { id: 2, city: "עכו", min_order: 80, delivery_day: "שלישי" },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.getByText("ימי שישי")).toBeInTheDocument();
    expect(screen.getByText("ימי שלישי")).toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument();
    expect(screen.getByText("עכו")).toBeInTheDocument();
  });

  it("shows the self-pickup line only when pickup_points is set", () => {
    const { rerender } = render(
      <DeliveryBlock nationwide={false} areas={[]} pickup={false} producer={producer} />,
    );
    expect(screen.queryByText("איסוף עצמי")).not.toBeInTheDocument();
    rerender(
      <DeliveryBlock nationwide={false} areas={[]} pickup={true} producer={producer} />,
    );
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
  });

  it("shows the plain nationwide badge when there are no exclusions", () => {
    render(
      <DeliveryBlock nationwide={true} excluded={[]} areas={[]} pickup={false} producer={producer} />,
    );
    expect(screen.getByText("משלוחים לכל הארץ")).toBeInTheDocument();
    expect(screen.queryByText(/למעט/)).not.toBeInTheDocument();
  });

  it("shows 'משלוחים לכל הארץ (למעט …)' when nationwide has an exclusion list (MEH-1255)", () => {
    render(
      <DeliveryBlock
        nationwide={true}
        excluded={["זכרון יעקב", "עתלית"]}
        areas={[]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(
      screen.getByText("משלוחים לכל הארץ (למעט זכרון יעקב, עתלית)"),
    ).toBeInTheDocument();
  });

  it("ignores an exclusion list when not nationwide (guarded upstream)", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        excluded={["זכרון יעקב"]}
        areas={[{ id: 1, city: "חיפה", min_order: 0, delivery_day: "" }]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.queryByText(/למעט/)).not.toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument();
  });

  it("MEH-1466: no WhatsApp order CTA is rendered inside the delivery section", () => {
    render(
      <DeliveryBlock nationwide={true} areas={[]} pickup={false} producer={producer} />,
    );
    expect(screen.queryByTestId("whatsapp-cta")).not.toBeInTheDocument();
  });

  it("MEH-1435: city-only areas render as a compact Hebrew-sorted list, no editorial rows / no toggle ≤15", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "תל אביב" },
          { id: 2, city: "אשדוד" },
          { id: 3, city: "חיפה" },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    // All cities shown, no "מינימום" row, no toggle under the 15-city limit.
    expect(screen.getByText("אשדוד")).toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument();
    expect(screen.getByText("תל אביב")).toBeInTheDocument();
    expect(screen.queryByText("מינימום")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /הצג/ })).not.toBeInTheDocument();
    // Hebrew a→ז order: אשדוד before חיפה before תל אביב.
    const cities = ["אשדוד", "חיפה", "תל אביב"].map((c) => screen.getByText(c));
    expect(cities[0].compareDocumentPosition(cities[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cities[1].compareDocumentPosition(cities[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("MEH-1435: >15 city-only areas preview 15 + a toggle that expands/collapses", () => {
    const areas = Array.from({ length: 18 }, (_, i) => ({
      id: i + 1,
      // Zero-padded so Hebrew localeCompare keeps a stable order; "עיר 01".."עיר 18".
      city: `עיר ${String(i + 1).padStart(2, "0")}`,
    }));
    render(
      <DeliveryBlock nationwide={false} areas={areas} pickup={false} producer={producer} />,
    );
    // Preview: first 15, 16th hidden; toggle names the 3 hidden.
    expect(screen.getByText("עיר 15")).toBeInTheDocument();
    expect(screen.queryByText("עיר 16")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "הצג עוד 3 ערים" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    // Expanded: all 18 shown, toggle flips to "show less".
    expect(screen.getByText("עיר 18")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "הצג פחות" })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("עיר 16")).not.toBeInTheDocument();
  });

  // ── MEH-1512: pickup / market_stand rows from producer.locations[] ──────────

  it("MEH-1512: renders a row per pickup location — label, city subline, hours, Waze nav", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={true}
        producer={{
          ...producer,
          locations: [
            { kind: "pickup", label: "דוכן השוק", city: "חיפה", lat: 32.8, lng: 35.0, opening_hours: "שישי 8-13" },
            { kind: "market_stand", label: "יריד אורגני", city: "עכו", lat: 32.9, lng: 35.1 },
            { kind: "branch", label: "הסניף הראשי", city: "נהריה", lat: 33.0, lng: 35.1 },
          ],
        }}
      />,
    );
    // Pickup heading (locked string), both pickup/market rows, branch excluded.
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
    expect(screen.getByText("דוכן השוק")).toBeInTheDocument();
    expect(screen.getByText("יריד אורגני")).toBeInTheDocument();
    expect(screen.getByText("חיפה")).toBeInTheDocument(); // city subline (label present)
    expect(screen.getByText("שישי 8-13")).toBeInTheDocument(); // opening_hours
    expect(screen.queryByText("הסניף הראשי")).not.toBeInTheDocument(); // branch out of scope
    // Outbound Waze nav link built from lat/lng (no second in-page map).
    const nav = screen.getAllByRole("link", { name: "פתיחה ב-Waze" });
    expect(nav).toHaveLength(2);
    expect(nav[0]).toHaveAttribute("href", expect.stringContaining("waze.com/ul?ll="));
  });

  it("MEH-1512: label falls back to city when label is null", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={true}
        producer={{ ...producer, locations: [{ kind: "pickup", label: null, city: "מודיעין", lat: 31.9, lng: 35.0 }] }}
      />,
    );
    // City is the heading; no duplicate city subline when label is absent.
    expect(screen.getAllByText("מודיעין")).toHaveLength(1);
  });

  it("MEH-1512: 10 pickup rows show a 5-row preview + the existing show-more toggle", () => {
    const locations = Array.from({ length: 10 }, (_, i) => ({
      kind: "pickup",
      label: `נקודה ${String(i + 1).padStart(2, "0")}`,
      city: `עיר ${String(i + 1).padStart(2, "0")}`,
      lat: 32 + i / 100,
      lng: 35,
    }));
    render(
      <DeliveryBlock nationwide={false} areas={[]} pickup={true} producer={{ ...producer, locations }} />,
    );
    // First 5 shown (sorted city→label), the 6th hidden behind the reused toggle.
    expect(screen.getByText("נקודה 05")).toBeInTheDocument();
    expect(screen.queryByText("נקודה 06")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "הצג עוד 5 ערים" });
    fireEvent.click(toggle);
    expect(screen.getByText("נקודה 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הצג פחות" })).toBeInTheDocument();
  });

  it("MEH-1512: fallback — pickup=true with zero pickup rows still renders the generic line", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={true}
        producer={{ ...producer, locations: [{ kind: "branch", label: "סניף", city: "חיפה", lat: 32.8, lng: 35 }] }}
      />,
    );
    // Only a branch row exists → no pickup rows → the generic "איסוף עצמי" line.
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
    // No Waze nav link is rendered for the generic fallback line.
    expect(screen.queryByRole("link", { name: "פתיחה ב-Waze" })).not.toBeInTheDocument();
  });

  // MEH-1646 (a) — order-cutoff line, three states. Cutoff renders ONLY when
  // order_window has exactly one open day (getSingleOrderCutoff); the day
  // promise attaches ONLY in hoist mode (single shared delivery day).
  const singleDayWindow = { wednesday: { open: "09:00", close: "14:00" } };
  const hoistAreas = [
    { id: 1, city: "זכרון יעקב", min_order: 100, delivery_day: "שישי" },
    { id: 2, city: "עתלית", min_order: 120, delivery_day: "שישי" },
  ];

  it("MEH-1646 state 1: single-day window + single shared delivery day → combined cutoff line replaces dispatch_days", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={hoistAreas}
        pickup={false}
        producer={{ ...producer, order_window: singleDayWindow }}
      />,
    );
    expect(
      screen.getByText("מקבלים הזמנות עד יום רביעי 14:00 · משלוח ביום שישי"),
    ).toBeInTheDocument();
    // Replaced, not duplicated — the day is still stated exactly once.
    expect(screen.queryByText("יוצאים בימי שישי")).not.toBeInTheDocument();
  });

  it("MEH-1646 state 2: single-day window + 2+ delivery days → cutoff WITHOUT a day promise", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "חיפה", min_order: 100, delivery_day: "שישי" },
          { id: 2, city: "עכו", min_order: 80, delivery_day: "שלישי" },
        ]}
        pickup={false}
        producer={{ ...producer, order_window: singleDayWindow }}
      />,
    );
    expect(screen.getByText("מקבלים הזמנות עד יום רביעי 14:00")).toBeInTheDocument();
    expect(screen.queryByText(/· משלוח ביום/)).not.toBeInTheDocument();
  });

  it("MEH-1646 state 3: no order_window → dispatch_days unchanged, no cutoff claim", () => {
    render(
      <DeliveryBlock nationwide={false} areas={hoistAreas} pickup={false} producer={producer} />,
    );
    expect(screen.getByText("יוצאים בימי שישי")).toBeInTheDocument();
    expect(screen.queryByText(/מקבלים הזמנות עד/)).not.toBeInTheDocument();
  });

  it("MEH-1646 ambiguity guard: 2+ open window days → NO cutoff claim (dispatch_days kept)", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={hoistAreas}
        pickup={false}
        producer={{
          ...producer,
          order_window: {
            wednesday: { open: "09:00", close: "14:00" },
            thursday: { open: "09:00", close: "12:00" },
          },
        }}
      />,
    );
    expect(screen.getByText("יוצאים בימי שישי")).toBeInTheDocument();
    expect(screen.queryByText(/מקבלים הזמנות עד/)).not.toBeInTheDocument();
  });

  // MEH-1646 (b) — pickup rows carry the "חינם" tag at the min_order hierarchy.
  it("MEH-1646: pickup location rows and the generic fallback line both carry חינם", () => {
    const { rerender } = render(
      <DeliveryBlock
        nationwide={false}
        areas={[]}
        pickup={false}
        producer={{
          ...producer,
          locations: [
            { kind: "pickup", label: "החווה", city: "עתלית", lat: 32.7, lng: 34.9 },
            { kind: "market_stand", label: "דוכן שוק", city: "חיפה", lat: 32.8, lng: 35 },
          ],
        }}
      />,
    );
    expect(screen.getAllByText("חינם")).toHaveLength(2); // one per pickup row
    rerender(
      <DeliveryBlock nationwide={false} areas={[]} pickup={true} producer={producer} />,
    );
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
    expect(screen.getAllByText("חינם")).toHaveLength(1); // fallback line
  });

  // ---------- MEH-1577: structured delivery cost ----------
  //
  // Six states, because delivery_fee=0 is a VALUE (free) and not an absence
  // (not stated). A truthiness check would collapse those two into one and
  // every other test here would stay green.
  const withCost = (fee, above, extra = {}) => ({
    ...producer,
    delivery_fee: fee,
    free_delivery_above: above,
    ...extra,
  });
  const feeLine = () => screen.queryByTestId("delivery-fee-line");

  it("MEH-1577 (1/6) both values → one combined line", () => {
    render(
      <DeliveryBlock nationwide areas={[]} pickup={false} producer={withCost(35, 250)} />,
    );
    expect(feeLine()).toHaveTextContent("משלוח: 35₪");
    expect(feeLine()).toHaveTextContent("מעל 250₪ — חינם");
  });

  it("MEH-1577 (2/6) fee only → no threshold clause", () => {
    render(
      <DeliveryBlock nationwide areas={[]} pickup={false} producer={withCost(35, null)} />,
    );
    expect(feeLine()).toHaveTextContent("משלוח: 35₪");
    expect(feeLine()).not.toHaveTextContent("מעל");
  });

  it("MEH-1577 (3/6) threshold ALONE is a legal state and renders on its own", () => {
    render(
      <DeliveryBlock nationwide areas={[]} pickup={false} producer={withCost(null, 200)} />,
    );
    expect(feeLine()).toHaveTextContent("מעל 200₪ — חינם");
    expect(feeLine()).not.toHaveTextContent("משלוח:");
  });

  it("MEH-1577 (4/6) fee=0 renders 'משלוח חינם', never 'משלוח: 0₪'", () => {
    render(
      <DeliveryBlock nationwide areas={[]} pickup={false} producer={withCost(0, null)} />,
    );
    expect(feeLine()).toHaveTextContent("משלוח חינם");
    expect(feeLine()).not.toHaveTextContent("0₪");
  });

  it("MEH-1577 (5/6) neither value → the line is absent from the DOM", () => {
    render(
      <DeliveryBlock nationwide areas={[]} pickup={false} producer={withCost(null, null)} />,
    );
    expect(feeLine()).not.toBeInTheDocument();
  });

  // The state neither MEH-1577 nor MEH-1646 could see alone: 1646 put a bare
  // "חינם" tag on pickup rows, and fee=0 puts "חינם" in the cost line. Both are
  // true and they mean DIFFERENT things (delivery is free / pickup is free).
  // The disambiguator is that the cost line names its subject — "משלוח חינם" —
  // while the pickup tag sits inside a row already headed "איסוף עצמי". This
  // test pins exactly that: the two must not both be the bare word.
  it("MEH-1577 (6/6) fee=0 WITH pickup rows — each 'חינם' names its own subject", () => {
    render(
      <DeliveryBlock
        nationwide
        areas={[]}
        pickup={false}
        producer={withCost(0, null, {
          locations: [{ kind: "pickup", label: "החווה", city: "עתלית", lat: 32.7, lng: 34.9 }],
        })}
      />,
    );
    // The cost line is subject-bearing, so it does NOT join the bare-"חינם" set.
    expect(feeLine()).toHaveTextContent("משלוח חינם");
    expect(screen.getAllByText("חינם")).toHaveLength(1); // pickup row only
    expect(screen.getByText("איסוף עצמי")).toBeInTheDocument();
    // Regression lock: if the fee line were ever reduced to the bare word, the
    // block would show "חינם" twice with nothing saying which is which.
    expect(feeLine()).not.toHaveTextContent(/^חינם$/);
  });
});
