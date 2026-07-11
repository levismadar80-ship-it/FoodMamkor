import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WhatsAppShareButton from "@/components/WhatsAppShareButton";

// MEH-1049 (MEH-1074 Task A): the viral-share affordance next to the WhatsApp
// contact CTA was re-disambiguated — neutral ShareNetwork icon + "שיתוף עם
// חברים" copy (was a green WhatsappLogo + "שלחו לחברה"), so it no longer reads
// as a second contact path.

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const flat = {
      default_message: "גיליתי את {name} — {url}",
      share_aria: "שיתוף עם חברים בוואטסאפ",
      share_to_friend: "שיתוף עם חברים",
    };
    return (key) => flat[key] || key;
  },
}));

vi.mock("@phosphor-icons/react", () => ({
  ShareNetwork: (props) => <span data-testid="icon-sharenetwork" {...props} />,
  WhatsappLogo: (props) => <span data-testid="icon-whatsapplogo" {...props} />,
}));

describe("WhatsAppShareButton (MEH-1049 Task A)", () => {
  it("renders the neutral ShareNetwork icon, not the WhatsappLogo", () => {
    render(<WhatsAppShareButton producer={{ id: "p-1", name: "עסק", slug: "esek" }} url="https://x/y" />);
    expect(screen.getByTestId("icon-sharenetwork")).toBeInTheDocument();
    expect(screen.queryByTestId("icon-whatsapplogo")).not.toBeInTheDocument();
  });

  it("uses the disambiguated 'שיתוף עם חברים' label + matching aria (label-in-name)", () => {
    render(<WhatsAppShareButton producer={{ id: "p-1", name: "עסק", slug: "esek" }} url="https://x/y" />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("שיתוף עם חברים");
    // WCAG 2.5.3: the accessible name contains the visible label
    expect(link.getAttribute("aria-label")).toContain("שיתוף עם חברים");
    expect(link.getAttribute("href")).toContain("wa.me");
  });

  it("returns null without a producer", () => {
    const { container } = render(<WhatsAppShareButton producer={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
