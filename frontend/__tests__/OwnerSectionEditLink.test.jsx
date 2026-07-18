/**
 * MEH-1306: owner-only per-section edit pencil on the public business page.
 *
 * Mirrors the OwnerEditBar harness (MEH-1209): mutable currentUser + mocked
 * auth/i18n/nav modules. The component renders ONLY for the owner
 * (user.producer_id === producerId); every other viewer gets 0 DOM — zero
 * reserved space, zero CLS. Owner link → /producer/dashboard/edit#<anchor>
 * (the MEH-1116 applyHash contract auto-expands the card).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mutable current user — each test sets it before render (OwnerEditBar
// convention). useAuth reads it lazily so one mock covers every viewer role.
let currentUser = null;
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key) => key;
    return t;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({
  PencilSimple: (p) => <span {...p} />,
}));

import OwnerSectionEditLink from "@/components/OwnerSectionEditLink";

beforeEach(() => {
  currentUser = null;
});

describe("OwnerSectionEditLink (MEH-1306)", () => {
  it("renders a pencil link into the matching edit anchor for the owner", () => {
    currentUser = { id: 7, role: "producer", producer_id: 42 };
    render(<OwnerSectionEditLink producerId={42} anchor="bio" sectionKey="bio" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/producer/dashboard/edit#bio");
    expect(link).toHaveAttribute("data-testid", "section-edit-bio");
    // ≥44px tap target classes (MEH-813).
    expect(link.className).toContain("min-h-[44px]");
    expect(link.className).toContain("min-w-[44px]");
  });

  it("uses the existing contact-channels anchor for the contact section", () => {
    currentUser = { id: 7, role: "producer", producer_id: 42 };
    render(
      <OwnerSectionEditLink producerId={42} anchor="contact-channels" sectionKey="contact" />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/producer/dashboard/edit#contact-channels",
    );
  });

  it("renders nothing for a guest (no user)", () => {
    currentUser = null;
    const { container } = render(
      <OwnerSectionEditLink producerId={42} anchor="bio" sectionKey="bio" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a consumer (no producer_id)", () => {
    currentUser = { id: 7, role: "consumer", producer_id: null };
    const { container } = render(
      <OwnerSectionEditLink producerId={42} anchor="bio" sectionKey="bio" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a different producer", () => {
    currentUser = { id: 7, role: "producer", producer_id: 99 };
    const { container } = render(
      <OwnerSectionEditLink producerId={42} anchor="bio" sectionKey="bio" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when producerId is missing (null === null guard)", () => {
    currentUser = { id: 7, role: "producer", producer_id: null };
    const { container } = render(
      <OwnerSectionEditLink producerId={null} anchor="bio" sectionKey="bio" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
