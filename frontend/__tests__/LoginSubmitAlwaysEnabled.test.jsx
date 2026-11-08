import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";

/**
 * MEH-2623 — /login's submit is never disabled for invalid input.
 *
 * It used to be `disabled={loading || !formIsValid}`: a grey button with no
 * reason, and in Chrome the first tap was lost when the browser had autofilled
 * values React had not seen yet. Now the click validates: the first bad field
 * shows its message and takes focus, and login() is never called.
 *
 * Discrimination: against the old button every case here fails at
 * `submit.disabled === false` (empty form) or never reaches handleSubmit.
 * Mocks mirror LoginPasswordRequired.test.jsx (bare-key translator).
 */

const loginMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ login: loginMock }) }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));
vi.mock("next/image", () => ({ default: () => null }));
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
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

beforeEach(() => {
  loginMock.mockReset();
  loginMock.mockResolvedValue({ role: "consumer" });
});

describe("MEH-2623 — /login submit validates on click instead of sitting disabled", () => {
  it("empty form: enabled; the click shows the email message, focuses it, sends nothing", () => {
    render(<LoginClient />);
    const submit = screen.getByTestId("login-submit");
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain("email_invalid");
    expect(screen.getByTestId("login-email")).toHaveFocus();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("valid email, empty password: the click shows password_required and focuses it", () => {
    render(<LoginClient />);
    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "a@b.co" } });
    fireEvent.click(screen.getByTestId("login-submit"));
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain("password_required");
    expect(screen.getByTestId("login-password")).toHaveFocus();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("autofill React never saw: values are read from the form and login() gets them", async () => {
    render(<LoginClient />);
    // Set the DOM value WITHOUT a React change event — what an unexposed
    // autofill looks like to the component.
    const setNative = (el, v) =>
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    setNative(screen.getByTestId("login-email"), "auto@fill.co");
    setNative(screen.getByTestId("login-password"), "secret");
    fireEvent.click(screen.getByTestId("login-submit"));
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith("auto@fill.co", "secret"));
  });
});
