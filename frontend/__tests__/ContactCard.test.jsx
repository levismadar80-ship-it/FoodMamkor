import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1146 chunk A — the editorial contact card: exactly one primary CTA,
// ready-made question links that lead with the dynamic city delivery question
// (fix 11), and a quiet secondary-channel icon row that excludes the primary
// method. MEH-1334 chunk 1: the status line moved to the header meta line and
// the tertiary follow/share row moved to the header quiet-actions row — this
// suite now guards their ABSENCE here (one home per element).

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "producer.detail.contact_card.status_open": "פתוח להזמנות",
      "producer.detail.contact_card.aria.phone": "התקשרו",
      "producer.detail.contact_card.aria.instagram": "אינסטגרם",
      "producer.detail.contact_card.aria.website": "אתר",
      "producer.detail.contact_card.aria.email": "אימייל",
      "producer.detail.contact_card.aria.facebook": "פייסבוק",
      "producer.detail.contact_card.aria.external_order": "טופס הזמנות",
      "producer.detail.contact_card.aria.whatsapp_group": "קבוצת וואטסאפ",
      "whatsapp.question_chips.ask_us": "שאלו אותנו",
      "whatsapp.question_chips.my_area": "האזור שלי",
      // MEH-1233 B2: ל attaches directly to the city, no maqaf ("לזכרון", not "ל-זכרון").
      "whatsapp.question_chips.delivery_to_city": `אפשר משלוח ל${vars?.city ?? ""}?`,
      "whatsapp.question_chips.greeting_template": `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
    };
    return map[full] ?? full;
  },
}));

// Keep the real getWhatsAppHref (PrimaryContactButton + WhatsAppQuestionChips
// use it) and force a deterministic normalizePhone.
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@/lib/contact-tracking", () => ({
  markWhatsAppClickedLocal: vi.fn(),
  pingWhatsAppBeacon: vi.fn(),
  trackContactClick: vi.fn(),
}));

// Phosphor icons → inert spans (aria-label lives on the anchor, not the icon).
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    EnvelopeSimple: Stub,
    FacebookLogo: Stub,
    Globe: Stub,
    InstagramLogo: Stub,
    Phone: Stub,
    Receipt: Stub,
    WhatsappLogo: Stub,
    // MEH-1168 P1: WhatsAppQuestionChips (a real child here) now renders a
    // ChatCircle glyph before each question link.
    ChatCircle: Stub,
    // MEH-1302: the same child now renders answer-first disclosures with a
    // CaretDown toggle — stub it too or the real child errors on an undefined
    // element type.
    CaretDown: Stub,
  };
});

import ContactCard from "@/app/[locale]/producer/[id]/components/ContactCard";
// MEH-1426: the mocked helpers, imported to assert the primary-CTA gating.
import { markWhatsAppClickedLocal, pingWhatsAppBeacon } from "@/lib/contact-tracking";

const base = {
  id: 7,
  name: "חוות השקמה",
  city: "זכרון יעקב",
  phone: "0501234567",
  instagram: "@shikma",
  website: "havat-hashikma.co.il",
  contact_email: "hi@shikma.co.il",
  primary_contact_method: "whatsapp",
};

const render1 = (extra = {}) =>
  render(<ContactCard producer={{ ...base, ...extra }} isVacation={false} />);

describe("ContactCard (MEH-1146 chunk A · MEH-1334 chunk 1)", () => {
  it("renders exactly one primary CTA", () => {
    render1();
    expect(screen.getAllByTestId("primary-contact-button")).toHaveLength(1);
  });

  // MEH-1334: the status line's ONE home is the header meta line — the card
  // must not render it in any availability state (one green per page).
  it("does not render the status line (moved to the header, MEH-1334)", () => {
    const { unmount } = render1();
    expect(screen.queryByText("פתוח להזמנות")).not.toBeInTheDocument();
    unmount();
    render1({ availability_state: "full_this_week" });
    expect(screen.queryByText("פתוח להזמנות")).not.toBeInTheDocument();
  });

  it("leads the ready-made questions with the dynamic city delivery question", () => {
    render1();
    const links = screen.getAllByTestId("question-link");
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3);
    expect(links[0]).toHaveTextContent("אפשר משלוח לזכרון יעקב?");
  });

  it("quiet icon row includes secondary channels but excludes the primary method", () => {
    // primary = whatsapp → phone/instagram/website/email icons all present
    render1();
    expect(screen.getByLabelText("התקשרו")).toBeInTheDocument();
    expect(screen.getByLabelText("אינסטגרם")).toBeInTheDocument();
    expect(screen.getByLabelText("אתר")).toBeInTheDocument();
    expect(screen.getByLabelText("אימייל")).toBeInTheDocument();
  });

  it("excludes the primary-method channel from the icon row (website primary)", () => {
    render1({ primary_contact_method: "website" });
    // website is now the CTA → its icon must not duplicate in the row
    expect(screen.queryByLabelText("אתר")).not.toBeInTheDocument();
    // but phone/instagram/email remain
    expect(screen.getByLabelText("התקשרו")).toBeInTheDocument();
  });

  // MEH-1334: follow + share moved to the header quiet-actions row — the card
  // must not mount them anymore (one home per action).
  it("does not render follow/share in the card (moved to the header, MEH-1334)", () => {
    render1();
    expect(screen.queryByTestId("follow-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("share-button")).not.toBeInTheDocument();
  });

  // MEH-1334 chunk 2: progressive disclosure — cap visible ready-made
  // questions at 3, reveal the rest behind "עוד שאלות" (single level).
  it("caps ready-made questions at 3 and reveals the rest via עוד שאלות", () => {
    // custom_questions overrides the category defaults (categoryQuestions.js:88)
    // → a deterministic large set that forces the expander.
    render1({ custom_questions: ["ש1", "ש2", "ש3", "ש4", "ש5"] });
    const before = screen.getAllByTestId("question-link").length;
    expect(before).toBeLessThanOrEqual(3);
    const more = screen.getByTestId("more-questions");
    fireEvent.click(more);
    // after expanding, more items are shown and the button is gone
    expect(screen.getAllByTestId("question-link").length).toBeGreaterThan(before);
    expect(screen.queryByTestId("more-questions")).not.toBeInTheDocument();
  });

  // MEH-1334 chunk 2: desktop phone tap reveals the number inline, no dial.
  it("reveals the phone number inline on desktop instead of dialing", () => {
    const prev = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: true, // desktop (min-width: 1024px)
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      render1();
      expect(screen.queryByTestId("revealed-phone")).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText("התקשרו"));
      const revealed = screen.getByTestId("revealed-phone");
      expect(revealed).toHaveAttribute("href", "tel:0501234567");
      // MEH-1583: dir="ltr" moved off the row onto the number span — on the
      // row it dragged the phone icon to the visual end in RTL. The digits are
      // still direction-locked, one level down.
      expect(revealed.querySelector("span[dir='ltr']")).toHaveTextContent("0501234567");
    } finally {
      window.matchMedia = prev;
    }
  });

  // MEH-1426: the WhatsApp-gate invariant — a WhatsApp primary CTA attributes
  // AND unlocks; a non-WhatsApp primary does neither (previously it unlocked
  // unconditionally, letting a phone/website primary open the review form on a
  // click that never created an attributed WA row).
  it("WhatsApp primary CTA fires attribution + unlock", () => {
    markWhatsAppClickedLocal.mockClear();
    pingWhatsAppBeacon.mockClear();
    render1(); // base = whatsapp primary
    fireEvent.click(screen.getByTestId("primary-contact-button"));
    expect(pingWhatsAppBeacon).toHaveBeenCalledWith(base.id);
    expect(markWhatsAppClickedLocal).toHaveBeenCalledWith(base.id);
  });

  it("non-WhatsApp primary CTA fires NEITHER attribution nor unlock", () => {
    markWhatsAppClickedLocal.mockClear();
    pingWhatsAppBeacon.mockClear();
    render1({ primary_contact_method: "website" });
    fireEvent.click(screen.getByTestId("primary-contact-button"));
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });
});
