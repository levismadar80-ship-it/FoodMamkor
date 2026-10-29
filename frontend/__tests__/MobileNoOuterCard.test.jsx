/**
 * MEH-2565 — below md the form pages render without an outer white card (the
 * card's padding plus the inner boxes cost ~60px of a 375px screen); from md
 * up the card is unchanged. The register pre-flight's only action is a filled
 * primary button, not an outline.
 *
 * A class that applies below md is an unprefixed one, so the check is: the
 * container carries the card recipe only behind `md:`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: 1, name: "דנה", email: "d@example.com" },
    loading: false,
    updateProfile: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({})),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

import ContactClient from "@/app/[locale]/contact/ContactClient";
import { ProfileTab } from "@/app/[locale]/settings/page";
import RegisterPreflight from "@/app/[locale]/register/producer/RegisterPreflight";

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

function expectCardFromMdOnly(el) {
  const cls = el.className.split(/\s+/);
  for (const c of ["bg-white", "border", "p-6", "p-8", "shadow-[0_2px_12px_rgba(46,104,83,0.04)]"]) {
    expect(cls, `unprefixed ${c} paints the card on phones`).not.toContain(c);
  }
  expect(cls).toContain("md:bg-white");
  expect(cls.some((c) => /^md:p-\d/.test(c))).toBe(true);
}

describe("MEH-2565 · no card-in-card on phones", () => {
  it("/contact: the form container is a card from md up only", () => {
    wrap(<ContactClient />);
    expectCardFromMdOnly(screen.getByRole("heading", { level: 1 }).parentElement);
  });

  it("/settings profile tab: the panel is a card from md up only", () => {
    wrap(<ProfileTab />);
    expectCardFromMdOnly(screen.getByRole("tabpanel"));
  });

  it("/register/producer pre-flight: «מתחילים» is a filled primary button", () => {
    wrap(<RegisterPreflight showAccountLine onStart={() => {}} />);
    const cls = screen.getByTestId("register-preflight-start").className.split(/\s+/);
    expect(cls).toContain("bg-primary");
    expect(cls).toContain("text-white");
    expect(cls).not.toContain("bg-transparent");
  });
});
