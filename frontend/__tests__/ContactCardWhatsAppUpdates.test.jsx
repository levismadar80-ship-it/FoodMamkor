import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-2626: the «עדכונים» bell in the contact card's channel row. It REPLACES
// the old whatsapp_group circle (WhatsappLogo, untracked "קבוצת וואטסאפ") —
// one home per link, never two. Gated on producer.whatsapp_group.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "producer.detail.contact_card.aria.phone": "התקשרו",
      "producer.detail.contact_card.aria.instagram": "אינסטגרם",
      "producer.detail.contact_card.aria.website": "אתר",
      "producer.detail.contact_card.aria.email": "אימייל",
      "producer.detail.contact_card.aria.whatsapp_group": "עדכונים",
      "producer.detail.contact_card.single.whatsapp_group": "עדכונים מבית העסק בוואטסאפ",
      "producer.detail.whatsapp_updates.full": "עדכונים מבית העסק בוואטסאפ",
      "whatsapp.question_chips.greeting_template": `שלום ${vars?.name ?? ""}, ${vars?.q ?? ""}`,
    };
    return map[full] ?? full;
  },
}));

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@/lib/contact-tracking", () => ({
  markWhatsAppClickedLocal: vi.fn(),
  pingWhatsAppBeacon: vi.fn(),
  trackContactClick: vi.fn(),
}));

vi.mock("@phosphor-icons/react", () => {
  // data-icon lets a test tell WHICH glyph a circle carries.
  const make = (name) => {
    const Icon = () => <span data-icon={name} />;
    return Icon;
  };
  return {
    Bell: make("Bell"),
    CaretDown: make("CaretDown"),
    ChatCircle: make("ChatCircle"),
    EnvelopeSimple: make("EnvelopeSimple"),
    FacebookLogo: make("FacebookLogo"),
    Globe: make("Globe"),
    InstagramLogo: make("InstagramLogo"),
    Phone: make("Phone"),
    Receipt: make("Receipt"),
    WhatsappLogo: make("WhatsappLogo"),
  };
});

import ContactCard from "@/app/[locale]/producer/[id]/components/ContactCard";
import { markWhatsAppClickedLocal, pingWhatsAppBeacon, trackContactClick } from "@/lib/contact-tracking";

const LINK = "https://whatsapp.com/channel/0029VaABC";
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
const renderCard = (extra = {}) =>
  render(<ContactCard producer={{ ...base, ...extra }} isVacation={false} />);
const bell = () => screen.queryByTestId("contact-channel-whatsapp_group");

beforeEach(() => vi.clearAllMocks());

describe("ContactCard — «עדכונים» bell (MEH-2626)", () => {
  it("absent when the business has no updates link (null, empty, whitespace)", () => {
    for (const whatsapp_group of [null, "", "   "]) {
      const { unmount } = renderCard({ whatsapp_group });
      expect(bell()).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renders a Bell circle labelled «עדכונים» with the approved aria-label", () => {
    renderCard({ whatsapp_group: LINK });
    const el = bell();
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-label", "עדכונים מבית העסק בוואטסאפ");
    expect(el).toHaveTextContent(/^עדכונים$/);
    expect(el.querySelector('[data-icon="Bell"]')).not.toBeNull();
    expect(el.querySelector('[data-icon="WhatsappLogo"]')).toBeNull();
  });

  it("is styled exactly like the other channel circles", () => {
    renderCard({ whatsapp_group: LINK });
    const phone = screen.getByTestId("contact-channel-phone");
    expect(bell().className).toBe(phone.className);
    expect(bell().firstElementChild.className).toBe(phone.firstElementChild.className);
  });

  it("opens the link in a new tab with rel=noopener noreferrer", () => {
    renderCard({ whatsapp_group: `  ${LINK} ` });
    expect(bell()).toHaveAttribute("href", LINK);
    expect(bell()).toHaveAttribute("target", "_blank");
    expect(bell()).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("a tap fires ONE contact-click beacon with method whatsapp_group, and no WA-CTA signals", () => {
    renderCard({ whatsapp_group: LINK });
    fireEvent.click(bell());
    expect(trackContactClick).toHaveBeenCalledTimes(1);
    expect(trackContactClick).toHaveBeenCalledWith(7, "whatsapp_group");
    expect(pingWhatsAppBeacon).not.toHaveBeenCalled();
    expect(markWhatsAppClickedLocal).not.toHaveBeenCalled();
  });

  it("sole surviving channel → the labelled row with the full text, still tracked", () => {
    render(
      <ContactCard
        producer={{
          id: 7,
          name: "חוות השקמה",
          instagram: "@shikma",
          primary_contact_method: "instagram",
          whatsapp_group: LINK,
        }}
        isVacation={false}
      />,
    );
    const row = screen.getByTestId("contact-single-row");
    expect(row).toHaveTextContent("עדכונים מבית העסק בוואטסאפ");
    expect(row).toHaveAttribute("href", LINK);
    fireEvent.click(row);
    expect(trackContactClick).toHaveBeenCalledWith(7, "whatsapp_group");
  });
});
