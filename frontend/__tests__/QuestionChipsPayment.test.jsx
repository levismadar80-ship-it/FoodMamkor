/**
 * MEH-3035 chunk 3 — «איך משלמים?» on the business page.
 *
 * Option א (Sapir 13/11): one Wallet line icon and a text answer, no per-method
 * icons on the page. The question is an answer-first Disclosure beside
 * «איך מזמינים?»; it renders only when the business filled something in.
 * Cells: nothing set (no chip) · methods only · timing only · note only ·
 * all three · closed (no answer in DOM) / open.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
  trackContactClick: vi.fn(),
}));

import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";

const base = { id: 9, name: "משק", city: "בנימינה", phone: "0501234567", primary_contact_method: "whatsapp" };

const paymentToggle = () =>
  screen.queryAllByTestId("quick-answer-toggle").find((b) => b.textContent.includes("payment_q"));

const openPayment = () => {
  fireEvent.click(paymentToggle());
  return screen.getByTestId("payment-answer");
};

describe("«איך משלמים?» chip (MEH-3035)", () => {
  it("no chip when payment_info is null", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, payment_info: null }} />);
    expect(paymentToggle()).toBeUndefined();
  });

  it("no chip when payment_info is present but empty", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, payment_info: { methods: [], timing: null, note: null } }} />);
    expect(paymentToggle()).toBeUndefined();
  });

  it("closed by default: the question shows, the answer does not", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, payment_info: { methods: ["bit"], timing: null, note: null } }} />);
    expect(paymentToggle()).toBeTruthy();
    expect(screen.queryByTestId("payment-answer")).toBeNull();
  });

  it("methods only: one line, in the approved order, no timing or note line", () => {
    render(
      <WhatsAppQuestionChips producer={{ ...base, payment_info: { methods: ["cash", "bit"], timing: null, note: null } }} />,
    );
    const a = openPayment();
    expect(within(a).getByTestId("payment-methods").textContent).toBe("payment_methods.bit · payment_methods.cash");
    expect(within(a).queryByTestId("payment-timing")).toBeNull();
    expect(within(a).queryByTestId("payment-note")).toBeNull();
  });

  it("timing only", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, payment_info: { methods: [], timing: "deposit", note: null } }} />);
    const a = openPayment();
    expect(within(a).queryByTestId("payment-methods")).toBeNull();
    expect(within(a).getByTestId("payment-timing").textContent).toBe("payment_timing.deposit");
  });

  it("note only", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, payment_info: { methods: [], timing: null, note: "רק מזומן בשוק" } }} />);
    const a = openPayment();
    expect(within(a).getByTestId("payment-note").textContent).toBe("רק מזומן בשוק");
  });

  it("all three, and one Wallet icon only", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...base, payment_info: { methods: ["bit", "paybox"], timing: "advance", note: "מקדמה 30%" } }}
      />,
    );
    const a = openPayment();
    expect(within(a).getByTestId("payment-methods")).toBeTruthy();
    expect(within(a).getByTestId("payment-timing").textContent).toBe("payment_timing.advance");
    expect(within(a).getByTestId("payment-note")).toBeTruthy();
    expect(a.querySelectorAll("svg").length).toBe(1);
  });

  it("sits right after «איך מזמינים?»", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...base, delivery_nationwide: true, payment_info: { methods: ["bit"], timing: null, note: null } }}
      />,
    );
    const labels = screen.getAllByTestId("quick-answer-toggle").map((b) => b.textContent);
    const iOrder = labels.findIndex((l) => l.includes("ordering_q"));
    expect(iOrder).toBeGreaterThanOrEqual(0);
    expect(labels[iOrder + 1]).toContain("payment_q");
  });

  it("renders even without any contact channel (data-driven answer)", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ id: 3, name: "x", payment_info: { methods: ["cash"], timing: null, note: null } }}
      />,
    );
    expect(paymentToggle()).toBeTruthy();
  });
});
