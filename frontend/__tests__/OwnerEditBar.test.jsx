/**
 * MEH-1209: owner-only edit entry on the public business page.
 *
 * The bar renders ONLY when the logged-in user owns this producer
 * (user.producer_id === producer.id). Every non-owner viewer — guest,
 * consumer, a different producer, admin — gets 0 DOM (zero reserved
 * space, zero CLS). Owner CTA → /producer/dashboard/edit.
 *
 * Ownership is read from useAuth() inside the component (the source is
 * UserOut.producer_id, serialized by /auth/me), so the gate lives in one
 * place and the parent (ProducerDetail) mounts it unconditionally.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mutable current user — each test sets it before render (DashboardLoadError
// convention). useAuth reads it lazily so one mock covers every viewer role.
let currentUser = null;
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@phosphor-icons/react", () => ({
  PencilSimple: (p) => <span {...p} />,
}));

import OwnerEditBar from "@/app/[locale]/producer/[id]/components/OwnerEditBar";

const producer = { id: 42, name: "מאפיית דנה" };

beforeEach(() => {
  currentUser = null;
});

describe("OwnerEditBar", () => {
  it("renders for the owner with a CTA to the edit page", () => {
    currentUser = { id: 7, role: "producer", producer_id: 42 };
    render(<OwnerEditBar producer={producer} />);
    const cta = screen.getByRole("link");
    expect(cta).toHaveAttribute("href", "/producer/dashboard/edit");
    expect(screen.getByText("producer.detail.owner_bar.label")).toBeInTheDocument();
  });

  it("renders nothing for a guest (no user)", () => {
    currentUser = null;
    const { container } = render(<OwnerEditBar producer={producer} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a consumer (no producer_id)", () => {
    currentUser = { id: 7, role: "consumer", producer_id: null };
    const { container } = render(<OwnerEditBar producer={producer} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a different producer", () => {
    currentUser = { id: 7, role: "producer", producer_id: 99 };
    const { container } = render(<OwnerEditBar producer={producer} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an admin who does not own this producer", () => {
    currentUser = { id: 7, role: "admin", producer_id: null };
    const { container } = render(<OwnerEditBar producer={producer} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when producer is missing", () => {
    currentUser = { id: 7, role: "producer", producer_id: 42 };
    const { container } = render(<OwnerEditBar producer={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
