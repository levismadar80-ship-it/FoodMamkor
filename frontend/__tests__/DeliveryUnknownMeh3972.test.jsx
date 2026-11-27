/**
 * MEH-3972. A business whose delivery was never set (offers_delivery=false is
 * the default, not something she said) must not be shown as «אין משלוחים».
 * And «משלוחים» with no cities is a real state: the page reads «בתיאום מראש».
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

const base = {
  id: 1,
  name: "כוורת הדגמה",
  phone: "0501234567",
  primary_contact_method: "whatsapp",
  city: "עמק חפר",
  has_physical_location: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_areas: [],
};

describe("MEH-3972 — unset delivery is not «אין משלוחים»", () => {
  it("the delivery answer names the pickup and claims nothing about delivery", () => {
    const { container } = render(<WhatsAppQuestionChips producer={base} />);
    const toggle = screen.getByTestId("quick-answer-toggle");
    // The page's only in-page answer may start open (MEH-3666); open it either way.
    if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
    expect(container.textContent).toContain("איסוף עצמי בעמק חפר");
    expect(container.textContent).not.toContain("אין משלוחים");
  });
});
