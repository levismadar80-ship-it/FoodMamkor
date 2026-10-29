import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-2080 chunk 2 forwarded /register's terms checkbox to Google/Apple.
 * MEH-2577 moved the buttons above the form, as on /login, so they carry
 * consent themselves under /login's consent line; the checkbox now gates
 * only the email form. (Mock scaffold from RegisterOAuthRedirect.test.jsx.)
 *
 * Both OAuth buttons are mocked to record the termsAccepted prop they were
 * last rendered with.
 */

const mockPush = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key) => key;
    // MEH-2577: the consent line is a t.rich string with tos/privacy tags.
    t.rich = (key, tags) => (
      <>
        {key} {tags.tos("tos")} {tags.privacy("privacy")}
      </>
    );
    return t;
  },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ register: vi.fn().mockResolvedValue({}) }),
}));

// OAuth must render → a Google client id has to be present.
// Mutable so one case can switch both providers off (RegisterClient reads env
// at render).
const mockEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google",
  NEXT_PUBLIC_APPLE_CLIENT_ID: "test-apple",
}));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

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

// Both OAuth buttons record the termsAccepted prop they were last rendered with;
// Google's stand-in also exposes a button that fires its onError.
const seen = { google: undefined, apple: undefined };
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ termsAccepted, onError }) => {
    seen.google = termsAccepted;
    return (
      <button type="button" data-testid="google-fail" onClick={() => onError("google-failed")}>
        g
      </button>
    );
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
    // Reports validity like the real one, so the terms box is the only gate
    // left once the other fields are filled.
    default: ({ ariaLabel, value, onChange, onValidityChange }) =>
      React.createElement("input", {
        "aria-label": ariaLabel,
        value: value || "",
        onChange: (e) => {
          onChange(e);
          onValidityChange?.(e.target.value.length >= 12);
        },
        "data-testid": "pw",
      }),
  };
});

describe("MEH-2577 — /register opens with Google/Apple, under a consent line", () => {
  beforeEach(() => {
    paramsRef.current = new URLSearchParams("");
    seen.google = undefined;
    seen.apple = undefined;
  });

  // The buttons sit ABOVE the terms checkbox now, so they cannot read it:
  // they carry the consent the line under them states (/login's MEH-2080
  // sign-in wrap). Unticked box must still mean termsAccepted=true.
  it("both buttons carry termsAccepted=true whether or not the box is ticked", () => {
    render(<RegisterClient />);
    expect(screen.getByTestId("register-terms").checked).toBe(false);
    expect(seen.google).toBe(true);
    expect(seen.apple).toBe(true);
    fireEvent.click(screen.getByTestId("register-terms"));
    expect(seen.google).toBe(true);
    expect(seen.apple).toBe(true);
  });

  it("renders /login's consent line, with links to /terms and /privacy", () => {
    render(<RegisterClient />);
    const line = screen.getByTestId("register-oauth-terms");
    expect(line.textContent).toContain("auth.login.oauth_terms");
    const hrefs = [...line.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/terms", "/privacy"]);
  });

  it("the consent line comes BEFORE the email form", () => {
    render(<RegisterClient />);
    const line = screen.getByTestId("register-oauth-terms");
    const form = screen.getByTestId("register-form");
    expect(line.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the checkbox still gates the email form's submit", () => {
    render(<RegisterClient />);
    fireEvent.change(screen.getByTestId("register-name"), { target: { value: "דנה" } });
    fireEvent.change(screen.getByTestId("register-email"), { target: { value: "dana@example.org" } });
    fireEvent.change(screen.getByTestId("pw"), { target: { value: "a-long-enough-pw" } });
    const submit = screen.getByTestId("register-submit");
    expect(submit.disabled).toBe(true); // everything valid but the box
    fireEvent.click(screen.getByTestId("register-terms"));
    expect(submit.disabled).toBe(false);
  });

  it("no provider configured: no buttons, no consent line, no divider — the form alone", () => {
    const saved = { ...mockEnv };
    mockEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "";
    mockEnv.NEXT_PUBLIC_APPLE_CLIENT_ID = "";
    try {
      render(<RegisterClient />);
      expect(screen.queryByTestId("register-oauth-terms")).toBeNull();
      expect(screen.queryByText("auth.register.consumer.oauth_divider")).toBeNull();
      expect(seen.google).toBeUndefined();
      expect(screen.getByTestId("register-form")).toBeTruthy();
    } finally {
      Object.assign(mockEnv, saved);
    }
  });

  it("a Google failure shows under the consent line, not inside the email form", () => {
    render(<RegisterClient />);
    fireEvent.click(screen.getByTestId("google-fail"));
    const err = screen.getByTestId("register-oauth-error");
    expect(err.textContent).toBe("google-failed");
    expect(screen.getByTestId("register-form").contains(err)).toBe(false);
    expect(screen.queryByTestId("register-error")).toBeNull();
    // …and it clears when the reader moves on to the email form.
    fireEvent.change(screen.getByTestId("register-name"), { target: { value: "דנה" } });
    fireEvent.change(screen.getByTestId("register-email"), { target: { value: "dana@example.org" } });
    fireEvent.change(screen.getByTestId("pw"), { target: { value: "a-long-enough-pw" } });
    fireEvent.click(screen.getByTestId("register-terms"));
    fireEvent.submit(screen.getByTestId("register-form"));
    expect(screen.queryByTestId("register-oauth-error")).toBeNull();
  });
});
