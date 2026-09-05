import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";

/**
 * MEH-2256 — the /login password field's touched-empty error state.
 *
 * `LoginClient.jsx` used to compute
 *   passwordTouched && password.length > 0 && password.length < 1
 * which no integer satisfies, so «הזינו סיסמה» (`password_required`) and the
 * field's `aria-invalid` were dead code from this surface. The predicate is
 * now `passwordTouched && password.length === 0`.
 *
 * Discrimination (MEH-1619): against the pre-fix predicate the first test's
 * two expectations fail (no alert, no aria-invalid); the second test is the
 * control that passes in both worlds and pins the "typed → clears" edge.
 *
 * Mocks mirror LoginMinLengthSentinel.test.jsx — bare-key translator, so the
 * message is asserted by its i18n key, not its Hebrew copy.
 */

const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ login: vi.fn() }) }));
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
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

describe("MEH-2256 — /login password touched-empty is an accessible error state", () => {
  it("blurring the empty password field renders the required alert and aria-invalid", () => {
    render(<LoginClient />);
    const pw = screen.getByTestId("login-password");

    // Untouched: neutral, no alert.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(pw).not.toHaveAttribute("aria-invalid");

    fireEvent.focus(pw);
    fireEvent.blur(pw);

    expect(screen.getByRole("alert")).toHaveTextContent("password_required");
    expect(pw).toHaveAttribute("aria-invalid", "true");
  });

  it("typing one character clears the error and the success line takes over (control)", () => {
    render(<LoginClient />);
    const pw = screen.getByTestId("login-password");

    fireEvent.focus(pw);
    fireEvent.blur(pw);
    fireEvent.change(pw, { target: { value: "x" } });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(pw).not.toHaveAttribute("aria-invalid");
    expect(screen.getByTestId("login-password-valid")).toBeInTheDocument();
  });
});
