import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import LoginClient from "@/app/[locale]/login/LoginClient";

/**
 * MEH-1428 chunk 2 (MEH-2330) — a first-time customer who opens the owner's
 * review link meets `/login?redirect=<producer page>#reviews`, and the likely
 * next tap is «register». RegisterClient already honours `?redirect=`
 * (RegisterClient.jsx:74), but the link handed it a bare `/register`, so a new
 * account landed on "/" instead of back on the review form.
 *
 * Discrimination: against the bare `/register` link the redirect case fails;
 * the no-redirect case passes in both worlds and is the control — it is also
 * what e2e/flows/29-register-journey-a.spec.ts:201 pins (href ends /register).
 * The external-redirect case pins that the clamped value is what travels on.
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
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
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
vi.mock("@/components/GoogleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/AppleAuthButton", () => ({ default: () => null }));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => null }));

const registerHref = () => screen.getByTestId("login-register-link").getAttribute("href");

beforeEach(() => {
  paramsRef.current = new URLSearchParams("");
});

describe("/login → register keeps the post-auth redirect", () => {
  it("control: no ?redirect= → plain /register", () => {
    render(<LoginClient />);
    expect(registerHref()).toBe("/register");
  });

  it("?redirect= travels on to /register", () => {
    const back = "/meshek?rt=tok#reviews";
    paramsRef.current = new URLSearchParams({ redirect: back });
    render(<LoginClient />);
    expect(registerHref()).toBe(`/register?redirect=${encodeURIComponent(back)}`);
  });

  it("an external ?redirect= is clamped before it travels (open-redirect guard)", () => {
    paramsRef.current = new URLSearchParams({ redirect: "//evil.example" });
    render(<LoginClient />);
    expect(registerHref()).toBe("/register");
  });
});
