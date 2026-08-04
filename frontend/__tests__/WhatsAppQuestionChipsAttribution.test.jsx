/**
 * MEH-1886 — every WhatsApp deep-link in WhatsAppQuestionChips is an attributed
 * click.
 *
 * A chip that opens WhatsApp is a full WhatsApp path, so it owes the same two
 * calls the primary CTA makes (ContactCard.jsx:235-238) — the MEH-1426
 * invariant: "every WhatsApp click = attribution + unlock; non-WA = neither".
 * Before this wiring the component did not import lib/contact-tracking at all,
 * so a conversation opened from a chip was never counted and never unlocked the
 * review form (reviews.py guard 3 → 403).
 *
 * The load-bearing case is the NEGATIVE one: an answer-first disclosure
 * (delivery / ordering, when buildDeliveryAnswer / buildOrderingAnswer return
 * content) opens no conversation and must NOT fire. A test that only asserted
 * "the links fire" would pass just as well against a listener bolted onto a
 * shared ancestor, which would also fire on every disclosure toggle.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) => {
    const map = {
      my_area: "האזור שלי",
      delivery_to_city: `אפשר משלוח ל${vars?.city ?? ""}?`,
      greeting_template: `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
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

const PID = 7;
const base = { id: PID, name: "חוות השקמה", city: "זכרון יעקב", phone: "0501234567" };

beforeEach(() => {
  pingWhatsAppBeacon.mockClear();
  markWhatsAppClickedLocal.mockClear();
});

describe("WhatsAppQuestionChips — click attribution (MEH-1886)", () => {
  it("fires BOTH helpers on a question link, exactly once per tap", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, custom_questions: ["יש חלה לשבת?"] }} />);
    const link = screen.getByText("יש חלה לשבת?").closest("a");
    // Guard the premise: this is genuinely a WhatsApp deep-link.
    expect(link.getAttribute("href")).toContain("wa.me/972501234567");

    fireEvent.click(link);
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
    expect(pingWhatsAppBeacon).toHaveBeenCalledWith(PID);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledTimes(1);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledWith(PID);
  });

  it("fires on EVERY wa.me link in the component, not just the first", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...base, custom_questions: ["ש1", "ש2", "ש3"] }}
      />,
    );
    const links = screen.getAllByTestId("question-link");
    expect(links.length).toBeGreaterThan(1);
    links.forEach((l) => expect(l.getAttribute("href")).toContain("wa.me/"));

    links.forEach((l) => fireEvent.click(l));
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(links.length);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledTimes(links.length);
  });

  it("fires on the escalation link", () => {
    render(<WhatsAppQuestionChips producer={base} />);
    fireEvent.click(screen.getByTestId("escalation-link"));
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledTimes(1);
  });

  it("fires on the recipe-idea link", () => {
    render(<WhatsAppQuestionChips producer={base} />);
    fireEvent.click(screen.getByTestId("recipe-idea-link"));
    expect(pingWhatsAppBeacon).toHaveBeenCalledTimes(1);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledTimes(1);
  });

  // THE DISCRIMINATING CASE. An answer-first disclosure opens no WhatsApp
  // conversation, so it must not be attributed. This is also what proves the
  // handlers sit on the <a> elements and not on a shared ancestor: an ancestor
  // listener would fire here too.
  it("does NOT fire when an answer disclosure is toggled open", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, delivery_nationwide: true }} />);
    const toggles = screen.getAllByTestId("quick-answer-toggle");
    expect(toggles.length).toBeGreaterThan(0);

    toggles.forEach((tgl) => fireEvent.click(tgl));
    // The answer rendered in-page — no conversation was opened.
    expect(screen.getAllByTestId("quick-answer-content").length).toBeGreaterThan(0);
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });

  it("does not fire on the 'more questions' expander", () => {
    render(
      <WhatsAppQuestionChips
        producer={{ ...base, custom_questions: ["ש1", "ש2", "ש3", "ש4", "ש5"] }}
      />,
    );
    fireEvent.click(screen.getByTestId("more-questions"));
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });

  // The wiring must not have disturbed what the link actually does.
  it("leaves the href and its prefill byte-identical", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, custom_questions: ["יש חלה לשבת?"] }} />);
    const href = screen.getByText("יש חלה לשבת?").closest("a").getAttribute("href");
    expect(decodeURIComponent(href)).toBe(
      "https://wa.me/972501234567?text=שלום חוות השקמה, יש חלה לשבת?\n\nsource_line",
    );
  });

  it("is inert without a producer id (no id → no attributed click)", () => {
    render(<WhatsAppQuestionChips producer={{ ...base, id: undefined, custom_questions: ["ש1"] }} />);
    fireEvent.click(screen.getByText("ש1").closest("a"));
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });
});
