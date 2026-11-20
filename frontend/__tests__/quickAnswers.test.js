import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import he from "../messages/he.json";
import { buildDeliveryAnswer, hasDeliverySection } from "@/lib/quickAnswers";

// MEH-1302 — Quick Answers. Two layers under test:
//   1. pure answer logic (buildDeliveryAnswer / hasDeliverySection) — every branch
//   2. WhatsAppQuestionChips rendering — disclosure vs WhatsApp routing, no-phone edge

// ── next-intl: resolve real he.json copy so assertions read the shipped strings.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const dict = ns.split(".").reduce((o, k) => o?.[k], he);
    let s = dict?.[key] ?? `${ns}.${key}`;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  },
}));

// Phosphor icons → inert spans.
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { CaretDown: Stub, ChatCircle: Stub, ArrowDown: Stub };
});

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";

const PHONE = "0501234567";

// ─────────────────────────────────────────────────────────────────────────────
describe("visitor city in the delivery question (MEH-2602)", () => {
  afterEach(() => localStorage.clear());

  it("names the city the visitor picked, not the business's", async () => {
    localStorage.setItem("user_city", "חדרה");
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "רעננה" }} />);
    const links = await screen.findAllByTestId("question-link");
    await waitFor(() => expect(links[0]).toHaveTextContent("חדרה"));
    expect(links[0]).not.toHaveTextContent("רעננה");
  });
});

describe("buildDeliveryAnswer (MEH-1302)", () => {
  it("nationwide, no exclusions → { kind: nationwide }", () => {
    expect(buildDeliveryAnswer({ delivery_nationwide: true })).toEqual({ kind: "nationwide" });
  });

  it("nationwide + exclusions → { kind: nationwide_except, cities }", () => {
    expect(
      buildDeliveryAnswer({ delivery_nationwide: true, delivery_excluded_cities: ["אילת", "מטולה"] }),
    ).toEqual({ kind: "nationwide_except", cities: ["אילת", "מטולה"] });
  });

  it("nationwide + empty/blank exclusions → plain nationwide", () => {
    expect(
      buildDeliveryAnswer({ delivery_nationwide: true, delivery_excluded_cities: ["", null] }),
    ).toEqual({ kind: "nationwide" });
  });

  it("delivery_areas → cities capped at 4, moreCount, min (lowest), distinct days", () => {
    const answer = buildDeliveryAnswer({
      delivery_areas: [
        { city: "חיפה", min_order: 200, delivery_day: "חמישי" },
        { city: "עכו", min_order: 150, delivery_day: "שני" },
        { city: "נהריה", delivery_day: "חמישי" },
        { city: "כרמיאל" },
        { city: "צפת" },
      ],
    });
    expect(answer).toEqual({
      kind: "areas",
      cities: ["חיפה", "עכו", "נהריה", "כרמיאל"],
      moreCount: 1,
      minOrder: 150,
      deliveryDay: "חמישי, שני",
    });
  });

  it("delivery_areas without min/day → null min, null day", () => {
    const answer = buildDeliveryAnswer({ delivery_areas: [{ city: "מודיעין" }] });
    expect(answer).toMatchObject({ kind: "areas", minOrder: null, deliveryDay: null, moreCount: 0 });
  });

  it("no delivery + physical location → pickup_only with city", () => {
    expect(
      buildDeliveryAnswer({ offers_delivery: false, has_physical_location: true, city: "ירושלים" }),
    ).toEqual({ kind: "pickup_only", city: "ירושלים" });
  });

  it("pickup_only tolerates a missing city (null)", () => {
    expect(
      buildDeliveryAnswer({ offers_delivery: false, has_physical_location: true }),
    ).toEqual({ kind: "pickup_only", city: null });
  });

  it("MEH-1512: a single pickup location names that city (from locations[])", () => {
    expect(
      buildDeliveryAnswer({
        offers_delivery: false,
        has_physical_location: true,
        city: "ירושלים",
        locations: [{ kind: "pickup", city: "חיפה" }],
      }),
    ).toEqual({ kind: "pickup_only", city: "חיפה" });
  });

  it("MEH-1512: multiple distinct pickup cities → null city (no single-city claim)", () => {
    expect(
      buildDeliveryAnswer({
        offers_delivery: false,
        has_physical_location: true,
        city: "ירושלים",
        locations: [
          { kind: "pickup", city: "חיפה" },
          { kind: "market_stand", city: "עכו" },
          { kind: "branch", city: "נהריה" },
        ],
      }),
    ).toEqual({ kind: "pickup_only", city: null });
  });

  it("offers delivery but no specifics → null (WhatsApp fallback)", () => {
    expect(buildDeliveryAnswer({ offers_delivery: true, has_physical_location: true })).toBeNull();
  });

  it("no data at all → null", () => {
    expect(buildDeliveryAnswer({ offers_delivery: false, has_physical_location: false })).toBeNull();
    expect(buildDeliveryAnswer(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("hasDeliverySection — the business page's own delivery-section gate", () => {
  it("true for offers_delivery, delivery_areas rows or pickup_points", () => {
    expect(hasDeliverySection({ offers_delivery: true })).toBe(true);
    expect(hasDeliverySection({ delivery_areas: [{ city: "חדרה" }] })).toBe(true);
    expect(hasDeliverySection({ pickup_points: "שוק" })).toBe(true);
  });

  it("false with none of them (nationwide flag alone, pickup-only, null)", () => {
    expect(hasDeliverySection({ delivery_nationwide: true })).toBe(false);
    expect(hasDeliverySection({ offers_delivery: false, has_physical_location: true })).toBe(false);
    expect(hasDeliverySection(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("WhatsAppQuestionChips (MEH-1302)", () => {
  it("renders the 'שאלות נפוצות' heading", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "חיפה" }} />);
    // MEH-2592 C: the heading lost its trailing colon (approved mock).
    expect(screen.getByText("שאלות נפוצות")).toBeInTheDocument();
  });

  it("nationwide → delivery disclosure reveals the in-page answer", () => {
    render(
      <WhatsAppQuestionChips producer={{ phone: PHONE, city: "תל אביב", delivery_nationwide: true }} />,
    );
    const toggle = screen.getByRole("button", { name: /אפשר משלוח ל/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("כן! משלוחים לכל הארץ")).toBeInTheDocument();
  });

  // Sapir 19/11 (screenshot, prod): «משלוחים ל: … + עוד 44» answered with a
  // cut list while the full «משלוח» section sat lower on the same page. When
  // that section renders, the question is a jump to it, not a second copy.
  it("delivery section on the page → the question is not asked at all", () => {
    // Sapir 20/11: the FAQ section sits right under «משלוחים», so the
    // section IS the answer — no cut list, no jump, no second copy.
    render(
      <WhatsAppQuestionChips
        producer={{
          phone: PHONE,
          city: "חיפה",
          primary_contact_method: "whatsapp",
          offers_delivery: true,
          delivery_areas: [
            { city: "חיפה", min_order: 150, delivery_day: "חמישי" },
            { city: "עכו", min_order: 200 },
            { city: "נהריה" },
            { city: "כרמיאל" },
            { city: "צפת" },
          ],
          // control: the block itself still renders (her own question)
          custom_questions: ["יש חלה לשבת?"],
        }}
      />,
    );
    expect(screen.getByTestId("question-link")).toHaveTextContent("יש חלה לשבת?");
    expect(screen.queryByText(/אפשר משלוח/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+ עוד/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("quick-answer-jump")).not.toBeInTheDocument();
  });

  // Sapir 19/11: «איך מזמינים?» sat right under the «להזמנה» button and
  // answered with the same link. The answer was built FROM the button
  // (getPrimaryContactHref), so it could only ever repeat it.
  it("never asks «איך מזמינים?» — the button above already answers it", () => {
    render(
      <WhatsAppQuestionChips
        producer={{
          phone: PHONE,
          city: "חיפה",
          primary_contact_method: "external_order",
          external_order_form: "order.example.com",
          delivery_nationwide: true,
        }}
      />,
    );
    expect(screen.queryByText(/איך מזמינים/)).not.toBeInTheDocument();
    // positive control: the block itself rendered
    expect(screen.getByRole("button", { name: /אפשר משלוח/ })).toBeInTheDocument();
  });

  it("no delivery data → Q1 falls back to a WhatsApp link", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "רעננה" }} />);
    const links = screen.getAllByTestId("question-link");
    // MEH-2602: no visitor city stored → the generic «my area», never «רעננה».
    expect(links[0]).not.toHaveTextContent("רעננה");
    expect(links[0].getAttribute("href")).toContain("wa.me");
  });

  // MEH-3460: the «שאלה אחרת?» escalation row is gone (it opened the same
  // channel as the primary button), so the answers are the whole block.
  it("no phone but data present → answers render, zero WhatsApp items, no escalation row", () => {
    render(
      <WhatsAppQuestionChips
        producer={{
          city: "צפת",
          delivery_nationwide: true,
          primary_contact_method: "external_order",
          external_order_form: "order.example.com",
        }}
      />,
    );
    expect(screen.getAllByTestId("quick-answer-toggle")).toHaveLength(1); // delivery only (ordering = the button)
    expect(screen.queryByTestId("question-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
  });

  it("no phone and no data → renders nothing", () => {
    const { container } = render(
      <WhatsAppQuestionChips
        producer={{ city: "אילת", offers_delivery: false, has_physical_location: false }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // MEH-2385 — the recipe-idea row (MEH-1462) and the category stock question
  // are gone from the block. The Q1 WhatsApp chip is the positive control: a
  // render that produced nothing would also pass the two negatives alone.
  it("renders neither the recipe-idea row nor a stock question, even with a phone", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "חיפה", categories: [{ name: "לחמים ואפייה" }] }} />);
    expect(screen.queryByTestId("recipe-idea-link")).not.toBeInTheDocument();
    expect(screen.queryByText("אילו לחמים יש השבוע?")).not.toBeInTheDocument();
    expect(screen.getByTestId("question-link").getAttribute("href")).toContain("wa.me");
  });
});
