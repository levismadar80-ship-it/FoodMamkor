import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RegisterClient from "@/app/[locale]/register/RegisterClient";

const mockPush = vi.fn();
const paramsRef = { current: new URLSearchParams("") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key) => key;
    // MEH-2577: the OAuth consent line above the form is a t.rich string.
    t.rich = (key) => key;
    return t;
  },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ register: vi.fn().mockResolvedValue({}) }),
}));

// OAuth must render → a Google client id has to be present.
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-google", NEXT_PUBLIC_APPLE_CLIENT_ID: "" },
}));

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

/**
 * MEH-2922 — /register is the CUSTOMER signup. A business owner who lands here
 * must see the way to business signup at the TOP of the page, before the
 * customer form, not under it.
 */
describe("MEH-2922 — /register offers business signup before the customer form", () => {
  beforeEach(() => {
    paramsRef.current = new URLSearchParams("");
  });

  it("renders a link to /join (MEH-2983 main door) that precedes the customer form in the DOM", () => {
    render(<RegisterClient />);
    const link = screen.getByTestId("register-producer-choice");
    expect(link.getAttribute("href")).toBe("/join");
    const form = screen.getByTestId("register-form");
    // DOCUMENT_POSITION_FOLLOWING (4): the form comes after the link.
    expect(link.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the link also precedes the page heading, so it is the first thing read", () => {
    render(<RegisterClient />);
    const link = screen.getByTestId("register-producer-choice");
    const heading = screen.getByTestId("register-heading");
    expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the business line appears once, not also at the bottom", () => {
    render(<RegisterClient />);
    expect(screen.getAllByText("auth.register.consumer.cta_producer_link")).toHaveLength(1);
  });
});
