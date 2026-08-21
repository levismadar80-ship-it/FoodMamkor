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
 * (`_ALLOWED_CONTACT_METHODS`, backend schemas.py) against the four item types
 * the ticket names — stock, custom, escalation, recipe. Each fixture carries a
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
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const map = {
      my_area: "האזור שלי",
      delivery_to_city: `אפשר משלוח ל${vars?.city ?? ""}?`,
      // Must resolve to the real string: the component filters the stock list
      // against it to avoid duplicating Q2. Left unmapped it would fall back to
      // the key, the filter would miss, and an EXTRA chip would appear — which
      // would then read as a channel-gate failure.
      ordering_q: "איך מזמינים?",
      greeting_template: `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
      source_line: "הגעתי דרך מהמקור",
      recipe_idea_message: "יש לי רעיון למתכון",
      escalation: "שאלה אחרת? שלחו לנו הודעה",
      escalation_email_subject: "שאלה דרך מהמקור",
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
  return { CaretDown: Stub, ChatCircle: Stub };
});

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { pingWhatsAppBeacon, markWhatsAppClickedLocal } from "@/lib/contact-tracking";

const PHONE = "0501234567";
const WA_DIGITS = "972501234567";

/**
 * Every backing field is present on every fixture. A row that disappears here
 * disappeared because of the CHANNEL, never because its data was missing.
 * `categories` gives the stock question ("מה יש במלאי השבוע?" — bread's
 * category-specific slot, categoryQuestions.js).
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

/** The seven values of primary_contact_method + the href each must escalate to. */
const CHANNELS = [
  { method: "whatsapp", escalationHref: null /* asserted separately, byte-exact */ },
  { method: "phone", escalationHref: `tel:${PHONE}` },
  { method: "website", escalationHref: "https://shikma.example.com" },
  {
    method: "email",
    escalationHref: `mailto:hi@shikma.example.com?subject=${encodeURIComponent("שאלה דרך מהמקור")}`,
  },
  { method: "instagram", escalationHref: "https://instagram.com/shikma" },
  { method: "facebook", escalationHref: "https://facebook.com/shikma" },
  { method: "external_order", escalationHref: "https://order.shikma.example.com" },
];

const NON_WHATSAPP = CHANNELS.filter((c) => c.method !== "whatsapp");

/** Every href rendered inside the block, whatever element carries it. */
const allHrefs = (container) =>
  [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));

/**
 * Assert the block contains no WhatsApp deep-link of any shape.
 *
 * Both hosts are checked because getWhatsAppHref (lib/utils.js:17-25) picks
 * between them from `matchMedia` at call time — asserting only `wa.me` would
 * pass on a desktop-shaped runtime purely because the OTHER host was used.
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
// whatsapp-primary — the regression half: nothing may change
// ============================================================

describe("whatsapp-primary — byte-identical to the pre-MEH-2154 behaviour", () => {
  const wa = { ...baseProducer, primary_contact_method: "whatsapp" };

  it("renders the stock question as a WhatsApp link with the greeting prefill", () => {
    render(<WhatsAppQuestionChips producer={wa} />);
    const href = screen.getByText("אילו לחמים יש השבוע?").closest("a").getAttribute("href");
    expect(decodeURIComponent(href)).toBe(
      `https://wa.me/${WA_DIGITS}?text=שלום חוות השקמה, אילו לחמים יש השבוע?\n\nהגעתי דרך מהמקור`,
    );
  });

  it("renders custom questions as WhatsApp links, replacing the stock set", () => {
    const { container } = render(
      <WhatsAppQuestionChips producer={{ ...wa, custom_questions: ["יש חלה לשבת?"] }} />,
    );
    const href = screen.getByText("יש חלה לשבת?").closest("a").getAttribute("href");
    expect(decodeURIComponent(href)).toBe(
      `https://wa.me/${WA_DIGITS}?text=שלום חוות השקמה, יש חלה לשבת?\n\nהגעתי דרך מהמקור`,
    );
    // custom REPLACES the category defaults (categoryQuestions.js:88).
    expect(container.textContent).not.toContain("אילו לחמים יש השבוע?");
  });

  it("escalates through WhatsApp on the greeting template", () => {
    render(<WhatsAppQuestionChips producer={wa} />);
    const href = screen.getByTestId("escalation-link").getAttribute("href");
    expect(decodeURIComponent(href)).toBe(
      `https://wa.me/${WA_DIGITS}?text=שלום חוות השקמה, שאלה אחרת? שלחו לנו הודעה\n\nהגעתי דרך מהמקור`,
    );
  });

  it("keeps the recipe-idea chip on its own locked prefill (MEH-1462)", () => {
    render(<WhatsAppQuestionChips producer={wa} />);
    const href = screen.getByTestId("recipe-idea-link").getAttribute("href");
    expect(decodeURIComponent(href)).toBe(
      `https://wa.me/${WA_DIGITS}?text=יש לי רעיון למתכון\n\nהגעתי דרך מהמקור`,
    );
  });

  it("still fires both attribution calls on a WhatsApp escalation", () => {
    render(<WhatsAppQuestionChips producer={wa} />);
    fireEvent.click(screen.getByTestId("escalation-link"));
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledTimes(1);
  });

  it("treats a NULL primary_contact_method as WhatsApp, exactly as before", () => {
    // Column(String(20), default="whatsapp") is a Python-side default
    // (backend models.py:71), so rows written around the ORM read NULL — and
    // NULL has always behaved as WhatsApp via getPrimaryMethod's fallback. A
    // strict `=== "whatsapp"` predicate would silently strip these rows.
    const { primary_contact_method: _omitted, ...noMethod } = wa;
    render(<WhatsAppQuestionChips producer={noMethod} />);
    expect(
      screen.getByText("אילו לחמים יש השבוע?").closest("a").getAttribute("href"),
    ).toContain("wa.me");
    expect(screen.getByTestId("recipe-idea-link")).toBeInTheDocument();
  });
});

// ============================================================
// the other six channels — zero wa.me, escalation alive
// ============================================================

describe.each(NON_WHATSAPP)("$method-primary", ({ method, escalationHref }) => {
  const producer = { ...baseProducer, primary_contact_method: method };

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

  it("keeps the escalation row, pointed at the primary channel", () => {
    render(<WhatsAppQuestionChips producer={producer} />);
    expect(screen.getByTestId("escalation-link")).toHaveAttribute("href", escalationHref);
  });

  it("fires no WhatsApp attribution when the escalation is clicked", () => {
    render(<WhatsAppQuestionChips producer={producer} />);
    fireEvent.click(screen.getByTestId("escalation-link"));
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });
});

// ============================================================
// details that only bite on one channel
// ============================================================

describe("escalation link mechanics", () => {
  it("does not open tel: or mailto: in a new tab", () => {
    // A new tab that immediately hands off to the OS dialer/mail client leaves
    // a blank window behind on mobile.
    for (const method of ["phone", "email"]) {
      const { unmount } = render(
        <WhatsAppQuestionChips producer={{ ...baseProducer, primary_contact_method: method }} />,
      );
      expect(screen.getByTestId("escalation-link")).not.toHaveAttribute("target");
      unmount();
    }
  });

  it("opens website / instagram / facebook / external_order in a new tab, safely", () => {
    for (const method of ["website", "instagram", "facebook", "external_order"]) {
      const { unmount } = render(
        <WhatsAppQuestionChips producer={{ ...baseProducer, primary_contact_method: method }} />,
      );
      const link = screen.getByTestId("escalation-link");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      unmount();
    }
  });

  it("carries a subject on the mailto so the owner's inbox shows the intent", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...baseProducer, primary_contact_method: "email" }}
      />,
    );
    const href = screen.getByTestId("escalation-link").getAttribute("href");
    expect(decodeURIComponent(href)).toBe("mailto:hi@shikma.example.com?subject=שאלה דרך מהמקור");
  });

  it("hides the escalation when the declared channel has no backing field", () => {
    // Not a regression of "escalation never disappears" — that lock is about
    // never hiding it while a channel EXISTS. With email declared and no
    // address stored there is nothing to link to, and a dead href is worse
    // than no row.
    const { container } = render(
      <WhatsAppQuestionChips
        producer={{
          city: "צפת",
          delivery_nationwide: true,
          primary_contact_method: "email",
          contact_email: "",
        }}
      />,
    );
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
    // …and the block still rendered its data answers, so this is a hidden row
    // and not a dead component.
    expect(screen.getAllByTestId("quick-answer-toggle").length).toBeGreaterThan(0);
    // `expectNoWhatsApp` is deliberately NOT used here: its control demands at
    // least one anchor, and this is the one case that legitimately renders
    // none. Assert that directly instead — zero anchors is strictly stronger
    // than "no anchor contains wa.me".
    expect(allHrefs(container)).toHaveLength(0);
  });

  it("hides the WhatsApp FALLBACK for Q1 when WhatsApp is not primary", () => {
    // With no delivery data Q1 has no in-page answer and used to fall back to a
    // wa.me link. A fallback that opens WhatsApp is a WhatsApp row like any
    // other, so it moves behind the same gate.
    const { container } = render(
      <WhatsAppQuestionChips
        producer={{ ...baseProducer, primary_contact_method: "website" }}
      />,
    );
    expect(screen.queryByTestId("question-link")).not.toBeInTheDocument();
    expectNoWhatsApp(container);
  });

  it("still renders the whole block as null when no channel and no data exist", () => {
    const { container } = render(
      <WhatsAppQuestionChips producer={{ name: "בלי כלום", primary_contact_method: "email" }} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
