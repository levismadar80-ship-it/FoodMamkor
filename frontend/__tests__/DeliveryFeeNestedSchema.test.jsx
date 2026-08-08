import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProducerDetailSchema } from "@/lib/schemas";

/**
 * MEH-1942 — `delivery_areas[].delivery_fee` survives the Zod parse.
 *
 * WHY THIS FILE PARSES INSTEAD OF HANDING THE COMPONENT A LITERAL.
 * The defect is in the schema, not the component: `DeliveryBlock` reads
 * `da.delivery_fee` correctly (`:429`, `:447`) and the API serializes it
 * per-area on purpose (`schemas.py:911`). What removed it was the nested
 * `z.object` in `schemas.js`, which strips undeclared keys — and `.loose()` at
 * the call site (`useProducerData.js:26`) is TOP-LEVEL ONLY, so it never
 * reaches inside the `delivery_areas` array.
 *
 * A component test built from a literal `areas` array therefore proves nothing
 * here: it passes identically against the broken schema and the fixed one,
 * because the literal never goes through the thing that was broken. Every case
 * below feeds the payload through `ProducerDetailSchema.loose()` first — the
 * real schema, not a copy — and renders what comes out.
 *
 * ADR-032 §3.6: the cases assert the BEHAVIOUR a visitor sees, not that the
 * prescribed one-line edit was applied. A test reading
 * `'delivery_fee' in ProducerDetailSchema.shape…` would go green on an edit
 * that declared the field with the wrong type and never render a thing.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    if (key === "fee") return `משלוח: ${vars?.amount ?? ""}`;
    if (key === "fee_from") return `משלוח מ-${vars?.amount ?? ""}`;
    if (key === "fee_free") return "משלוח חינם";
    if (key === "free_above") return `מעל ${vars?.amount ?? ""} — חינם`;
    if (key === "delivery_day_group") return `ימי ${vars?.day ?? ""}`;
    if (key === "delivery_day_label") return `משלוח ביום ${vars?.day ?? ""}`;
    if (key === "dispatch_days") return `יוצאים בימי ${vars?.day ?? ""}`;
    const map = {
      heading: "משלוחים",
      min_order: "מינימום",
      arranged: "בתיאום מראש",
      arranged_group: "בתיאום מראש",
      show_less: "הצג פחות",
      pickup: "איסוף עצמי",
      free: "חינם",
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

const ProducerDetailLoose = ProducerDetailSchema.loose();

/** The shape the API actually returns, parsed the way the page parses it. */
const parseProducer = (overrides) =>
  ProducerDetailLoose.parse({
    id: "p1",
    name: "משק הרל",
    phone: "0501234567",
    ...overrides,
  });

describe("MEH-1942 — the nested delivery_fee survives the parse", () => {
  it("keeps a per-area delivery_fee of 0 instead of stripping it to undefined", () => {
    // The whole defect in one assertion. Before the fix the nested z.object
    // declares four keys and strips the fifth, so this reads `undefined` — and
    // `undefined` is what makes `?? producerFee` fire in the component.
    //
    // `0` and not some other number ON PURPOSE: `DeliveryBlock.jsx:318` states
    // that 0 is a VALUE ("delivery is free"), distinct from NULL ("not
    // stated"). A stripped 30 would render the producer rate and merely look
    // wrong; a stripped 0 renders a CHARGE where delivery is free, which is a
    // false number shown to a customer.
    const p = parseProducer({
      delivery_fee: 25,
      delivery_areas: [
        { id: "a1", city: "חיפה", delivery_fee: 0, delivery_day: "ראשון" },
        { id: "a2", city: "עכו", delivery_fee: 30, delivery_day: "ראשון" },
      ],
    });
    expect(p.delivery_areas[0].delivery_fee).toBe(0);
    expect(p.delivery_areas[1].delivery_fee).toBe(30);
  });

  it("renders משלוח חינם for the free city — not the producer's 25₪", () => {
    // The behavioural half. Two areas, because per-area fees only render under
    // variance (`feeVaries`, `:430`); a single free area is a DIFFERENT and
    // still-open gap, pinned in its own case below rather than hidden here.
    const p = parseProducer({
      delivery_fee: 25,
      delivery_areas: [
        { id: "a1", city: "חיפה", delivery_fee: 0, delivery_day: "ראשון" },
        { id: "a2", city: "עכו", delivery_fee: 30, delivery_day: "ראשון" },
      ],
    });
    render(<DeliveryBlock producer={p} areas={p.delivery_areas} />);

    const fees = screen.getAllByTestId("area-fee").map((n) => n.textContent);
    expect(fees).toContain("משלוח חינם");
    // And the free row must not carry ANY amount — before the fix both rows
    // resolved to the producer's 25 and neither said חינם.
    expect(fees.some((f) => f.includes("25"))).toBe(false);
    expect(fees.some((f) => f.includes("30"))).toBe(true);
  });

  it("still inherits the producer rate for an area that states no fee", () => {
    // The control. Declaring the field must not turn "not stated" into 0 —
    // that would invert the bug rather than fix it, and would show משלוח חינם
    // to a customer who will be charged. An area with the key absent must
    // still fall through to the producer-level rate.
    const p = parseProducer({
      delivery_fee: 25,
      delivery_areas: [
        { id: "a1", city: "חיפה", delivery_fee: 0, delivery_day: "ראשון" },
        { id: "a2", city: "עכו", delivery_day: "ראשון" },
      ],
    });
    expect(p.delivery_areas[1].delivery_fee ?? null).toBeNull();

    render(<DeliveryBlock producer={p} areas={p.delivery_areas} />);
    const fees = screen.getAllByTestId("area-fee").map((n) => n.textContent);
    expect(fees).toContain("משלוח חינם");
    expect(fees.some((f) => f.includes("25"))).toBe(true);
  });

  it("declares every field DeliveryAreaOut serializes — no other nested strip", () => {
    // DoD item 3, as an assertion rather than a claim in the PR body. The
    // backend model (`schemas.py:900-913`) serializes exactly these five; a
    // sixth added there without a matching declaration here would silently
    // vanish the same way delivery_fee did, and this case is what notices.
    const p = parseProducer({
      delivery_areas: [
        {
          id: "a1",
          city: "חיפה",
          min_order: 150,
          delivery_day: "ראשון",
          delivery_fee: 20,
        },
      ],
    });
    expect(Object.keys(p.delivery_areas[0]).sort()).toEqual([
      "city",
      "delivery_day",
      "delivery_fee",
      "id",
      "min_order",
    ]);
  });
});

describe("MEH-1942 — the gap this ticket does NOT close", () => {
  it("shows the producer rate when a lone area overrides it (documented, not fixed)", () => {
    // Recorded because the ticket's own DoD proposed exactly this payload as
    // its discriminating case — one area at 0 against a producer rate of 25,
    // expecting "חינם" — and the prescribed one-line schema fix does NOT
    // produce that. It was measured, not assumed.
    //
    // Why: the component only consults per-area fees when they VARY
    // (`:430` `new Set(effectiveFees).size > 1`). With a single area the set
    // has one member, `feeVaries` is false, and the top line is built from
    // `producer.delivery_fee` (`:453`) while the row renders no fee at all.
    // The schema is no longer the thing withholding the value — the component
    // is choosing not to read it.
    //
    // Left as-is deliberately: changing that selection rule is a behaviour
    // change to a shared surface, outside this card's stated scope
    // ("frontend/lib/schemas.js — one declared line + a test"). Reported on
    // the card instead of quietly widened. This case PINS the current
    // behaviour so the follow-up has a starting point that is measured rather
    // than remembered — and so nobody reads the ticket and assumes it shipped.
    const p = parseProducer({
      delivery_fee: 25,
      delivery_areas: [{ id: "a1", city: "חיפה", delivery_fee: 0, delivery_day: "ראשון" }],
    });
    // The value IS there after the fix — that part works.
    expect(p.delivery_areas[0].delivery_fee).toBe(0);

    render(<DeliveryBlock producer={p} areas={p.delivery_areas} />);
    // …and the surface still states the producer rate, because nothing reads it.
    expect(screen.queryAllByTestId("area-fee")).toHaveLength(0);
    expect(document.body.textContent).toContain("25");
  });
});
