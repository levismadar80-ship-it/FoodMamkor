import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VerifyBanner from "@/components/VerifyBanner";

// MEH-1071: VerifyBanner brand restyle + per-session dismiss. Covers the four
// render/dismiss states: unverified shows, verified hidden, hidden after a
// dismiss click, and sessionStorage written on dismiss.

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current }),
}));

// Namespace-aware t() that returns the key so assertions can target it.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));

const pathRef = { current: "/" };
vi.mock("@/i18n/navigation", () => ({ usePathname: () => pathRef.current }));

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@phosphor-icons/react", () => ({
  EnvelopeSimple: (props) => <span data-testid="icon-envelope" {...props} />,
  X: (props) => <span data-testid="icon-x" {...props} />,
}));

const DISMISS_KEY = "verify-banner-dismissed";
const BANNER_TEXT = "auth.verify.banner";
const DISMISS_LABEL = "auth.verify.dismiss";

describe("VerifyBanner (MEH-1071)", () => {
  beforeEach(() => {
    userRef.current = null;
    pathRef.current = "/";
    sessionStorage.clear();
  });

  // MEH-3660: on a draft business's dashboard the checklist carries the email
  // row, so the site-wide banner would say the same thing twice.
  it("is hidden on the dashboard of a business in draft — the checklist row replaces it", () => {
    userRef.current = { id: "u1", email_verified: false, producer_status: "draft", producer_kind: "producer" };
    pathRef.current = "/producer/dashboard";
    const { container } = render(<VerifyBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("still shows for that business on any other page, and for an organizer draft on the dashboard", () => {
    userRef.current = { id: "u1", email_verified: false, producer_status: "draft", producer_kind: "producer" };
    pathRef.current = "/map";
    const { unmount } = render(<VerifyBanner />);
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument();
    unmount();
    userRef.current = { id: "u1", email_verified: false, producer_status: "draft", producer_kind: "organizer" };
    pathRef.current = "/producer/dashboard";
    render(<VerifyBanner />);
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument();
  });

  it("renders the nudge for a logged-in, unverified user", () => {
    userRef.current = { id: "u1", email_verified: false };
    render(<VerifyBanner />);
    expect(screen.getByText(BANNER_TEXT)).toBeInTheDocument();
    expect(screen.getByLabelText(DISMISS_LABEL)).toBeInTheDocument();
  });

  it("renders nothing for a verified user", () => {
    userRef.current = { id: "u1", email_verified: true };
    const { container } = render(<VerifyBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it("hides the banner after the dismiss button is clicked", () => {
    userRef.current = { id: "u1", email_verified: false };
    render(<VerifyBanner />);
    fireEvent.click(screen.getByLabelText(DISMISS_LABEL));
    expect(screen.queryByText(BANNER_TEXT)).toBeNull();
  });

  it("writes the per-session dismiss flag to sessionStorage on dismiss", () => {
    userRef.current = { id: "u1", email_verified: false };
    render(<VerifyBanner />);
    expect(sessionStorage.getItem(DISMISS_KEY)).toBeNull();
    fireEvent.click(screen.getByLabelText(DISMISS_LABEL));
    expect(sessionStorage.getItem(DISMISS_KEY)).toBe("1");
  });
});
