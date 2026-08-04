import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * MEH-1886 — a chat opened from a question chip must fire the SAME two calls
 * the primary CTA fires (ContactCard.jsx:235-238), so the conversation is
 * attributed and the review form unlocks.
 *
 * The load-bearing assertion is the NEGATIVE one: an answer disclosure opens no
 * WhatsApp conversation and must NOT fire. Every "the link fires" assertion
 * here passes identically against a component that fires on *everything* — a
 * single handler on the wrapper <div> would satisfy all of them. Only the
 * disclosure case and the ancestor case can tell correct wiring from a
 * shotgun, which is why both are here.
 *
 * `@/lib/quickAnswers` and `@/lib/categoryQuestions` are deliberately NOT
 * mocked: which rows become disclosures and which become WhatsApp links is the
 * exact distinction under test, and a stub would let the test define the answer
 * it is supposed to be measuring.
 *
 * REUSES: frontend/__tests__/ContactCard.test.jsx:11-65 (next-intl map mock,
 * normalizePhone override, contact-tracking vi.fn() mock, phosphor stubs).
 */

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "whatsapp.question_chips.my_area": "האזור שלי",
      "whatsapp.question_chips.delivery_to_city": `אפשר משלוח ל${vars?.city ?? ""}?`,
      // Must equal a DEFAULT_QUESTIONS entry verbatim (categoryQuestions.js:85)
      // or the component's de-duplication filter cannot drop it and the row
      // count below shifts.
      "whatsapp.question_chips.ordering_q": "איך מזמינים?",
      "whatsapp.question_chips.greeting_template": `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
      "whatsapp.question_chips.source_line": "הגעתי דרך מהמקור",
      "whatsapp.question_chips.recipe_idea_message": "יש לי רעיון למתכון",
      "whatsapp.question_chips.escalation": "שאלה אחרת?",
      "whatsapp.question_chips.recipe_idea": "יש לי רעיון למתכון",
      "whatsapp.question_chips.common_questions": "שאלות נפוצות",
      "whatsapp.question_chips.delivery_nationwide": "משלוחים לכל הארץ",
      "whatsapp.question_chips.ordering_whatsapp": "מזמינים בוואטסאפ",
    };
    return map[full] ?? full;
  },
}));

// Keep the real getWhatsAppHref (the href assertions below depend on it) and
// force a deterministic normalizePhone.
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
  return { ChatCircle: Stub, CaretDown: Stub };
});

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { pingWhatsAppBeacon, markWhatsAppClickedLocal } from "@/lib/contact-tracking";

const ID = "prod-1886";

/**
 * Delivery + ordering both ANSWERABLE from data → two in-page disclosures.
 * primary_contact_method defaults to whatsapp (contact-method.js:24), so
 * buildOrderingAnswer returns {kind:"whatsapp"} — an answer, not a link.
 */
const WITH_ANSWERS = {
  id: ID,
  name: "מאפיית הגליל",
  city: "חיפה",
  phone: "050-1234567",
  delivery_nationwide: true,
  offers_delivery: true,
};

/**
 * Neither question is answerable → both collapse to WhatsApp fallbacks.
 * `website` primary with an empty website makes getPrimaryContactHref return
 * null, which is the documented "→ WhatsApp fallback" path (quickAnswers.js:104).
 */
const NO_ANSWERS = {
  id: ID,
  name: "מאפיית הגליל",
  city: "חיפה",
  phone: "050-1234567",
  primary_contact_method: "website",
  website: "",
  offers_delivery: true,
  has_physical_location: false,
};

const calls = () => [
  pingWhatsAppBeacon.mock.calls.length,
  markWhatsAppClickedLocal.mock.calls.length,
];

beforeEach(() => {
  pingWhatsAppBeacon.mockClear();
  markWhatsAppClickedLocal.mockClear();
});

describe("MEH-1886 — WhatsApp question chips fire the attribution pair", () => {
  it("fires both calls, with the producer id, on a question link", () => {
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    const links = screen.getAllByTestId("question-link");
    expect(links.length).toBeGreaterThan(0);

    fireEvent.click(links[0]);

    expect(pingWhatsAppBeacon).toHaveBeenCalledWith(ID);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledWith(ID);
  });

  it("fires exactly once per tap — not once per link on the page", () => {
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    fireEvent.click(screen.getAllByTestId("question-link")[0]);
    expect(calls()).toEqual([1, 1]);
  });

  it("fires on the escalation link", () => {
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    fireEvent.click(screen.getByTestId("escalation-link"));
    expect(calls()).toEqual([1, 1]);
  });

  it("fires on the recipe-idea link", () => {
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    fireEvent.click(screen.getByTestId("recipe-idea-link"));
    expect(calls()).toEqual([1, 1]);
  });

  it("covers EVERY WhatsApp link rendered, not just the first", () => {
    // Enumerated rather than sampled: a per-call-site wiring is easy to add to
    // three of four sites, and the fourth would be invisible to a spot check.
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    const all = [
      ...screen.getAllByTestId("question-link"),
      screen.getByTestId("escalation-link"),
      screen.getByTestId("recipe-idea-link"),
    ];
    expect(all.length).toBeGreaterThanOrEqual(4);

    all.forEach((el) => fireEvent.click(el));
    expect(calls()).toEqual([all.length, all.length]);
  });
});

describe("MEH-1886 — what must NOT fire (the discriminating cases)", () => {
  it("an answer disclosure opens no conversation, so it fires nothing", () => {
    render(<WhatsAppQuestionChips producer={WITH_ANSWERS} />);
    const toggles = screen.getAllByTestId("quick-answer-toggle");
    expect(toggles.length).toBe(2); // delivery + ordering, both answered in-page

    toggles.forEach((el) => fireEvent.click(el));

    // The answers really rendered — otherwise this test would pass by clicking
    // inert buttons, which is the "green for two reasons" shape.
    expect(screen.getAllByTestId("quick-answer-content").length).toBe(2);
    expect(calls()).toEqual([0, 0]);
  });

  it("no listener sits on a shared ancestor", () => {
    // A single handler on the <ul> or the wrapper would satisfy every positive
    // assertion above while also firing on the disclosure toggles. Clicking the
    // list itself is what separates per-link wiring from that shotgun.
    const { container } = render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    fireEvent.click(container.querySelector("ul"));
    fireEvent.click(container.firstChild);
    expect(calls()).toEqual([0, 0]);
  });

  it("fires nothing when the producer has no id", () => {
    // markWhatsAppClickedLocal has no id guard of its own
    // (contact-tracking.js:83) — without the caller's check it would write a
    // `wa_clicked_undefined` key that unlocks nothing.
    render(<WhatsAppQuestionChips producer={{ ...NO_ANSWERS, id: undefined }} />);
    fireEvent.click(screen.getAllByTestId("question-link")[0]);
    expect(calls()).toEqual([0, 0]);
  });
});

describe("MEH-1886 — hrefs and copy are untouched", () => {
  it("keeps the wa.me prefill byte-identical", () => {
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    const delivery = screen
      .getAllByTestId("question-link")
      .find((a) => a.textContent.includes("אפשר משלוח לחיפה?"));

    expect(delivery.getAttribute("href")).toBe(
      "https://wa.me/972501234567?text=" +
        encodeURIComponent("שלום מאפיית הגליל, אפשר משלוח לחיפה?\n\nהגעתי דרך מהמקור"),
    );
    expect(delivery.getAttribute("target")).toBe("_blank");
    expect(delivery.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps the recipe-idea prefill on its own locked message", () => {
    render(<WhatsAppQuestionChips producer={NO_ANSWERS} />);
    expect(screen.getByTestId("recipe-idea-link").getAttribute("href")).toBe(
      "https://wa.me/972501234567?text=" +
        encodeURIComponent("יש לי רעיון למתכון\n\nהגעתי דרך מהמקור"),
    );
  });
});
