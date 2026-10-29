import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

/**
 * MEH-2080 — an account created from /login with Google or Apple had no
 * terms-consent record: /login sent no flag (_record_oauth_terms, auth.py).
 * /login now shows a sign-in-wrap notice next to the OAuth buttons and sends
 * termsAccepted=true, which the backend stamps as on /register.
 *
 * Cells: no OAuth configured → no notice, no buttons (control); Google only;
 * Google + Apple. Each OAuth cell asserts the notice, both links, and the flag
 * each rendered button received. Discrimination: against the old LoginClient
 * (no notice, no prop) every OAuth cell fails.
 */

const envRef = { current: {} };
vi.mock("@/lib/env", () => ({
  get env() {
    return envRef.current;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key, tags) => (
    <>
      {key}
      {Object.entries(tags).map(([name, render]) => (
        <span key={name}>{render(name)}</span>
      ))}
    </>
  );
  return { useTranslations: () => t };
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} data-locale-link="" {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  ArrowRight: () => null,
  EnvelopeSimple: () => null,
  Eye: () => null,
  EyeSlash: () => null,
  Lock: () => null,
}));
vi.mock("@/components/GoogleAuthButton", () => ({
  default: ({ termsAccepted }) => (
    <button data-testid="google-btn" data-terms={String(termsAccepted)} />
  ),
}));
vi.mock("@/components/AppleAuthButton", () => ({
  default: ({ termsAccepted }) => (
    <button data-testid="apple-btn" data-terms={String(termsAccepted)} />
  ),
}));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

const notice = () => screen.queryByTestId("login-oauth-terms");

beforeEach(() => {
  envRef.current = {};
});

describe("/login OAuth terms notice", () => {
  it("control: no OAuth configured → no notice and no buttons", () => {
    render(<LoginClient />);
    expect(notice()).toBeNull();
    expect(screen.queryByTestId("google-btn")).toBeNull();
  });

  it("Google only → notice with both links, Google sends termsAccepted", () => {
    envRef.current = { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "id" };
    render(<LoginClient />);
    const n = notice();
    expect(n).not.toBeNull();
    // Locale-aware links (an en reader gets /en/terms), as on /register.
    expect(n.querySelector('a[data-locale-link][href="/terms"]')).not.toBeNull();
    expect(n.querySelector('a[data-locale-link][href="/privacy"]')).not.toBeNull();
    expect(screen.getByTestId("google-btn").dataset.terms).toBe("true");
    expect(screen.queryByTestId("apple-btn")).toBeNull();
  });

  it("Google + Apple → one notice, both buttons send termsAccepted", () => {
    envRef.current = {
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: "id",
      NEXT_PUBLIC_APPLE_CLIENT_ID: "id",
    };
    render(<LoginClient />);
    expect(screen.getAllByTestId("login-oauth-terms")).toHaveLength(1);
    expect(screen.getByTestId("google-btn").dataset.terms).toBe("true");
    expect(screen.getByTestId("apple-btn").dataset.terms).toBe("true");
  });

  it("Apple only → notice, Apple sends termsAccepted", () => {
    envRef.current = { NEXT_PUBLIC_APPLE_CLIENT_ID: "id" };
    render(<LoginClient />);
    expect(notice()).not.toBeNull();
    expect(screen.getByTestId("apple-btn").dataset.terms).toBe("true");
    expect(screen.queryByTestId("google-btn")).toBeNull();
  });
});

// t.rich is mocked above, so the catalog's tags are checked here: a tag typo
// would otherwise pass and render raw.
describe.each([
  ["he", he],
  ["en", en],
])("auth.login.oauth_terms in %s", (_, messages) => {
  const text = messages.auth.login.oauth_terms;
  it("carries exactly one <tos> and one <privacy> pair", () => {
    expect(text.match(/<tos>[^<]+<\/tos>/g)).toHaveLength(1);
    expect(text.match(/<privacy>[^<]+<\/privacy>/g)).toHaveLength(1);
    expect(text.replace(/<\/?(tos|privacy)>/g, "")).not.toMatch(/[<>]/);
  });
});
