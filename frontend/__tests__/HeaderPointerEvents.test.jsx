import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import Header from "@/components/Header";

// MEH-1251 Chunk B: the sticky full-width header band was a click-SHIELD over
// the transparent area beside the floating pill — it swallowed clicks on page
// content under it at the top of the viewport (reported: the admin toolbar
// "פרטים חסרים" button was dead). Fix = pointer-events-none on the shield
// (<header> + inner shell), pointer-events-auto on the <nav> pill so the pill
// (and everything interactive inside it) still works. These tests assert the
// class contract; live click pass-through is a mobile/desktop QA item.
//
// Mocks mirror Header.test.jsx (Header pulls from many context providers).

const userRef = { current: null };
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: userRef.current, logout: vi.fn() }),
}));

const pathnameRef = { current: "/about" };
vi.mock("next/navigation", () => ({
  usePathname: () => "/about",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/language-context", () => ({
  useLanguage: () => ({ lang: "he" }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: () => (key, vars) => {
    let out = key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}));

vi.mock("@phosphor-icons/react", () => ({
  MagnifyingGlass: (props) => <span data-testid="icon-search" {...props} />,
  SealCheck: (props) => <span data-testid="icon-seal" {...props} />,
  // Glyph of the restored desktop LanguageToggle (Header.jsx:393-401) — a
  // vi.mock() factory replaces the whole module, so an unlisted export throws.
  Globe: (props) => <span data-testid="icon-globe" {...props} />,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => pathnameRef.current,
}));

describe("Header pointer-events shield (MEH-1251 Chunk B)", () => {
  beforeEach(() => {
    userRef.current = null;
    pathnameRef.current = "/about";
  });

  it("sets pointer-events-none on the sticky <header> band (the click shield)", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header.className).toMatch(/\bpointer-events-none\b/);
    // Guardrail: pointer-events only — the z / sticky tokens are untouched.
    expect(header.className).toMatch(/\bsticky\b/);
    expect(header.className).toMatch(/z-\[1050\]/);
  });

  it("sets pointer-events-none on the full-width nav-shell wrapper", () => {
    const { container } = render(<Header />);
    const shell = container.querySelector("header > div");
    expect(shell).not.toBeNull();
    expect(shell.className).toMatch(/\bpointer-events-none\b/);
    // It IS the full-width centering wrapper (not the pill).
    expect(shell.className).toMatch(/flex-col/);
    expect(shell.className).toMatch(/items-center/);
  });

  it("re-enables events on the <nav> pill with pointer-events-auto", () => {
    const { container } = render(<Header />);
    const nav = container.querySelector("nav");
    expect(nav).not.toBeNull();
    expect(nav.className).toMatch(/\bpointer-events-auto\b/);
    // Not accidentally also -none.
    expect(nav.className).not.toMatch(/\bpointer-events-none\b/);
  });

  it("keeps interactive content inside the pointer-events-auto <nav> subtree (UserMenu dropdown)", () => {
    userRef.current = { id: "u1", name: "אורית", role: "admin" };
    const { container } = render(<Header />);
    const nav = container.querySelector("nav");
    // The avatar button (and its dropdown) render inside <nav>, so the
    // pointer-events-auto region covers them — nothing interactive is stranded
    // in the pointer-events-none band.
    const avatar = nav.querySelector('[aria-haspopup="menu"]');
    expect(avatar).not.toBeNull();
  });
});
