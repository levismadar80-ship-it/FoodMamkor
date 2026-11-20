/**
 * MEH-2233 — the cookie banner and the /login form are in the server HTML, so
 * they paint with the page instead of after hydration (they were the LCP at
 * 6.4s on /map and 5.5s on /login, staging 20/11, Pixel 5 slow 4G + CPU x4).
 * A visitor who already answered the banner, or who holds a stored session,
 * must still not see them before React decides: an inline script flags <html>
 * from localStorage and app/globals.css hides the pre-mount copies.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { render, screen, cleanup } from "@testing-library/react";
import { PREHYDRATION_FLAGS_SCRIPT } from "@/lib/prehydration-flags-inline";
import CookieBanner from "@/components/CookieBanner";
import LoginClient from "@/app/[locale]/login/LoginClient";

const auth = { user: null, loading: true };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("email=a%40b.co"),
}));
vi.mock("next-intl", () => {
  const t = (key) => key;
  t.rich = (key) => key;
  return { useTranslations: () => t };
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ...auth, login: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "", NEXT_PUBLIC_APPLE_CLIENT_ID: "" } }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };

const runScript = () => new Function(PREHYDRATION_FLAGS_SCRIPT)();
const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html.removeAttribute("data-cookie-answered");
  html.removeAttribute("data-has-token");
  auth.user = null;
  auth.loading = true;
});
afterEach(cleanup);

describe("the inline flags script", () => {
  it("flags an answered banner (either answer) and a stored token", () => {
    localStorage.setItem("cookieConsent", "essential");
    localStorage.setItem("token", "x");
    runScript();
    expect(html.hasAttribute("data-cookie-answered")).toBe(true);
    expect(html.hasAttribute("data-has-token")).toBe(true);
  });

  it("flags nothing for a first visit or an unknown consent value", () => {
    localStorage.setItem("cookieConsent", "maybe");
    runScript();
    expect(html.hasAttribute("data-cookie-answered")).toBe(false);
    expect(html.hasAttribute("data-has-token")).toBe(false);
  });

  it("reads the same keys the app writes", () => {
    const consent = fs.readFileSync(path.resolve(__dirname, "../lib/cookie-consent.js"), "utf8");
    expect(consent).toContain('COOKIE_CONSENT_KEY = "cookieConsent"');
    expect(consent).toContain('new Set(["all", "essential"])');
    const authCtx = fs.readFileSync(path.resolve(__dirname, "../lib/auth-context.js"), "utf8");
    expect(authCtx).toContain('localStorage.getItem("token")');
  });

  it("the CSS hides only the pre-mount copies", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/html\[data-cookie-answered\] \.cookie-banner\[data-prehydration\]\s*\{\s*display: none;/);
    expect(css).toMatch(/html\[data-has-token\] \[data-auth-pending\]\s*\{\s*visibility: hidden;/);
  });
});

describe("cookie banner", () => {
  it("is in the server HTML, marked pre-mount", () => {
    const out = renderToString(<CookieBanner />);
    expect(out).toContain('data-testid="cookie-banner"');
    expect(out).toContain("data-prehydration");
  });

  it("after mount: gone for an answered visitor, shown (unmarked) for a first visit", () => {
    localStorage.setItem("cookieConsent", "all");
    render(<CookieBanner />);
    expect(screen.queryByTestId("cookie-banner")).toBeNull();
    cleanup();
    localStorage.clear();
    render(<CookieBanner />);
    expect(screen.getByTestId("cookie-banner").hasAttribute("data-prehydration")).toBe(false);
  });
});

describe("/login", () => {
  it("the server HTML holds the form while auth is resolving, marked pending", () => {
    const out = renderToString(<LoginClient />);
    expect(out).toContain('data-testid="login-email"');
    expect(out).toContain("data-auth-pending");
  });

  it("once auth has decided for a guest, the form is unmarked and ?email= is prefilled", () => {
    auth.loading = false;
    const { container } = render(<LoginClient />);
    expect(container.querySelector("[data-auth-pending]")).toBeNull();
    expect(screen.getByTestId("login-email").value).toBe("a@b.co");
  });

  it("a signed-in visitor never gets the form", () => {
    auth.loading = false;
    auth.user = { id: "u1" };
    render(<LoginClient />);
    expect(screen.queryByTestId("login-email")).toBeNull();
  });
});
