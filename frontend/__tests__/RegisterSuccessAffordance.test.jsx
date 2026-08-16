import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-1919 — NEITHER /register field carries a success affordance, in any state.
 *
 * Superseded the first pass, which kept a blur-gated border tint on the email.
 * That tint was removed (Sapir, 06/08): with no `successText` the primitive
 * renders no Check either (ui/Input.jsx:117-125 puts the icon inside that span),
 * so the state was carried by colour alone — WCAG 1.4.1. Per NN/g, success
 * indicators belong on fields whose validity the user cannot self-assess;
 * name and email are not those fields.
 *
 * What each assertion buys, stated because "no success anywhere" is easy to
 * satisfy accidentally:
 *
 *   1-2. name and email show no success token, no Check, and no "✓ תקין" —
 *        across typing, blur-with-valid-value, and re-typing after blur. These
 *        fail against BOTH earlier versions of the component (the original,
 *        and the border-tint interim).
 *   3.   the tint does not reappear on a later blur — the interim behaviour's
 *        signature, and the one a careless revert would restore.
 *
 * The error-path assertions at the bottom are deliberately NON-discriminating:
 * they pass on all three versions. They are a regression guard, not evidence —
 * removing the success state must not have touched the invalid state, which
 * still reads the sticky `*Touched` flags on purpose.
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

  it("email shows no success affordance in ANY interaction state", () => {
    const { email } = setup();

    // Walked as a sequence rather than four separate renders on purpose: the
    // interim implementation only tinted *after* a blur, so a test that never
    // blurs would pass against it and prove nothing.
    fireEvent.change(email, { target: { value: "a@b.co" } });
    expect(hasSuccessTint(email), "while typing a valid address").toBe(false);

    fireEvent.blur(email);
    expect(hasSuccessTint(email), "blurred with a valid address").toBe(false);

    fireEvent.change(email, { target: { value: "a@b.com" } });
    expect(hasSuccessTint(email), "re-typing after a blur").toBe(false);

    // The interim behaviour re-armed on every blur; this is the state that
    // would light up again if the success prop were restored.
    fireEvent.blur(email);
    expect(hasSuccessTint(email), "blurred a second time").toBe(false);

    expect(screen.queryByTestId("success-check")).toBeNull();
    expect(screen.queryByText(VALID_HINT)).toBeNull();
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

  // --- regression guard (non-discriminating: passes on all three versions) ---

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
