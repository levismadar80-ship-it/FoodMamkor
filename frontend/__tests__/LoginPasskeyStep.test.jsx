import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";

/**
 * MEH-3305 — /login while an admin's passkey step is open.
 *
 * Two cells of (ticket open / closed): open → only the recovery-code panel
 * (no password form, no Google button); closed → the usual page, no panel.
 * Mocks mirror LoginPasswordRequired.test.jsx, with Google configured so the
 * OAuth block's hiding is actually exercised.
 */

const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key) => key, { rich: (key) => key }),
}));
const authRef = { current: {} };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current, PasskeyStepRequired: class extends Error {} }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "g-id", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));
vi.mock("next/image", () => ({ default: () => null }));
// The /login terms notice (MEH-2080) links through the locale-aware Link.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/link", () => ({ default: ({ children }) => children }));
vi.mock("@phosphor-icons/react", () => ({
  CaretDown: () => <span />,
  ArrowRight: () => null,
  EnvelopeSimple: () => null,
  Eye: () => null,
  EyeSlash: () => null,
  Lock: () => null,
}));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => <div data-testid="google-btn" /> }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

describe("MEH-3305 — /login with the passkey step", () => {
  it("ticket open: the recovery panel, and neither the form nor Google", () => {
    authRef.current = {
      login: vi.fn(),
      passkeyTicket: "tk",
      loginWithRecoveryCode: vi.fn(),
      cancelPasskeyStep: vi.fn(),
    };
    render(<LoginClient />);
    expect(screen.getByTestId("passkey-recovery")).toBeInTheDocument();
    expect(screen.queryByTestId("login-password")).toBeNull();
    expect(screen.queryByTestId("google-btn")).toBeNull();
  });

  it("no ticket: the usual page and no panel", () => {
    authRef.current = { login: vi.fn(), passkeyTicket: null };
    render(<LoginClient />);
    expect(screen.queryByTestId("passkey-recovery")).toBeNull();
    expect(screen.getByTestId("login-password")).toBeInTheDocument();
    expect(screen.getByTestId("google-btn")).toBeInTheDocument();
  });
});
