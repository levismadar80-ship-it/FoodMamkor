import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-1919 — the /register success affordance is quiet and blur-gated.
 *
 * Three assertions, each of which fails against the pre-MEH-1919 component
 * (demonstrated fail→pass, workflow testing rule "every new guard test must be
 * shown failing"):
 *
 *   1. the NAME field carries no success affordance in any state;
 *   2. the "✓ תקין" successText is gone from both fields;
 *   3. the EMAIL success tint is armed by blur and disarmed by the next
 *      keystroke — the old `emailTouched` gate was sticky, so once the field
 *      had been blurred once the tint re-evaluated per character.
 *
 * The error-path assertions at the bottom are NOT discriminating (they pass on
 * both versions) and are here as a regression guard: MEH-1919 must not have
 * moved the invalid-state behaviour, which still reads the sticky
 * name/emailTouched flags on purpose.
 *
 * Mock shape mirrors RegisterOAuthRedirect.test.jsx. next-intl returns the key
 * path, so `valid_hint` is assertable as rendered text.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ register: vi.fn().mockResolvedValue({}) }),
}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));
vi.mock("next/image", () => ({ default: () => null }));
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
  Check: () => <span data-testid="success-check" />,
}));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/lib/passwordMessages", () => ({ firstFailureMessage: () => "" }));
vi.mock("@/lib/validators", () => ({
  validateEmail: (value) =>
    typeof value === "string" && value.includes("@") && value.includes("."),
  PASSWORD_MIN_LENGTH: 12,
}));
vi.mock("@/components/PasswordInput", () => ({
  default: ({ ariaLabel, value, onChange }) => (
    <input aria-label={ariaLabel} value={value || ""} onChange={onChange} data-testid="pw" />
  ),
}));

const VALID_HINT = "auth.register.consumer.validation.valid_hint";
const NAME_REQUIRED = "auth.register.consumer.validation.name_required";
const EMAIL_INVALID = "auth.register.consumer.validation.email_invalid";

/** ui/Input paints the success state as `border-primary` on the input itself. */
const hasSuccessTint = (el) => el.className.split(/\s+/).includes("border-primary");

function setup() {
  const { container } = render(<RegisterClient />);
  return {
    container,
    name: container.querySelector("#register-name"),
    email: container.querySelector("#register-email"),
  };
}

describe("MEH-1919 — /register success affordance", () => {
  it("self-test: the tint detector reads border-primary and nothing adjacent", () => {
    // Runs first: if this classifier can't tell a tinted input from an
    // untinted one, nothing it reports below is worth reading.
    expect(hasSuccessTint({ className: "w-full border-primary text-text" })).toBe(true);
    expect(hasSuccessTint({ className: "w-full border-border focus:border-primary" })).toBe(false);
    expect(hasSuccessTint({ className: "w-full border-error" })).toBe(false);
  });

  it("name field shows no success affordance after a valid entry + blur", () => {
    const { name } = setup();
    fireEvent.change(name, { target: { value: "שמדר" } });
    fireEvent.blur(name);

    expect(hasSuccessTint(name)).toBe(false);
    expect(screen.queryByTestId("success-check")).toBeNull();
    expect(screen.queryByText(VALID_HINT)).toBeNull();
  });

  it("email shows nothing while typing, tints on blur, and un-tints on the next keystroke", () => {
    const { email } = setup();

    fireEvent.change(email, { target: { value: "a@b.co" } });
    expect(hasSuccessTint(email)).toBe(false); // valid, but never blurred

    fireEvent.blur(email);
    expect(hasSuccessTint(email)).toBe(true);

    // The sticky-gate regression: editing after a blur must hide the tint again.
    fireEvent.change(email, { target: { value: "a@b.com" } });
    expect(hasSuccessTint(email)).toBe(false);

    fireEvent.blur(email);
    expect(hasSuccessTint(email)).toBe(true);
  });

  it("never renders the successText hint on either field", () => {
    const { name, email } = setup();
    fireEvent.change(name, { target: { value: "שמדר" } });
    fireEvent.blur(name);
    fireEvent.change(email, { target: { value: "a@b.co" } });
    fireEvent.blur(email);

    expect(screen.queryByText(VALID_HINT)).toBeNull();
    expect(screen.queryByTestId("success-check")).toBeNull();
  });

  // --- regression guard (non-discriminating: passes on both versions) ---

  it("error states are unchanged — blur-raised, and persistent while correcting", () => {
    const { name, email } = setup();

    fireEvent.blur(name);
    expect(screen.getByText(NAME_REQUIRED)).toBeTruthy();

    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.blur(email);
    expect(screen.getByText(EMAIL_INVALID)).toBeTruthy();

    // Still wrong mid-correction → the error must stay put, not flicker off.
    fireEvent.change(email, { target: { value: "not-an-email2" } });
    expect(screen.getByText(EMAIL_INVALID)).toBeTruthy();
  });
});
