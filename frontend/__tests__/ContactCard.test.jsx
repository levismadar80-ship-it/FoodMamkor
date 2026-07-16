import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1146 chunk A — the editorial contact card: exactly one primary CTA,
// the "פתוח להזמנות" status line (fix 2), ready-made question links that lead
// with the dynamic city delivery question (fix 11), a quiet secondary-channel
// icon row that excludes the primary method, and tertiary follow + share.

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
  };
});

// Follow + share are separately tested; stub so this suite stays focused.
vi.mock("@/components/FollowButton", () => ({
  default: () => <button data-testid="follow-button">follow</button>,
}));
vi.mock("@/components/ShareButton", () => ({
  default: () => <button data-testid="share-button">share</button>,
}));

import ContactCard from "@/app/[locale]/producer/[id]/components/ContactCard";

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
  render(<ContactCard producer={{ ...base, ...extra }} isVacation={false} primaryCategory={{ name: "ירקות" }} shareUrl="https://x/y" />);

describe("ContactCard (MEH-1146 chunk A)", () => {
  it("renders exactly one primary CTA", () => {
    render1();
    expect(screen.getAllByTestId("primary-contact-button")).toHaveLength(1);
  });

  it("shows the 'פתוח להזמנות' status line when open, hidden on vacation and when full", () => {
    const { unmount } = render1();
    expect(screen.getByText("פתוח להזמנות")).toBeInTheDocument();
    unmount();

    render(
      <ContactCard producer={base} isVacation={true} primaryCategory={null} shareUrl="x" />,
    );
    expect(screen.queryByText("פתוח להזמנות")).not.toBeInTheDocument();
  });

  it("suppresses the status line for a busy/full producer", () => {
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

  it("renders tertiary follow + share", () => {
    render1();
    expect(screen.getByTestId("follow-button")).toBeInTheDocument();
    expect(screen.getByTestId("share-button")).toBeInTheDocument();
  });
});
