import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

/**
 * MEH-844 — guards MEH-837 / MEH-810 on /register.
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
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }) => children }));
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

// GoogleAuthButton mock → a button that fires onSuccess, mimicking OAuth success.
vi.mock("@/components/GoogleAuthButton", async () => {
  const React = await import("react");
  return {
    default: ({ onSuccess }) =>
      React.createElement(
        "button",
        { type: "button", "data-testid": "google-oauth", onClick: () => onSuccess() },
        "google"
      ),
  };
});
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
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

describe("MEH-844 — /register OAuth success honors clamped ?redirect= (real safeInternalRedirect)", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  function clickGoogleWith(redirect) {
    paramsRef.current = new URLSearchParams(`redirect=${redirect}`);
    render(<RegisterClient />);
    fireEvent.click(screen.getByTestId("google-oauth"));
  }

  it("internal path passes through: ?redirect=/favorites → /favorites", () => {
    clickGoogleWith("/favorites");
    expect(mockPush).toHaveBeenCalledWith("/favorites");
  });

  it("absolute URL is clamped: https://evil.com → /", () => {
    clickGoogleWith("https://evil.com");
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("protocol-relative is clamped: //evil.com → /", () => {
    clickGoogleWith("//evil.com");
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
