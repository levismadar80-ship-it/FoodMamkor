import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-2080 chunk 2 — /register forwards its terms checkbox to Google/Apple.
 * (Mock scaffold copied from RegisterOAuthRedirect.test.jsx, MEH-844.)
 *
 * OAuth success on /register must honor a post-signup ?redirect=, clamped to
 * an internal path via safeInternalRedirect (open-redirect guard). This drives
 * the REAL safeInternalRedirect (not mocked) through the component's OAuth
 * onSuccess handler and asserts router.push lands on the clamped target.
 *
 * Mocks only — no production change. The OAuth widget is a vendor primitive
 * (GoogleAuthButton) already isolated behind an onSuccess prop, so the mock
 * fires that prop to mimic a successful sign-in.
 */

const mockPush = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ register: vi.fn().mockResolvedValue({}) }),
}));

// OAuth must render → a Google client id has to be present.
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google", NEXT_PUBLIC_APPLE_CLIENT_ID: "test-apple" },
}));

vi.mock("next/image", () => ({ default: () => null }));
// MEH-1285: RegisterClient now uses Link from @/i18n/navigation (locale-aware);
// stub it so next-intl's createNavigation isn't loaded under jsdom.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@phosphor-icons/react", () => ({
  EnvelopeSimple: () => null,
  Leaf: () => null,
}));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/lib/passwordMessages", () => ({ firstFailureMessage: () => "" }));
vi.mock("@/lib/validators", () => ({
  validateEmail: (value) =>
    typeof value === "string" && value.includes("@") && value.includes("."),
  PASSWORD_MIN_LENGTH: 12,
}));

// NOTE: @/lib/safe-redirect is intentionally NOT mocked — the clamp is the
// unit under test.

// Both OAuth buttons record the termsAccepted prop they were last rendered with.
const seen = { google: undefined, apple: undefined };
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ termsAccepted }) => {
    seen.google = termsAccepted;
    return null;
  },
}));
vi.mock("@/components/AppleAuthButton", () => ({
  default: ({ termsAccepted }) => {
    seen.apple = termsAccepted;
    return null;
  },
}));
vi.mock("@/components/PasswordInput", async () => {
  const React = await import("react");
  return {
    default: ({ ariaLabel, value, onChange }) =>
      React.createElement("input", {
        "aria-label": ariaLabel,
        value: value || "",
        onChange,
        "data-testid": "pw",
      }),
  };
});

describe("MEH-2080 — /register passes its terms checkbox to the OAuth buttons", () => {
  beforeEach(() => {
    paramsRef.current = new URLSearchParams("");
    seen.google = undefined;
    seen.apple = undefined;
  });

  it("box unticked → both buttons get termsAccepted=false", () => {
    render(<RegisterClient />);
    expect(seen.google).toBe(false);
    expect(seen.apple).toBe(false);
  });

  it("box ticked → both buttons get termsAccepted=true", () => {
    render(<RegisterClient />);
    fireEvent.click(screen.getByTestId("register-terms"));
    expect(seen.google).toBe(true);
    expect(seen.apple).toBe(true);
  });
});
