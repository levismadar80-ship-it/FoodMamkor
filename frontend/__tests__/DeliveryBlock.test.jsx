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
    // MEH-1772 chunk 3: the variance form. Distinct from "fee" on purpose —
    // a mock that returned the same string for both would let the variance
    // tests below pass against a component that never switched keys.
    if (key === "fee_from") return `משלוח מ-${vars?.amount ?? ""}`;
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

  // MEH-1903 lowered PICKUP_PREVIEW_LIMIT 5 → 3; this test's numbers move with
  // it (3 shown / 4th hidden / 7 named by the toggle). The shape it pins — a
  // preview plus the reused toggle — is unchanged.
  it("MEH-1512 + MEH-1903: 10 pickup rows show a 3-row preview + the existing show-more toggle", () => {
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
    // First 3 shown (sorted city→label), the 4th hidden behind the reused toggle.
    expect(screen.getByText("נקודה 03")).toBeInTheDocument();
    expect(screen.queryByText("נקודה 04")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "הצג עוד 7 ערים" });
    fireEvent.click(toggle);
    expect(screen.getByText("נקודה 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "הצג פחות" })).toBeInTheDocument();
  });

  it("MEH-1903: 4 pickup locations preview 3 + a toggle naming the 1 remaining", () => {
    const locations = Array.from({ length: 4 }, (_, i) => ({
      kind: "pickup",
      label: `נקודה ${String(i + 1).padStart(2, "0")}`,
      city: `עיר ${String(i + 1).padStart(2, "0")}`,
      lat: 32 + i / 100,
      lng: 35,
    }));
    render(
      <DeliveryBlock nationwide={false} areas={[]} pickup={true} producer={{ ...producer, locations }} />,
    );
    expect(screen.getByText("נקודה 03")).toBeInTheDocument();
    expect(screen.queryByText("נקודה 04")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הצג עוד 1 ערים" }));
    expect(screen.getByText("נקודה 04")).toBeInTheDocument();
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

  // ---------- MEH-1903: AREA_PREVIEW_LIMIT = 6 across hoist / flat / group ----
  //
  // The cap is on the TOTAL number of visible AreaRows, not on each day group.
  // That distinction is the whole feature and it is invisible in any fixture
  // whose groups are individually under 6 — the group tests below are sized so
  // a per-group cap of 6 would render every row and go red.

  // Rows carry min_order so `bare` stays false and the editorial rows render
  // (a city-only fixture collapses to the MEH-1435 compact list instead).
  const areaRows = (n, { day = "שישי", from = 1 } = {}) =>
    Array.from({ length: n }, (_, i) => ({
      id: from + i,
      city: `עיר ${String(from + i).padStart(2, "0")}`,
      min_order: 100,
      delivery_day: day,
    }));

  // The single most likely way to break this: an off-by-one that hides a row at
  // exactly the limit. At 6 the markup must be what it was before the ticket.
  it("MEH-1903 boundary: exactly 6 rows render in full with ZERO toggles in the area section", () => {
    const { container } = render(
      <DeliveryBlock nationwide={false} areas={areaRows(6)} pickup={false} producer={producer} />,
    );
    expect(screen.getByText("עיר 06")).toBeInTheDocument();
    expect(container.querySelectorAll("li").length).toBe(6);
    // Numeric assertion, not a name match: no disclosure control of any kind.
    expect(container.querySelectorAll("button[aria-expanded]").length).toBe(0);
    expect(screen.queryByRole("button", { name: /הצג/ })).not.toBeInTheDocument();
  });

  it("MEH-1903 hoist: 7 rows preview 6 + a toggle that expands to all 7 and collapses back", () => {
    render(
      <DeliveryBlock nationwide={false} areas={areaRows(7)} pickup={false} producer={producer} />,
    );
    expect(screen.getByText("עיר 06")).toBeInTheDocument();
    expect(screen.queryByText("עיר 07")).not.toBeInTheDocument();
    // The hoisted day is still stated exactly once (MEH-1305), cap or no cap.
    expect(screen.getByText("יוצאים בימי שישי")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "הצג עוד 1 ערים" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("עיר 07")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "הצג פחות" })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("עיר 07")).not.toBeInTheDocument();
  });

  it("MEH-1903 flat: 8 dayless rows with minimums preview 6 + toggle", () => {
    const areas = areaRows(8).map(({ delivery_day, ...rest }) => rest);
    render(
      <DeliveryBlock nationwide={false} areas={areas} pickup={false} producer={producer} />,
    );
    expect(screen.getByText("עיר 06")).toBeInTheDocument();
    expect(screen.queryByText("עיר 07")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הצג עוד 2 ערים" }));
    expect(screen.getByText("עיר 08")).toBeInTheDocument();
  });

  it("MEH-1903 group: the cap walks ACROSS groups — one group truncates mid-way, the next hides header and all", () => {
    // 4 + 4 + 2 = 10 rows. Cap 6 → group A whole (4), group B truncated to 2,
    // group C absent entirely. A per-group cap of 6 would show all ten and no
    // toggle, so this fixture is what separates the two implementations.
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          ...areaRows(4, { day: "ראשון", from: 1 }),
          ...areaRows(4, { day: "שני", from: 5 }),
          ...areaRows(2, { day: "שלישי", from: 9 }),
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    // Group A: all four rows + header.
    expect(screen.getByText("ימי ראשון")).toBeInTheDocument();
    expect(screen.getByText("עיר 04")).toBeInTheDocument();
    // Group B: header shown, truncated to the 2 rows the budget allowed.
    expect(screen.getByText("ימי שני")).toBeInTheDocument();
    expect(screen.getByText("עיר 06")).toBeInTheDocument();
    expect(screen.queryByText("עיר 07")).not.toBeInTheDocument();
    // Group C: entirely past the cap → the HEADER is hidden too, not an empty
    // day heading promising a dispatch day with no rows under it.
    expect(screen.queryByText("ימי שלישי")).not.toBeInTheDocument();
    expect(screen.queryByText("עיר 09")).not.toBeInTheDocument();
    // One toggle for the whole section — not one per group.
    const toggles = screen.getAllByRole("button", { name: /הצג/ });
    expect(toggles).toHaveLength(1);
    fireEvent.click(toggles[0]);
    expect(screen.getByText("ימי שלישי")).toBeInTheDocument();
    expect(screen.getByText("עיר 10")).toBeInTheDocument();
  });

  it("MEH-1903 group: the dayless 'arranged' bucket is walked LAST and is what the cap drops first", () => {
    // 4 (ראשון) + 3 (שני) + 2 dayless = 9. Cap 6 → ראשון whole, שני truncated
    // to 2, the arranged bucket never reached.
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          ...areaRows(4, { day: "ראשון", from: 1 }),
          ...areaRows(3, { day: "שני", from: 5 }),
          { id: 8, city: "עיר 08", min_order: 100 },
          { id: 9, city: "עיר 09", min_order: 100 },
        ]}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.getByText("ימי ראשון")).toBeInTheDocument();
    expect(screen.getByText("ימי שני")).toBeInTheDocument();
    expect(screen.queryByText("בתיאום מראש")).not.toBeInTheDocument();
    expect(screen.queryByText("עיר 08")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הצג עוד 3 ערים" }));
    expect(screen.getByText("בתיאום מראש")).toBeInTheDocument();
    expect(screen.getByText("עיר 09")).toBeInTheDocument();
  });

  it("MEH-1903 lock: the MEH-1435 compact city list keeps its own 15 limit, untouched by the area cap", () => {
    // 10 city-only areas: over the area cap of 6, under the compact cap of 15.
    // If the area cap leaked into compact mode this would show 6 + a toggle.
    render(
      <DeliveryBlock
        nationwide={false}
        areas={Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          city: `עיר ${String(i + 1).padStart(2, "0")}`,
        }))}
        pickup={false}
        producer={producer}
      />,
    );
    expect(screen.getByText("עיר 10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /הצג/ })).not.toBeInTheDocument();
  });

  // ---------- MEH-1772 chunk 3: per-area fee override ----------
  //
  // The whole feature turns on ONE decision — do the effective per-area fees
  // vary? — so these tests are organised around that boolean rather than
  // around the rendering. Each case pins a different way the decision can be
  // got wrong, and every one of them renders plausibly if it is.
  //
  // "Effective" means `area.delivery_fee ?? producer.delivery_fee`. The API
  // deliberately does NOT coalesce this server-side (schemas.py:849-855), so
  // an override that happens to equal the producer rate is indistinguishable
  // from an inherit — which is correct, because for DISPLAY purposes it is.
  const areaFees = () =>
    screen.queryAllByTestId("area-fee").map((el) => el.textContent);

  it("MEH-1772 (1/6) fees vary → top line states the MINIMUM with 'מ-', not a flat rate", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "תל אביב", delivery_day: "חמישי", delivery_fee: 20 },
          { id: 2, city: "חיפה", delivery_day: "חמישי", delivery_fee: 40 },
        ]}
        pickup={false}
        producer={withCost(35, null)}
      />,
    );
    expect(feeLine()).toHaveTextContent("משלוח מ-20₪");
    // The producer-level 35 must NOT appear as a flat claim — it is the
    // fallback, not the price, and stating it would misprice both areas.
    expect(feeLine()).not.toHaveTextContent("משלוח: 35₪");
  });

  it("MEH-1772 (2/6) an area with NO override inherits the producer rate, and that rate counts toward the minimum", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "תל אביב", delivery_day: "חמישי", delivery_fee: 40 },
          // no delivery_fee key at all → inherits 25
          { id: 2, city: "ירושלים", delivery_day: "חמישי" },
        ]}
        pickup={false}
        producer={withCost(25, null)}
      />,
    );
    // 25 is the minimum even though no AREA declares it.
    expect(feeLine()).toHaveTextContent("משלוח מ-25₪");
    expect(areaFees()).toEqual(["משלוח: 40₪", "משלוח: 25₪"]);
  });

  it("MEH-1772 (3/6) uniform fees → rendering is unchanged: no per-row fee, no 'מ-'", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "תל אביב", min_order: 100, delivery_day: "חמישי", delivery_fee: 30 },
          { id: 2, city: "חיפה", min_order: 120, delivery_day: "חמישי", delivery_fee: 30 },
        ]}
        pickup={false}
        producer={withCost(30, null)}
      />,
    );
    // One distinct effective value → the pre-ticket flat line.
    expect(feeLine()).toHaveTextContent("משלוח: 30₪");
    expect(feeLine()).not.toHaveTextContent("מ-");
    // And NOT one fee per row — that would restate the top line N times.
    expect(areaFees()).toEqual([]);
    // The rows still carry what they always carried — one "מינימום" per row.
    expect(screen.getAllByText("מינימום")).toHaveLength(2);
  });

  it("MEH-1772 (4/6) an area override of 0 renders 'משלוח חינם' on that row — not an absent fee", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "עתלית", delivery_day: "שישי", delivery_fee: 0 },
          { id: 2, city: "חיפה", delivery_day: "שישי", delivery_fee: 30 },
        ]}
        pickup={false}
        producer={withCost(30, null)}
      />,
    );
    // 0 is a VALUE. A truthiness gate would drop this row's fee entirely and
    // the free city would look identical to a city with no stated cost.
    expect(areaFees()).toEqual(["משלוח חינם", "משלוח: 30₪"]);
  });

  it("MEH-1772 (5/6) minimum of 0 under variance says 'משלוח מ-0₪', NOT 'משלוח חינם'", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          { id: 1, city: "עתלית", delivery_day: "שישי", delivery_fee: 0 },
          { id: 2, city: "חיפה", delivery_day: "שישי", delivery_fee: 30 },
        ]}
        pickup={false}
        producer={withCost(30, null)}
      />,
    );
    // The MEH-1577 fee===0 shortcut must be suppressed here: some areas cost
    // money, so a blanket "delivery is free" is false. This is the single
    // most consequential line in the feature — it is the only place where the
    // two 0-meanings (this area is free / the cheapest area is free) collide.
    expect(feeLine()).toHaveTextContent("משלוח מ-0₪");
    expect(feeLine()).not.toHaveTextContent("משלוח חינם");
  });

  it("MEH-1772 (6/6) varying fees keep the editorial rows — the compact city list must not swallow them", () => {
    render(
      <DeliveryBlock
        nationwide={false}
        areas={[
          // No min_order, no delivery_day → pre-ticket this collapsed to the
          // MEH-1435 compact name-only list, which has nowhere to put a fee.
          { id: 1, city: "תל אביב", delivery_fee: 20 },
          { id: 2, city: "חיפה", delivery_fee: 40 },
        ]}
        pickup={false}
        producer={withCost(null, null)}
      />,
    );
    expect(feeLine()).toHaveTextContent("משלוח מ-20₪");
    // Without the !feeVaries guard on `bare`, this is [] — the top line
    // announces variance the page then refuses to show.
    expect(areaFees()).toEqual(["משלוח: 20₪", "משלוח: 40₪"]);
  });
});
