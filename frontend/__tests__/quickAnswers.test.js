import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import he from "../messages/he.json";
import { buildDeliveryAnswer, buildOrderingAnswer } from "@/lib/quickAnswers";

// MEH-1302 — Quick Answers. Two layers under test:
//   1. pure answer logic (buildDeliveryAnswer / buildOrderingAnswer) — every branch
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
  return { CaretDown: Stub, ChatCircle: Stub };
});

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";

const PHONE = "0501234567";

// ─────────────────────────────────────────────────────────────────────────────
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

  it("offers delivery but no specifics → null (WhatsApp fallback)", () => {
    expect(buildDeliveryAnswer({ offers_delivery: true, has_physical_location: true })).toBeNull();
  });

  it("no data at all → null", () => {
    expect(buildDeliveryAnswer({ offers_delivery: false, has_physical_location: false })).toBeNull();
    expect(buildDeliveryAnswer(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("buildOrderingAnswer (MEH-1302)", () => {
  it("whatsapp (explicit or default) → { kind: whatsapp }", () => {
    expect(buildOrderingAnswer({ primary_contact_method: "whatsapp" })).toEqual({ kind: "whatsapp" });
    expect(buildOrderingAnswer({})).toEqual({ kind: "whatsapp" });
  });

  it("external_order with a form → external link", () => {
    expect(
      buildOrderingAnswer({ primary_contact_method: "external_order", external_order_form: "order.co.il" }),
    ).toEqual({ kind: "external_order", href: "https://order.co.il" });
  });

  it("external_order without a form → null", () => {
    expect(buildOrderingAnswer({ primary_contact_method: "external_order" })).toBeNull();
  });

  it("phone → tel href + display phone", () => {
    expect(buildOrderingAnswer({ primary_contact_method: "phone", phone: PHONE })).toEqual({
      kind: "phone",
      href: `tel:${PHONE}`,
      phone: PHONE,
    });
  });

  it("phone without a number → null", () => {
    expect(buildOrderingAnswer({ primary_contact_method: "phone" })).toBeNull();
  });

  it("website / instagram / facebook / email → channel link", () => {
    expect(buildOrderingAnswer({ primary_contact_method: "website", website: "shop.co.il" })).toEqual({
      kind: "website",
      href: "https://shop.co.il",
    });
    expect(buildOrderingAnswer({ primary_contact_method: "instagram", instagram: "@handle" })).toEqual({
      kind: "instagram",
      href: "https://instagram.com/handle",
    });
    expect(buildOrderingAnswer({ primary_contact_method: "facebook", facebook: "fb.com/page" })).toEqual({
      kind: "facebook",
      href: "https://fb.com/page",
    });
    expect(buildOrderingAnswer({ primary_contact_method: "email", contact_email: "a@b.co.il" })).toEqual({
      kind: "email",
      href: "mailto:a@b.co.il",
    });
  });

  it("null producer → null", () => {
    expect(buildOrderingAnswer(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("WhatsAppQuestionChips (MEH-1302)", () => {
  it("renders the 'שאלות נפוצות' heading", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "חיפה" }} />);
    expect(screen.getByText("שאלות נפוצות:")).toBeInTheDocument();
  });

  it("nationwide → delivery disclosure reveals the in-page answer", () => {
    render(
      <WhatsAppQuestionChips producer={{ phone: PHONE, city: "תל אביב", delivery_nationwide: true }} />,
    );
    const toggle = screen.getByRole("button", { name: /אפשר משלוח לתל אביב/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("כן! משלוחים לכל הארץ")).toBeInTheDocument();
  });

  it("delivery_areas → cities + '+ עוד N' + min/day sub-line", () => {
    render(
      <WhatsAppQuestionChips
        producer={{
          phone: PHONE,
          city: "חיפה",
          delivery_areas: [
            { city: "חיפה", min_order: 150, delivery_day: "חמישי" },
            { city: "עכו", min_order: 200 },
            { city: "נהריה" },
            { city: "כרמיאל" },
            { city: "צפת" },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /אפשר משלוח/ }));
    expect(screen.getByText(/משלוחים ל: חיפה, עכו, נהריה, כרמיאל \+ עוד 1/)).toBeInTheDocument();
    expect(screen.getByText(/מינימום 150₪ · ימי משלוח: חמישי/)).toBeInTheDocument();
  });

  it("ordering via external_order → disclosure with the order-form link", () => {
    render(
      <WhatsAppQuestionChips
        producer={{
          phone: PHONE,
          city: "חיפה",
          primary_contact_method: "external_order",
          external_order_form: "order.example.com",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /איך מזמינים/ }));
    expect(screen.getByText(/מזמינים דרך טופס ההזמנות/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "למעבר" });
    expect(link).toHaveAttribute("href", "https://order.example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("no delivery data → Q1 falls back to a WhatsApp link", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "רעננה" }} />);
    const links = screen.getAllByTestId("question-link");
    expect(links[0]).toHaveTextContent("אפשר משלוח לרעננה?");
    expect(links[0].getAttribute("href")).toContain("wa.me");
  });

  it("no phone but data present → block renders answers, no WhatsApp items, no escalation", () => {
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
    expect(screen.getAllByTestId("quick-answer-toggle")).toHaveLength(2); // delivery + ordering
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

  it("escalation appears only when a phone exists", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "חיפה" }} />);
    expect(screen.getByTestId("escalation-link")).toHaveTextContent("שאלה אחרת? שלחו לנו הודעה");
  });

  // MEH-1462 — recipe-idea chip: last in the row, WhatsApp-only, exact prefill.
  it("recipe-idea chip renders with a phone, opens WhatsApp with the Sapir-locked prefill", () => {
    render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "חיפה" }} />);
    const link = screen.getByTestId("recipe-idea-link");
    expect(link).toHaveTextContent("יש לי רעיון למתכון");
    const href = link.getAttribute("href");
    expect(href).toContain("wa.me");
    expect(decodeURIComponent(href)).toContain(
      "היי! הגעתי מהעמוד שלכם במהמקור — יש לי רעיון למתכון עם המוצרים שלכם:",
    );
  });

  it("recipe-idea chip is rendered LAST — after the escalation link", () => {
    const { container } = render(<WhatsAppQuestionChips producer={{ phone: PHONE, city: "חיפה" }} />);
    const testids = [...container.querySelectorAll("[data-testid]")].map((el) =>
      el.getAttribute("data-testid"),
    );
    const esc = testids.lastIndexOf("escalation-link");
    const recipe = testids.lastIndexOf("recipe-idea-link");
    expect(esc).toBeGreaterThanOrEqual(0);
    expect(recipe).toBeGreaterThan(esc);
  });

  it("recipe-idea chip is gated on a contact channel — absent without a phone", () => {
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
    expect(screen.queryByTestId("recipe-idea-link")).not.toBeInTheDocument();
  });
});
