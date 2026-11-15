// MEH-2991: every contact tap on the organizer page is counted — the primary
// button and the quiet pills alike. Before this, neither was.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const trackChannelClick = vi.fn();
vi.mock("@/lib/contact-tracking", () => ({ trackChannelClick: (...a) => trackChannelClick(...a) }));

import OrganizerContactLink from "@/app/[locale]/organizers/[slug]/OrganizerContactLink";
import OrganizerPrimaryContact from "@/app/[locale]/organizers/[slug]/OrganizerPrimaryContact";

describe("organizer page — contact taps are counted", () => {
  beforeEach(() => trackChannelClick.mockClear());

  it("a quiet pill reports its own channel and the organizer's id, once per tap", () => {
    render(
      <OrganizerContactLink
        channel={{ key: "instagram", href: "https://instagram.com/x" }}
        label="אינסטגרם"
        producerId="org-1"
      />,
    );
    expect(trackChannelClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("organizer-contact-instagram"));
    expect(trackChannelClick.mock.calls).toEqual([["org-1", "instagram"]]);
  });

  it("the primary button reports its channel too", () => {
    render(
      <OrganizerPrimaryContact
        channel={{ key: "whatsapp", href: "https://wa.me/972521234567" }}
        label="וואטסאפ"
        producerId="org-1"
      />,
    );
    fireEvent.click(screen.getByTestId("organizer-contact-whatsapp"));
    expect(trackChannelClick.mock.calls).toEqual([["org-1", "whatsapp"]]);
  });

  it("phone and email pills open in place; other channels open a new tab", () => {
    const { rerender } = render(
      <OrganizerContactLink channel={{ key: "phone", href: "tel:04-6123456" }} label="טלפון" producerId="o" />,
    );
    expect(screen.getByTestId("organizer-contact-phone").getAttribute("target")).toBeNull();
    rerender(
      <OrganizerContactLink channel={{ key: "website", href: "https://x.il" }} label="אתר" producerId="o" />,
    );
    expect(screen.getByTestId("organizer-contact-website").getAttribute("target")).toBe("_blank");
  });
});
