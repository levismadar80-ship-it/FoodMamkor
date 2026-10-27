/**
 * MEH-2385 — the hairline above the question block exists to separate it from
 * the primary CTA. A producer with no resolvable channel renders no CTA
 * (PrimaryContactButton → null), and before this ticket the block still drew
 * `border-t` — a detached rule at the top of an otherwise empty white card
 * (seen on staging `demo-delivery-pickup`, 26/10).
 *
 * Both cells are asserted on the SAME container element so the negative cannot
 * pass by the element being absent: `question-chips` is required to exist in
 * both, and only its class list differs.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const map = {
      my_area: "האזור שלי",
      delivery_to_city: `אפשר משלוח ל${vars?.city ?? ""}?`,
      ordering_q: "איך מזמינים?",
      delivery_nationwide: "כן! משלוחים לכל הארץ",
      greeting_template: `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
      source_line: "הגעתי דרך מהמקור",
      escalation: "שאלה אחרת? צרו איתנו קשר",
      common_questions: "שאלות נפוצות",
    };
    return map[key] ?? key;
  },
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

// Delivery data only — Q1 answers in-page, so the block renders in both cells.
const answersOnly = { id: 9, name: "משק הדגמה", city: "בנימינה", delivery_nationwide: true };

describe("MEH-2385 — hairline only under a primary CTA", () => {
  it("draws the rule when a channel resolves (a CTA sits above the block)", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...answersOnly, phone: "0501234567", primary_contact_method: "whatsapp" }}
      />,
    );
    const block = screen.getByTestId("question-chips");
    expect(block.className).toContain("border-t");
    // Control: this cell really has the channel the rule is keyed on.
    expect(screen.getByTestId("escalation-link")).toBeInTheDocument();
  });

  it("draws no rule when no channel resolves (no CTA above the block)", () => {
    render(<WhatsAppQuestionChips producer={{ ...answersOnly, primary_contact_method: "email" }} />);
    const block = screen.getByTestId("question-chips");
    expect(block.className).not.toContain("border-t");
    // Control: the block rendered its answer, so this is a styled block and
    // not a missing one; and there is genuinely no channel row to separate from.
    expect(screen.getAllByTestId("quick-answer-toggle").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
  });
});
