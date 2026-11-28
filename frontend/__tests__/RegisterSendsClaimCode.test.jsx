import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-3975 — /register opened from the claim page (?redirect=/claim) sends the
 * stashed short claim code with the sign-up, so the verification mail can bring
 * the owner back to the claim. Mock scaffold from RegisterOAuthTermsConsent.
 *
 * Discriminates: against the old RegisterClient the payload never carries
 * claim_code, so the first case fails.
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
const registerMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ register: registerMock }),
}));

// OAuth must render → a Google client id has to be present.
// Mutable so one case can switch both providers off (RegisterClient reads env
// at render).
const mockEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "",
  NEXT_PUBLIC_APPLE_CLIENT_ID: "",
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
vi.mock("@/lib/password-messages", () => ({
  firstFailureMessage: (failures) => `policy:${failures[0]}`,
}));
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

const CODE = "Pk8VP2JpqGI3";

function submit() {
  render(<RegisterClient />);
  fireEvent.change(screen.getByTestId("register-name"), { target: { value: "גולן" } });
  fireEvent.change(screen.getByTestId("register-email"), { target: { value: "golan@example.org" } });
  fireEvent.change(screen.getByTestId("pw"), { target: { value: "a-long-enough-pw" } });
  fireEvent.click(screen.getByTestId("register-terms"));
  fireEvent.click(screen.getByTestId("register-submit"));
}

describe("register sends the claim code (MEH-3975)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    registerMock.mockReset();
    registerMock.mockResolvedValue({});
  });

  it("from the claim page: claim_code rides with the sign-up", async () => {
    paramsRef.current = new URLSearchParams({ redirect: "/claim" });
    sessionStorage.setItem("mehamakor.claimToken", CODE);
    submit();
    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1));
    expect(registerMock.mock.calls[0][0].claim_code).toBe(CODE);
  });

  it("any other sign-up: no claim_code key at all", async () => {
    paramsRef.current = new URLSearchParams({ redirect: "/meshek-hadugma" });
    sessionStorage.setItem("mehamakor.claimToken", CODE);
    submit();
    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1));
    expect(registerMock.mock.calls[0][0]).not.toHaveProperty("claim_code");
  });
});
