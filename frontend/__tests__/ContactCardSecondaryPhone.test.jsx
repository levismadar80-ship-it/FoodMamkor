import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-3339 — the optional second number is ONE text line in the contact card,
// never a button; every CTA (the WhatsApp primary button, the phone channel)
// keeps dialling `producer.phone`. A number without a label reads «טלפון נוסף».
// States: none (no line) · number + label · number only.

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => {
    const full = ns ? `${ns}.${key}` : key;
    const map = {
      "producer.detail.contact_card.secondary_phone_default_label": "טלפון נוסף",
      "producer.detail.contact_card.aria.phone": "התקשרו",
    };
    return map[full] ?? full;
  },
}));

vi.mock("@/lib/contact-tracking", () => ({
  markWhatsAppClickedLocal: vi.fn(),
  pingWhatsAppBeacon: vi.fn(),
  trackContactClick: vi.fn(),
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = () => <span />;
  return {
    EnvelopeSimple: Stub, FacebookLogo: Stub, Globe: Stub, InstagramLogo: Stub, Phone: Stub,
    Receipt: Stub, WhatsappLogo: Stub, Bell: Stub, ChatCircle: Stub, CaretDown: Stub,
  };
});

import ContactCard from "@/app/[locale]/producer/[id]/components/ContactCard";

const base = {
  id: 7,
  name: "סנדרה פירות איכותיים",
  city: "פרדס חנה-כרכור",
  phone: "0522518862",
  primary_contact_method: "whatsapp",
  instagram: "sandraperot",
};

const renderCard = (extra = {}) => render(<ContactCard producer={{ ...base, ...extra }} isVacation={false} />);

const allHrefs = () => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));

describe("ContactCard — second phone line (MEH-3339)", () => {
  it("no second number → no line", () => {
    renderCard();
    expect(screen.queryByTestId("secondary-phone-line")).toBeNull();
  });

  it("number + label → «להזמנות: 0522723011» as a plain tel: link", () => {
    renderCard({ secondary_phone: "0522723011", secondary_phone_label: "להזמנות" });
    const line = screen.getByTestId("secondary-phone-line");
    expect(line).toHaveTextContent("להזמנות: 0522723011");
    const link = line.querySelector("a");
    expect(link).toHaveAttribute("href", "tel:0522723011");
    expect(link).toHaveAttribute("dir", "ltr");
    expect(line.querySelector("button")).toBeNull();
  });

  it("number without a label → «טלפון נוסף»", () => {
    renderCard({ secondary_phone: "0522723011", secondary_phone_label: null });
    expect(screen.getByTestId("secondary-phone-line")).toHaveTextContent("טלפון נוסף: 0522723011");
  });

  it("every other link still goes to the MAIN number — the second appears only in its line", () => {
    renderCard({ secondary_phone: "0522723011", secondary_phone_label: "להזמנות" });
    const second = allHrefs().filter((h) => h.includes("2723011"));
    expect(second).toEqual(["tel:0522723011"]);
    // Control: the main number is still wired somewhere (WhatsApp or tel).
    expect(allHrefs().some((h) => h.includes("2518862"))).toBe(true);
  });
});
