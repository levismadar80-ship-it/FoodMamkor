/**
 * MEH-2155 — the dashboard's live list IS the public page's list.
 *
 * `lib/resolvedQuestions.js` is a SECOND derivation of the resolution rules,
 * beside `WhatsAppQuestionChips.jsx`'s own. MEH-2155's scope holds that
 * component to read-only (MEH-2154 owns it), so it was not refactored onto the
 * helper — which is the "two parallel mechanisms" smell `workflow.md` names,
 * and the smell's whole point is that both paths keep working independently
 * while they drift.
 *
 * This file is the mechanical binding that replaces "remember to keep these in
 * sync". It renders the REAL component, scrapes what it actually put on screen,
 * and asserts the helper returns the same labels in the same order. Change
 * either side alone and this reds.
 *
 * WHY IT SCRAPES THE RENDER RATHER THAN COMPARING TWO FUNCTIONS
 * A test that called the component's internals would be comparing the helper
 * against a copy of the helper. The only thing that settles "does the dashboard
 * tell the truth about the page" is what the page's own component renders, so
 * that is the reference — the same reason the MEH-2154 harness scraped hrefs
 * out of a live DOM instead of trusting a returned object.
 *
 * The comparison is against the FULL item list, not the first three: the
 * component caps the visible rows at VISIBLE_MAX behind an "עוד שאלות"
 * expander, which is presentation. The expander is clicked when present so the
 * scrape sees everything.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import he from "../messages/he.json";

// Resolve the real he.json copy, exactly as quickAnswers.test.js does, so both
// sides of the comparison are fed production strings rather than key names.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const dict = ns.split(".").reduce((o, k) => o?.[k], he);
    let s = dict?.[key] ?? `${ns}.${key}`;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return { CaretDown: Stub, ChatCircle: Stub };
});

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
  trackContactClick: vi.fn(),
}));

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { resolveProducerQuestions } from "@/lib/resolvedQuestions";

const chips = he.whatsapp.question_chips;

const labelsFor = (producer) => ({
  deliveryQuestion: chips.delivery_to_city.replace("{city}", producer?.city || chips.my_area),
  orderingQuestion: chips.ordering_q,
  escalationQuestion: chips.escalation,
  recipeQuestion: chips.recipe_idea,
});

/**
 * Every question label the component put on screen, in render order.
 *
 * Reads the three row types the component emits — the disclosure buttons, the
 * WhatsApp chips, and the escalation/recipe anchors — and strips nothing else,
 * so a row the helper forgets shows up as a length mismatch rather than being
 * quietly skipped.
 */
function renderedLabels(container) {
  const more = screen.queryByTestId("more-questions");
  if (more) fireEvent.click(more);
  const rows = container.querySelectorAll(
    "[data-testid='quick-answer-toggle'],[data-testid='question-link'],[data-testid='escalation-link'],[data-testid='recipe-idea-link']",
  );
  return [...rows].map((el) => el.textContent.trim());
}

const FIXTURES = [
  {
    name: "(a) whatsapp-primary, no custom questions",
    producer: {
      id: 1,
      name: "מאפיית השקמה",
      city: "זכרון יעקב",
      phone: "0501234567",
      primary_contact_method: "whatsapp",
      categories: [{ name: "לחמים ואפייה" }],
      delivery_nationwide: true,
    },
  },
  {
    name: "(b) email-primary, no custom questions",
    producer: {
      id: 2,
      name: "מאפיית השקמה",
      city: "זכרון יעקב",
      phone: "0501234567",
      primary_contact_method: "email",
      contact_email: "hi@shikma.example.com",
      categories: [{ name: "לחמים ואפייה" }],
      delivery_nationwide: true,
    },
  },
  {
    name: "(c) whatsapp-primary WITH custom questions",
    producer: {
      id: 3,
      name: "מאפיית השקמה",
      city: "זכרון יעקב",
      phone: "0501234567",
      primary_contact_method: "whatsapp",
      categories: [{ name: "לחמים ואפייה" }],
      custom_questions: ["יש חלה לשבת?", "אפשר להזמין לאירוע?"],
      delivery_nationwide: true,
    },
  },
  {
    name: "(d) no channel at all — the page shows nothing",
    producer: { id: 4, name: "בלי כלום", primary_contact_method: "email" },
  },
  {
    name: "(e) pickup-only, phone present, whatsapp-primary",
    producer: {
      id: 5,
      name: "מאפיית השקמה",
      city: "עכו",
      phone: "0501234567",
      primary_contact_method: "whatsapp",
      categories: [{ name: "ירקות" }],
      offers_delivery: false,
      has_physical_location: true,
    },
  },
];

describe("MEH-2155 — resolveProducerQuestions mirrors WhatsAppQuestionChips", () => {
  it.each(FIXTURES)("$name", ({ producer }) => {
    const { container } = render(<WhatsAppQuestionChips producer={producer} />);
    const fromPage = renderedLabels(container);
    const fromHelper = resolveProducerQuestions(producer, labelsFor(producer)).items.map(
      (i) => i.label,
    );
    expect(fromHelper).toEqual(fromPage);
  });

  // The control for the four positive cases above. Without it, a helper that
  // returned [] for everything and a component that rendered nothing would
  // agree perfectly, five times, and this file would report five passes.
  it("the reference actually rendered something in the channel-bearing cases", () => {
    const counts = FIXTURES.filter((f) => f.producer.phone || f.producer.contact_email).map(
      ({ producer }) => {
        const { container, unmount } = render(<WhatsAppQuestionChips producer={producer} />);
        const n = renderedLabels(container).length;
        unmount();
        return n;
      },
    );
    expect(counts.length).toBe(4);
    for (const n of counts) expect(n).toBeGreaterThan(0);
  });

  it("fixture (d) is genuinely the empty case on both sides", () => {
    const { producer } = FIXTURES[3];
    const { container } = render(<WhatsAppQuestionChips producer={producer} />);
    expect(container.innerHTML).toBe("");
    expect(resolveProducerQuestions(producer, labelsFor(producer)).items).toEqual([]);
  });
});

describe("the annotations the dashboard renders", () => {
  it("marks the data-driven rows answered and the chips by channel", () => {
    const producer = FIXTURES[1].producer; // email-primary
    const { items } = resolveProducerQuestions(producer, labelsFor(producer));
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));

    // Q1 is answered from her own delivery data — never a chip.
    expect(byId.delivery).toMatchObject({ answered: true, channel: null });
    // Q2 likewise, via getPrimaryContactHref.
    expect(byId.ordering).toMatchObject({ answered: true, channel: null });
    // The escalation carries the channel it will actually open.
    expect(byId.escalation).toMatchObject({ answered: false, channel: "email" });
    // …and no WhatsApp-only rows survive for a non-WhatsApp business.
    expect(byId.recipe).toBeUndefined();
    expect(items.some((i) => i.source === "category")).toBe(false);
  });

  it("labels her own questions as custom, not as category defaults", () => {
    const producer = FIXTURES[2].producer;
    const { items, usesCustom, customCount } = resolveProducerQuestions(
      producer,
      labelsFor(producer),
    );
    expect(usesCustom).toBe(true);
    expect(customCount).toBe(2);
    expect(items.filter((i) => i.source === "custom").map((i) => i.label)).toEqual([
      "יש חלה לשבת?",
      "אפשר להזמין לאירוע?",
    ]);
    expect(items.some((i) => i.source === "category")).toBe(false);
  });

  it("reports the category defaults as such when she has written none", () => {
    const producer = FIXTURES[0].producer;
    const { items, usesCustom, customCount } = resolveProducerQuestions(
      producer,
      labelsFor(producer),
    );
    expect(usesCustom).toBe(false);
    expect(customCount).toBe(0);
    // MEH-2154's Phase 0 measured this: after the Q1/Q2 duplicates are stripped
    // every category yields exactly one stock question.
    expect(items.filter((i) => i.source === "category").map((i) => i.label)).toEqual([
      "אילו לחמים יש השבוע?",
    ]);
  });
});
