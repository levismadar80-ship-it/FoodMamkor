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
  html.removeAttribute("data-from-map");
  auth.user = null;
  auth.loading = true;
});
afterEach(cleanup);

describe("the inline flags script", () => {
  // MEH-3856: the business page's «חזרה למפה» row reads this flag before paint.
  it("flags ?from=map, and nothing for another referrer or none (control)", () => {
    const at = (search) => {
      html.removeAttribute("data-from-map");
      window.history.replaceState(null, "", `/ruach-hasadeh${search}`);
      runScript();
      return html.hasAttribute("data-from-map");
    };
    try {
      expect(at("?from=map")).toBe(true);
      expect(at("?x=1&from=map")).toBe(true);
      expect(at("")).toBe(false);
      expect(at("?from=list")).toBe(false);
      expect(at("?from=mapx")).toBe(false);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

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

  it("stops a native submit of a form marked data-no-native-submit, and only that form", () => {
    runScript();
    const guarded = document.createElement("form");
    guarded.setAttribute("data-no-native-submit", "");
    const plain = document.createElement("form");
    document.body.append(guarded, plain);
    const fire = (f) => {
      const e = new Event("submit", { bubbles: true, cancelable: true });
      f.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire(guarded)).toBe(true);
    expect(fire(plain)).toBe(false);
    guarded.remove();
    plain.remove();
  });

  it("answering the banner flags <html> at once (a remount stays hidden)", async () => {
    const { setCookieConsent } = await import("@/lib/cookie-consent");
    setCookieConsent("essential");
    expect(html.hasAttribute("data-cookie-answered")).toBe(true);
  });

  it("the CSS hides only the pre-mount copies", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
    expect(css).toMatch(/html\[data-cookie-answered\] \.cookie-banner\[data-prehydration\]\s*\{\s*display: none;/);
    expect(css).toMatch(/html\[data-has-token\] \[data-auth-pending\]\s*\{\s*visibility: hidden;/);
    expect(css).toMatch(/html\[data-has-token\] \[data-auth-pending\] \[data-auth-pending-note\]\s*\{\s*display: block;\s*visibility: visible;/);
    expect(css).toMatch(/\n\[data-prehydration\]\s*\{\s*pointer-events: none;/);
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
  it("the server HTML holds the form while auth is resolving, marked pending and pre-mount", () => {
    const out = renderToString(<LoginClient />);
    expect(out).toContain('data-testid="login-email"');
    expect(out).toContain("data-auth-pending");
    expect(out).toContain("data-auth-pending-note");
    expect(out).toContain("data-prehydration");
    expect(out).toMatch(/<form[^>]*method="post"[^>]*data-no-native-submit/);
  });

  it("after mount the login page takes taps (no pre-mount marker)", () => {
    const { container } = render(<LoginClient />);
    expect(container.querySelector("[data-prehydration]")).toBeNull();
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
