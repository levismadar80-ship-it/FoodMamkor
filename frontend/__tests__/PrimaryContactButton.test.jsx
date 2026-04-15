import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PrimaryContactButton from "@/components/PrimaryContactButton";

vi.mock("@/lib/utils", () => ({
  normalizePhone: (p) => (p ? p.replace(/^0/, "972").replace(/\D/g, "") : ""),
}));

vi.mock("@phosphor-icons/react", () => ({
  WhatsappLogo: (props) => <span data-testid="icon-whatsapp" {...props} />,
  Phone: (props) => <span data-testid="icon-phone" {...props} />,
  Globe: (props) => <span data-testid="icon-globe" {...props} />,
  EnvelopeSimple: (props) => <span data-testid="icon-envelope" {...props} />,
}));

const base = {
  name: "חוות השקמה",
  phone: "0501234567",
  website: "havat-hashikma.co.il",
  contact_email: "hello@havat-hashikma.co.il",
};

describe("PrimaryContactButton", () => {
  it("whatsapp variant — green button with WhatsApp icon", () => {
    render(
      <PrimaryContactButton
        producer={{ ...base, primary_contact_method: "whatsapp" }}
      />,
    );
    const btn = screen.getByTestId("primary-contact-button");
    expect(btn).toHaveAttribute("data-method", "whatsapp");
    expect(btn.getAttribute("href")).toContain("wa.me/");
    expect(screen.getByText("שלחי הודעה")).toBeInTheDocument();
    expect(screen.getByTestId("icon-whatsapp")).toBeInTheDocument();
  });

  it("phone variant — tel: href", () => {
    render(
      <PrimaryContactButton producer={{ ...base, primary_contact_method: "phone" }} />,
    );
    const btn = screen.getByTestId("primary-contact-button");
    expect(btn).toHaveAttribute("href", "tel:0501234567");
    expect(screen.getByText("התקשרי")).toBeInTheDocument();
  });

  it("website variant — opens in a new tab with rel=noopener", () => {
    render(
      <PrimaryContactButton
        producer={{ ...base, primary_contact_method: "website" }}
      />,
    );
    const btn = screen.getByTestId("primary-contact-button");
    expect(btn).toHaveAttribute("target", "_blank");
    expect(btn.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("בקרי באתר")).toBeInTheDocument();
  });

  it("email variant — mailto: href", () => {
    render(
      <PrimaryContactButton
        producer={{ ...base, primary_contact_method: "email" }}
      />,
    );
    const btn = screen.getByTestId("primary-contact-button");
    expect(btn).toHaveAttribute("href", "mailto:hello@havat-hashikma.co.il");
    expect(screen.getByText("שלחי מייל")).toBeInTheDocument();
  });

  it("returns null when the required field is missing", () => {
    const { container } = render(
      <PrimaryContactButton
        producer={{ ...base, phone: null, primary_contact_method: "whatsapp" }}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when producer is null", () => {
    const { container } = render(<PrimaryContactButton producer={null} />);
    expect(container.innerHTML).toBe("");
  });
});
