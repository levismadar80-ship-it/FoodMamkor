/**
 * MEH-3827 — the footer utility row, the admin phone nav and the admin
 * desktop sidebar (the controls of this card that are not `.tap-area` hosts;
 * those are in TapArea44.test.jsx).
 *
 * jsdom has no layout, so the reach cases check the rendered elements carry
 * the 44px tokens. The contrast case computes the WCAG ratio of every
 * translucent text colour rendered in the sidebar against `primary-dark`,
 * from the repo's own colour tokens, so a new faint class fails by number.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import tokens from "../tailwind.tokens.json";

const apiMock = vi.hoisted(() => ({ get: vi.fn(() => new Promise(() => {})), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
const authState = vi.hoisted(() => ({ user: null }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, logout: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, prefetch, ...p }) => <a href={typeof href === "string" ? href : href?.pathname} {...p}>{children}</a>,
  usePathname: () => "/admin/reviews",
  useRouter: () => ({ prefetch: () => {}, push: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }) => <a href={typeof href === "string" ? href : "#"} {...p}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: (props) => <img alt={props.alt ?? ""} {...props} /> }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
  useLocale: () => "he",
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));

import Footer from "@/components/Footer";
import AdminLayout from "@/app/[locale]/admin/AdminLayoutClient";

const COLORS = tokens.theme.extend.colors;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => {
  const a = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const ratio = (fg, alpha, bg) => {
  const mixed = fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
  const [x, y] = [lum(mixed), lum(bg)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const AA = 4.5;

describe("footer utility links reach 44×44", () => {
  it("every link and the cookie button in the utility row carries min-h-touch and min-w-touch", () => {
    render(<Footer />);
    const row = screen.getByTestId("footer-utility-links");
    const controls = [...row.querySelectorAll("a[href], button")];
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const el of controls) {
      expect(el.classList.contains("min-h-touch"), el.textContent).toBe(true);
      expect(el.classList.contains("min-w-touch"), el.textContent).toBe(true);
    }
  });
});

describe("admin layout", () => {
  const renderAdmin = () => {
    authState.user = { id: "a1", role: "admin", name: "ספיר" };
    return render(<AdminLayout><div /></AdminLayout>);
  };

  it("every phone-strip nav link is at least 44px tall (was 28px)", () => {
    const { container } = renderAdmin();
    const strip = container.querySelector("div.md\\:hidden.sticky nav");
    const links = [...strip.querySelectorAll("a[href]")];
    expect(links.length).toBeGreaterThan(3);
    for (const a of links) expect(a.classList.contains("min-h-touch"), a.textContent).toBe(true);
  });

  it("every translucent text colour in the desktop sidebar is at least 4.5:1 on primary-dark", () => {
    const { container } = renderAdmin();
    const aside = container.querySelector("aside");
    const bg = hex(COLORS["primary-dark"]);
    const found = [];
    for (const el of [aside, ...aside.querySelectorAll("*")]) {
      const cls = typeof el.className === "string" ? el.className : "";
      for (const m of cls.matchAll(/(?:^|\s)text-(white|green-50)\/(\d+)(?=\s|$)/g)) {
        const fg = m[1] === "white" ? [255, 255, 255] : hex(COLORS["green-50"]);
        found.push([m[0].trim(), ratio(fg, Number(m[2]) / 100, bg)]);
      }
    }
    expect(found.length, "no translucent text class found in the sidebar").toBeGreaterThan(2);
    for (const [cls, r] of found) expect(r, `${cls} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });
});
