/**
 * Sapir 19/11: «שאלות נפוצות» took a quarter of a phone screen under the
 * contact button. The block is now closed by default; its existing caption is
 * the toggle. Shows the questions only after a tap, and hides them again.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import he from "../messages/he.json";

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
  return { CaretDown: Stub, ChatCircle: Stub, ArrowDown: Stub, Wallet: Stub };
});

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";

const producer = {
  id: 1,
  name: "פרדס הדגמה",
  phone: "0501234567",
  primary_contact_method: "whatsapp",
  delivery_nationwide: true,
  payment_info: { methods: ["bit"], timing: null, note: null },
};

describe("«שאלות נפוצות» is closed by default (19/11)", () => {
  it("shows only the caption as a closed toggle — no question", () => {
    render(<WhatsAppQuestionChips producer={producer} />);
    const toggle = screen.getByTestId("question-chips-toggle");
    expect(toggle).toHaveTextContent("שאלות נפוצות");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("quick-answer-toggle")).not.toBeInTheDocument();
  });

  it("opens on a tap, and closes again", () => {
    render(<WhatsAppQuestionChips producer={producer} />);
    const toggle = screen.getByTestId("question-chips-toggle");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByTestId("quick-answer-toggle").map((b) => b.textContent)).toEqual([
      "אפשר משלוח לאזור שלי?",
      "איך משלמים?",
    ]);
    // MEH-3460 (20/11): no «שאלה אחרת?» row — it repeated the button.
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("quick-answer-toggle")).not.toBeInTheDocument();
  });
});
