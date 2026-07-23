import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-1489 chunk C — /login + /register redirect an already-authenticated
 * visitor to the clamped ?redirect= target (open-redirect guard preserved),
 * and gate their form render so it never flashes. Guests keep the form; the
 * MEH-328 register inbox flow keeps user null so it is never gated.
 *
 * safeInternalRedirect is intentionally NOT mocked — the clamp is exercised.
 */

const replaceMock = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  useSearchParams: () => paramsRef.current,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));

// Mutable auth state — flipped per test. Provides login + register so both
// components' destructures resolve.
const authState = { user: null, loading: false };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    login: vi.fn(),
    register: vi.fn().mockResolvedValue({}),
  }),
}));

// OAuth off — keeps the forms focused; not under test here.
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }) => children }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }) => children,
}));
vi.mock("@phosphor-icons/react", () => ({
  ArrowRight: () => null,
  EnvelopeSimple: () => null,
  Eye: () => null,
  EyeSlash: () => null,
  Lock: () => null,
  Leaf: () => null,
}));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span data-testid="spinner" /> }));
vi.mock("@/components/PasswordInput", () => ({ default: () => <input data-testid="pw" /> }));
vi.mock("@/components/ui/Input", () => ({
  default: ({ label, ...props }) => (
    <label>
      {label}
      <input {...props} />
    </label>
  ),
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (x) => x, IMAGE_RATIOS: {} }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/lib/passwordMessages", () => ({ firstFailureMessage: () => "" }));
vi.mock("@/lib/validators", () => ({
  validateEmail: (v) => typeof v === "string" && v.includes("@") && v.includes("."),
  PASSWORD_MIN_LENGTH: 12,
}));

beforeEach(() => {
  replaceMock.mockClear();
  authState.user = null;
  authState.loading = false;
  paramsRef.current = new URLSearchParams("");
});

describe("LoginClient — authenticated redirect (MEH-1489 chunk C)", () => {
  it("authenticated visitor is replaced to the clamped ?redirect= target; form gated", () => {
    paramsRef.current = new URLSearchParams({ redirect: "/producers" });
    authState.user = { email: "u@example.com", role: "consumer" };
    render(<LoginClient />);
    expect(replaceMock).toHaveBeenCalledWith("/producers");
    // form not rendered while redirecting
    expect(screen.queryByLabelText("password_label")).not.toBeInTheDocument();
  });

  it("open-redirect param is clamped to / (MEH-810 preserved)", () => {
    paramsRef.current = new URLSearchParams({ redirect: "https://evil.com" });
    authState.user = { email: "u@example.com" };
    render(<LoginClient />);
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("guest sees the login form, no redirect", () => {
    render(<LoginClient />);
    expect(screen.getByLabelText("password_label")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("while auth resolves the form is gated and no redirect fires", () => {
    authState.loading = true;
    render(<LoginClient />);
    expect(screen.queryByLabelText("password_label")).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("RegisterClient — authenticated redirect (MEH-1489 chunk C)", () => {
  it("authenticated visitor is replaced to the clamped target; form gated", () => {
    paramsRef.current = new URLSearchParams({ redirect: "/favorites" });
    authState.user = { email: "u@example.com", role: "consumer" };
    render(<RegisterClient />);
    expect(replaceMock).toHaveBeenCalledWith("/favorites");
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("guest sees the signup form (user null → register inbox flow not gated), no redirect", () => {
    render(<RegisterClient />);
    // name field label (real Input mock renders the label text)
    expect(screen.getByText("auth.register.consumer.fields.name")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
