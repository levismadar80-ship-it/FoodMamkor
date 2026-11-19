/**
 * MEH-2154 — the question chips follow the DECLARED channel, not the presence
 * of a phone number.
 *
 * Every WhatsApp-prefill row used to be gated on `normalizePhone(producer.phone)`
 * alone. "She filled in a phone" is not "she chose WhatsApp": a business whose
 * primary channel is `external_order` still got wa.me chips, and every question
 * answered there is a lead that leaves her own funnel with no order number.
 *
 * The matrix below walks all seven values of `primary_contact_method`
 * (`_ALLOWED_CONTACT_METHODS`, backend schemas.py) against the item types the
 * ticket names — stock, custom, escalation, recipe. (MEH-2385 later removed
 * the stock and recipe rows from EVERY channel; their cases below now assert
 * absence on WhatsApp too, which is strictly stronger than the gate.) Each fixture carries a
 * phone AND the backing field its own channel needs, so a hidden WhatsApp row
 * can only be explained by the channel gate and never by missing data. That is
 * the discriminating property: gate on `digits` and every non-WhatsApp row of
 * this table fails.
 *
 * THE LOAD-BEARING NEGATIVE is `expectNoWhatsApp`, and it deliberately does not
 * use `queryByTestId(...).not.toBeInTheDocument()`. A missing testid passes for
 * "the row is correctly hidden" AND for "the component threw and rendered
 * nothing" — a green with two causes. It scans EVERY anchor's href in the
 * container instead, and each case pairs it with a positive assertion that
 * something did render, so an empty block cannot masquerade as a pass.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";

// 19/11: the «שאלות נפוצות» block is closed by default; these cases test what
// is inside it, so every render opens it first (the closed state has its own
// test in QuestionChipsCollapsed.test.jsx).
const render = (...args) => {
  const result = rtlRender(...args);
  const toggle = result.container.querySelector("[data-testid='question-chips-toggle']");
  if (toggle) fireEvent.click(toggle);
  return result;
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const map = {
      delivery_to_my_area: "אפשר משלוח לאזור שלי?",
      delivery_to_city: `אפשר משלוח ל${vars?.city ?? ""}?`,
      // Must resolve to the real string: the component filters the stock list
      // against it to avoid duplicating Q2. Left unmapped it would fall back to
      // the key, the filter would miss, and an EXTRA chip would appear — which
      // would then read as a channel-gate failure.
      ordering_q: "איך מזמינים?",
      greeting_template: `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
      // MEH-3170: the wa.me suffix is catalog copy now; asserted against he.json below.
      wa_suffix: " (וואטסאפ)",
      source_line: "הגעתי דרך מהמקור",
    };
    return map[key] ?? key;
  },
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
  trackContactClick: vi.fn(),
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { CaretDown: Stub, ChatCircle: Stub, ArrowDown: Stub, Wallet: Stub };
});

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import he from "@/messages/he.json";

const WA_SUFFIX = he.whatsapp.question_chips.wa_suffix;
import { pingWhatsAppBeacon, markWhatsAppClickedLocal } from "@/lib/contact-tracking";

const PHONE = "0501234567";
const WA_DIGITS = "972501234567";

/**
 * Every backing field is present on every fixture. A row that disappears here
 * disappeared because of the CHANNEL, never because its data was missing.
 * `categories` gives the stock question ("מה יש במלאי השבוע?" — bread's
 * category-specific slot — removed in MEH-2385).
 */
const baseProducer = {
  id: 7,
  name: "חוות השקמה",
  city: "זכרון יעקב",
  phone: PHONE,
  categories: [{ name: "לחמים ואפייה" }],
  contact_email: "hi@shikma.example.com",
  website: "shikma.example.com",
  instagram: "@shikma",
  facebook: "facebook.com/shikma",
  external_order_form: "order.shikma.example.com",
};

const METHODS = ["whatsapp", "phone", "website", "email", "instagram", "facebook", "external_order"];
const NON_WHATSAPP = METHODS.filter((m) => m !== "whatsapp");

/** Every href rendered inside the block, whatever element carries it. */
const allHrefs = (container) =>
  [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));

/**
 * Assert the block contains no WhatsApp deep-link of any shape.
 *
 * Both hosts are checked because getWhatsAppHref (lib/utils.js:17-25) picks
 * between them from `matchMedia` at call time — asserting only `wa.me` would
 * pass on a desktop-shaped runtime purely because the OTHER host was used.
 * The control: the fixtures below carry delivery data, so the block always
 * renders the #section-delivery jump — at least one anchor (MEH-3460).
 */
function expectNoWhatsApp(container) {
  const hrefs = allHrefs(container);
  expect(hrefs.length, "the block rendered nothing — an empty pass").toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href).not.toContain("wa.me");
    expect(href).not.toContain("web.whatsapp.com");
  }
}

beforeEach(() => {
  pingWhatsAppBeacon.mockClear();
  markWhatsAppClickedLocal.mockClear();
});

// ============================================================
// whatsapp-primary — the regression half
// ============================================================

describe("whatsapp-primary", () => {
  const wa = { ...baseProducer, primary_contact_method: "whatsapp" };

  // MEH-2385: the category stock question no longer renders on any channel.
  // Positive control: the fixture has no delivery data, so Q1 renders as a
  // wa.me fallback chip — an empty render cannot pass as "stock hidden".
  it("does not render the category stock question (MEH-2385)", () => {
    const { container } = render(<WhatsAppQuestionChips producer={wa} />);
    expect(container.textContent).not.toContain("אילו לחמים יש השבוע?");
    expect(screen.getByTestId("question-link").getAttribute("href")).toContain("wa.me");
  });

  it("renders custom questions as WhatsApp links", () => {
    const { container } = render(
      <WhatsAppQuestionChips producer={{ ...wa, custom_questions: ["יש חלה לשבת?"] }} />,
    );
    const href = screen.getByText(`יש חלה לשבת?${WA_SUFFIX}`).closest("a").getAttribute("href");
    expect(decodeURIComponent(href)).toBe(
      `https://wa.me/${WA_DIGITS}?text=שלום חוות השקמה, יש חלה לשבת?\n\nהגעתי דרך מהמקור`,
    );
    expect(container.textContent).not.toContain("אילו לחמים יש השבוע?");
  });

  // MEH-3460 (Sapir 20/11): «שאלה אחרת? צרו איתנו קשר» opened the same chat
  // as the primary button above the block. Gone on every channel.
  it("renders no «שאלה אחרת?» escalation row (MEH-3460)", () => {
    const { container } = render(<WhatsAppQuestionChips producer={wa} />);
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("שאלה אחרת");
    // positive control: the block rendered its Q1 chip
    expect(screen.getByTestId("question-link")).toBeInTheDocument();
  });

  it("renders no recipe-idea row, even on WhatsApp (MEH-2385)", () => {
    render(<WhatsAppQuestionChips producer={wa} />);
    expect(screen.queryByTestId("recipe-idea-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("question-link")).toBeInTheDocument();
  });

  it("fires both attribution calls on a WhatsApp chip", () => {
    render(<WhatsAppQuestionChips producer={wa} />);
    fireEvent.click(screen.getByTestId("question-link"));
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledTimes(1);
  });

  it("treats a NULL primary_contact_method as WhatsApp, exactly as before", () => {
    // Column(String(20), default="whatsapp") is a Python-side default
    // (backend models.py:71), so rows written around the ORM read NULL — and
    // NULL has always behaved as WhatsApp via getPrimaryMethod's fallback. A
    // strict `=== "whatsapp"` predicate would silently strip these rows.
    const { primary_contact_method: _omitted, ...noMethod } = wa;
    render(
      <WhatsAppQuestionChips producer={{ ...noMethod, custom_questions: ["יש חלה לשבת?"] }} />,
    );
    expect(screen.getByText(`יש חלה לשבת?${WA_SUFFIX}`).closest("a").getAttribute("href")).toContain("wa.me");
  });
});

// ============================================================
// the other six channels — zero wa.me
// ============================================================

describe.each(NON_WHATSAPP)("%s-primary", (method) => {
  // offers_delivery → the #section-delivery jump renders: the anchor that
  // keeps expectNoWhatsApp's control honest.
  const producer = { ...baseProducer, primary_contact_method: method, offers_delivery: true };

  it("renders zero WhatsApp links anywhere in the block", () => {
    const { container } = render(<WhatsAppQuestionChips producer={producer} />);
    expectNoWhatsApp(container);
  });

  it("hides the stock question chip", () => {
    const { container } = render(<WhatsAppQuestionChips producer={producer} />);
    expect(container.textContent).not.toContain("אילו לחמים יש השבוע?");
  });

  it("hides custom question chips too", () => {
    const { container } = render(
      <WhatsAppQuestionChips producer={{ ...producer, custom_questions: ["יש חלה לשבת?"] }} />,
    );
    expect(container.textContent).not.toContain("יש חלה לשבת?");
    expectNoWhatsApp(container);
  });

  it("hides the recipe-idea chip (its prefill is WhatsApp-locked)", () => {
    render(<WhatsAppQuestionChips producer={producer} />);
    expect(screen.queryByTestId("recipe-idea-link")).not.toBeInTheDocument();
  });

  it("renders no escalation row (MEH-3460)", () => {
    render(<WhatsAppQuestionChips producer={producer} />);
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-answer-jump")).toBeInTheDocument();
  });
});

// ============================================================
// details that only bite on one channel
// ============================================================

describe("channel gate details", () => {
  it("hides the WhatsApp FALLBACK for Q1 when WhatsApp is not primary", () => {
    // With no delivery data Q1 has no in-page answer and used to fall back to a
    // wa.me link. A fallback that opens WhatsApp is a WhatsApp row like any
    // other, so it moves behind the same gate. payment_info keeps the block
    // alive, so this is a hidden row and not a dead component.
    render(
      <WhatsAppQuestionChips
        producer={{
          ...baseProducer,
          primary_contact_method: "website",
          payment_info: { methods: ["bit"], timing: null, note: null },
        }}
      />,
    );
    expect(screen.queryByTestId("question-link")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("quick-answer-toggle").length).toBe(1);
  });

  it("renders the whole block as null when there is nothing to answer", () => {
    // MEH-3460: with the escalation row gone, a business with a channel but no
    // data and no WhatsApp has no block at all — the button above is the way.
    const { container } = render(
      <WhatsAppQuestionChips producer={{ ...baseProducer, primary_contact_method: "website" }} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
