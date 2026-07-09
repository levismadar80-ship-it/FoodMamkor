import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";

/**
 * MEH-844 — regression sentinel for MEH-835 / MEH-418.
 *
 * The S9 "Two Doors" port (MEH-131/788) twice reintroduced a `minLength={8}`
 * HTML attribute on the /login password input, each time re-breaking login
 * for legacy accounts whose password predates the MEH-306 12-char policy
 * (native HTML5 validation blocks submit before the handler — silent lockout).
 * This test fails the moment a minLength floor reappears on that input.
 *
 * Mocks only — no production change (no data-testid / export added). The
 * input is reached via its existing <label htmlFor="login-password">.
 */

const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));

// next-intl bare-key translator (repo pattern: Header/ProducerCard/JwtExpiryReauth)
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ login: vi.fn() }) }));

// OAuth off → keeps this sentinel focused on the password field
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }) => children }));
vi.mock("@phosphor-icons/react", () => ({
  ArrowRight: () => null,
  EnvelopeSimple: () => null,
  Eye: () => null,
  EyeSlash: () => null,
  Lock: () => null,
}));

// Imported by LoginClient even when the OAuth block is hidden.
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

describe("MEH-844 sentinel — /login password input has no minLength floor", () => {
  it("renders a required password input with NO minLength (legacy <8-char accounts must sign in)", () => {
    render(<LoginClient />);

    const pw = screen.getByLabelText("password_label");
    expect(pw).toBeInTheDocument();
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toBeRequired();

    // The regression: MEH-835/MEH-418. A minLength here re-breaks legacy login.
    // React's `minLength` prop emits the lowercase `minlength` DOM attribute;
    // assert the literal stored form.
    expect(pw).not.toHaveAttribute("minlength");
  });
});
