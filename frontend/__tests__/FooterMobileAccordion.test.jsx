import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-2397: on mobile the two footer link groups ("גלו", "לבתי עסק") are
// closed accordion rows; desktop keeps the lists always open via `md:flex`.
// jsdom applies no Tailwind, so the cells below read the contract the CSS
// keys on — `aria-expanded` on the heading button and the `hidden` utility on
// the list — not computed visibility. Same mocks as FooterNavGroups.test.jsx.
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("next/image", () => ({ default: (props) => <img alt={props.alt ?? ""} {...props} /> }));
vi.mock("@/i18n/navigation", () => ({
  // MEH-3059: Footer prefetches «כל בתי העסק» on intent via router.prefetch.
  useRouter: () => ({ prefetch: () => {} }),
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  InstagramLogo: () => <span />,
  FacebookLogo: () => <span />,
  TiktokLogo: () => <span />,
  YoutubeLogo: () => <span />,
  ArrowRight: () => <span />,
  CaretDown: () => <span data-testid="caret" />,
}));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span /> }));
// MEH-2554: Footer reads the signed-in user (the guest-only login link).
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

import Footer from "@/components/Footer";

const groupButton = (key) => screen.getByRole("button", { name: key });
const listOf = (button) => document.getElementById(button.getAttribute("aria-controls"));

describe("Footer link groups collapse on mobile (MEH-2397)", () => {
  afterEach(() => {
    delete window.matchMedia;
  });

  // MEH-2858: three groups now — «גלו» · «עלינו» · «לבתי עסק».
  const GROUP_KEYS = ["nav.footer.group_discover_heading", "nav.footer.group_about_heading", "nav.footer.group_business_heading"];

  it("renders every group closed: aria-expanded=false and the list carries `hidden`", () => {
    render(<Footer />);
    for (const key of GROUP_KEYS) {
      const btn = groupButton(key);
      expect(btn).toHaveAttribute("aria-expanded", "false");
      const list = listOf(btn);
      expect(list).not.toBeNull();
      expect(list.classList.contains("hidden")).toBe(true);
      // desktop escape hatch — the list is always shown from md: up
      expect(list.classList.contains("md:flex")).toBe(true);
    }
  });

  it("a tap opens one group only; the others stay closed", () => {
    render(<Footer />);
    const discover = groupButton("nav.footer.group_discover_heading");
    const about = groupButton("nav.footer.group_about_heading");
    const business = groupButton("nav.footer.group_business_heading");
    fireEvent.click(discover);
    expect(discover).toHaveAttribute("aria-expanded", "true");
    expect(listOf(discover).classList.contains("hidden")).toBe(false);
    for (const other of [about, business]) {
      expect(other).toHaveAttribute("aria-expanded", "false");
      expect(listOf(other).classList.contains("hidden")).toBe(true);
    }
    // Opening «עלינו» closes «גלו»; a second tap closes «עלינו» again.
    fireEvent.click(about);
    expect(about).toHaveAttribute("aria-expanded", "true");
    expect(discover).toHaveAttribute("aria-expanded", "false");
    expect(listOf(discover).classList.contains("hidden")).toBe(true);
    fireEvent.click(about);
    expect(about).toHaveAttribute("aria-expanded", "false");
    expect(listOf(about).classList.contains("hidden")).toBe(true);
  });

  // Desktop cell (md: and up). jsdom has no matchMedia, so the three cells
  // above run as the mobile markup by construction; this one installs a
  // matching query and asserts the heading is plain text — no
  // `aria-expanded="false"` button sitting in the tab order over a list that is
  // in fact visible (CI reviewer on PR #3654). Shown-failing: with the
  // always-a-button markup `queryByRole("button", { name })` finds it.
  it("from md: up the group heading is not a button at all", () => {
    const listeners = new Set();
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
    }));
    render(<Footer />);
    for (const key of GROUP_KEYS) {
      expect(screen.queryByRole("button", { name: key })).toBeNull();
      expect(screen.getByRole("heading", { level: 3, name: key })).toBeInTheDocument();
    }
    expect(screen.queryByTestId("caret")).toBeNull();
    // the lists are still there, every link intact
    expect(document.getElementById("footer-group-discover")).not.toBeNull();
    expect(listeners.size).toBe(1);
  });

  it("the links stay in the DOM while closed (no link is dropped by the fold)", () => {
    render(<Footer />);
    const navLinks = Array.from(
      screen.getByRole("navigation", { name: "nav.footer.nav_aria" }).querySelectorAll("a[href]"),
    ).map((a) => a.getAttribute("href"));
    expect(navLinks.sort()).toEqual(
      // MEH-2858: «גלו עסקים» → / left the footer (the logo links home).
      // /recommend joined «גלו» from the utility row (Sapir 13/11).
      ["/about", "/about/for-businesses", "/about/why-local", "/about/process", "/join", "/map", "/producers", "/recommend", "/recommend#share"].sort(),
    );
  });
});
