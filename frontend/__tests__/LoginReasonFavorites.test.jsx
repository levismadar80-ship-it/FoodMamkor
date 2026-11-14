import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";
import he from "../messages/he.json";

/**
 * MEH-3120 — a guest who taps «מועדפים» is pushed to
 * /login?redirect=/<locale>/favorites (FavoritesClient). The page now says why.
 * Harness: the mocks of LoginRegisterKeepsRedirect.test.jsx (t returns the key).
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
// The /login terms notice (MEH-2080) links through the locale-aware Link.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
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


const reason = () => screen.queryByTestId("login-reason");

beforeEach(() => {
  paramsRef.current = new URLSearchParams("");
});

describe("/login reason line (MEH-3120)", () => {
  it("copy row 10 is word for word", () => {
    expect(he.auth.login.reason_favorites).toBe("כדי לראות את המועדפים שלך, צריך להיכנס.");
  });

  it.each(["/favorites", "/he/favorites", "/en/favorites", "/he/favorites?tab=events"])(
    "redirect=%s → the line shows",
    (redirect) => {
      paramsRef.current = new URLSearchParams({ redirect });
      render(<LoginClient />);
      expect(reason()?.textContent).toBe("reason_favorites");
    },
  );

  it.each([
    ["no redirect", null],
    ["another page", "/he/settings"],
    ["a page that only contains the word", "/he/favorites-of-mine"],
    ["an outside URL", "https://evil.example/favorites"],
    ["a protocol-relative URL", "//evil.example/favorites"],
  ])("%s → no line", (_name, redirect) => {
    if (redirect) paramsRef.current = new URLSearchParams({ redirect });
    render(<LoginClient />);
    expect(reason()).toBeNull();
  });
});
