/**
 * MEH-3460. Sapir 19/11: «שאלות נפוצות» took a quarter of a phone screen under
 * the contact button. Sapir 20/11 (decision card): it moved out of the contact
 * card into its own section under «משלוחים», and the delivery question is not
 * asked when that section is on the page.
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

describe("«שאלות נפוצות» is its own page section (Sapir 20/11)", () => {
  it("renders as a section with its heading, questions visible without a tap", () => {
    const { container } = render(<WhatsAppQuestionChips producer={producer} />);
    const section = container.querySelector("section#section-faq");
    expect(section).not.toBeNull();
    expect(screen.getByRole("heading", { name: "שאלות נפוצות" })).toBeInTheDocument();
    // No outer toggle any more: each question opens on its own.
    expect(screen.queryByTestId("question-chips-toggle")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("quick-answer-toggle").map((b) => b.textContent)).toEqual([
      "אפשר משלוח לאזור שלי?",
      "איך משלמים?",
    ]);
    // MEH-3460 (20/11): no «שאלה אחרת?» row — it repeated the button.
    expect(screen.queryByTestId("escalation-link")).not.toBeInTheDocument();
  });

  it("does not ask the delivery question when the page has its «משלוח» section", () => {
    render(<WhatsAppQuestionChips producer={{ ...producer, offers_delivery: true }} />);
    expect(screen.getAllByTestId("quick-answer-toggle").map((b) => b.textContent)).toEqual([
      "איך משלמים?",
    ]);
    expect(screen.queryByText("אפשר משלוח לאזור שלי?")).not.toBeInTheDocument();
  });

  it("renders nothing when no question is left", () => {
    const { container } = render(
      <WhatsAppQuestionChips producer={{ ...producer, offers_delivery: true, payment_info: null }} />,
    );
    expect(container.querySelector("#section-faq")).toBeNull();
  });

  // MEH-1334 chunk 2 (moved from ContactCard.test, 20/11): cap visible
  // questions at 3, reveal the rest behind «עוד שאלות» (single level).
  it("caps the questions at 3 and reveals the rest via עוד שאלות", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...producer, offers_delivery: true, payment_info: null, custom_questions: ["ש1", "ש2", "ש3", "ש4", "ש5"] }}
      />,
    );
    expect(screen.getAllByTestId("question-link")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("more-questions"));
    expect(screen.getAllByTestId("question-link")).toHaveLength(5);
    expect(screen.queryByTestId("more-questions")).not.toBeInTheDocument();
  });
});
