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

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@phosphor-icons/react", () => ({
  EnvelopeSimple: (props) => <span data-testid="icon-envelope" {...props} />,
  X: (props) => <span data-testid="icon-x" {...props} />,
}));

const DISMISS_KEY = "verify-banner-dismissed";
const BANNER_TEXT = "auth.verify.banner";
const DISMISS_LABEL = "סגירת הודעת אימות";

describe("VerifyBanner (MEH-1071)", () => {
  beforeEach(() => {
    userRef.current = null;
    sessionStorage.clear();
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
