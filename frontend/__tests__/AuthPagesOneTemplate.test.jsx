import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import ForgotPasswordClient from "@/app/[locale]/forgot-password/ForgotPasswordClient";
import ResetPasswordClient from "@/app/[locale]/reset-password/ResetPasswordClient";

/**
 * MEH-2568 — the account pages share the /login template.
 *
 * Before: /forgot-password and /reset-password were a centred white card with
 * a leaf badge, /register put a 30vh photo band above the form on phones, and
 * /login (MEH-2397) had neither. Three looks for one family of pages.
 *
 * Pinned here:
 *   - forgot + reset (form and done states) render inside AuthSplitLayout's
 *     form pane, with the photo pane hidden below lg, and no `bg-white` card
 *     wrapped around the form;
 *   - /register's photo pane is `hidden lg:block` like /login's.
 *
 * Shown failing (MEH-1619): with the old ForgotPasswordClient /
 * ResetPasswordClient restored from origin/staging, the four render cases fail
 * on the missing `auth-form-pane`; with the old RegisterClient, the source case
 * fails on the `h-[30vh]` band class.
 */

const paramsRef = { current: new URLSearchParams("token=abc") };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => paramsRef.current,
}));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@phosphor-icons/react", () => ({ Eye: () => null, EyeSlash: () => null, Leaf: () => null }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/components/PasswordInput", () => ({
  default: (props) => <input aria-label="password" {...props} />,
}));
vi.mock("@/components/CollectionNotice", () => ({ default: () => null }));

function expectTemplate(container) {
  const pane = screen.getByTestId("auth-form-pane");
  expect(pane.querySelector("h1"), "the page title is the template's h1").not.toBeNull();
  const hero = screen.getByTestId("auth-hero-pane");
  expect(hero.className.split(/\s+/)).toEqual(expect.arrayContaining(["hidden", "lg:block"]));
  const cards = [...container.querySelectorAll(".bg-white")].filter((el) => el.contains(pane) || pane.contains(el) && el.querySelector("form"));
  expect(cards, "no white card around the form").toHaveLength(0);
}

describe("account pages share the /login template (MEH-2568)", () => {
  it("/forgot-password", () => {
    const { container } = render(<ForgotPasswordClient />);
    expectTemplate(container);
  });

  it("/reset-password with a token (form)", () => {
    paramsRef.current = new URLSearchParams("token=abc");
    const { container } = render(<ResetPasswordClient />);
    expectTemplate(container);
    expect(screen.getByTestId("auth-form-pane").querySelector("form")).not.toBeNull();
  });

  it("/reset-password without a token (invalid link)", () => {
    paramsRef.current = new URLSearchParams("");
    const { container } = render(<ResetPasswordClient />);
    expectTemplate(container);
  });

  it("/register has no photo band on phones, like /login", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "app", "[locale]", "register", "RegisterClient.jsx"),
      "utf8",
    );
    const line = src.split("\n").find((l) => l.includes('data-testid="register-hero-pane"'));
    expect(line, "register-hero-pane exists").toBeTruthy();
    expect(line).toContain("hidden lg:block");
    expect(line).not.toContain("h-[30vh]");
  });
});
