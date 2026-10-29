import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2554: «כניסה לחשבון» in the footer utility row is a guest link — a
// signed-in reader was shown it too. Same mock set as FooterNavGroups.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props) => <img alt={props.alt ?? ""} {...props} />,
}));

// MEH-1981: the footer newsletter now carries a CollectionNotice whose /privacy
// link is the locale-aware Link from @/i18n/navigation, which needs an intl
// context the key-echo next-intl mock above does not provide. Same stub the
// CategoryRequestModal / EventForm suites use — the link's behaviour is
// CollectionNotice.test.jsx's job; this file is about the nav groups.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@phosphor-icons/react", () => ({
  InstagramLogo: () => <span data-testid="ig" />,
  FacebookLogo: () => <span />, // MEH-2311
  TiktokLogo: () => <span />,
  YoutubeLogo: () => <span />,
  CaretDown: () => <span />,
  ArrowRight: () => <span data-testid="arrow" />,
}));

vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span /> }));
// MEH-1918: the footer now asks GET /experiences/count to decide whether the
// data-gated "חוויות" link appears. A promise that never settles keeps the gate
// in its fail-closed state for this spec, so the link counts below stay about
// the MEH-1177 split and not about experience supply. The gate's own behaviour
// is asserted in ExperiencesNavGate.test.jsx.
// MEH-2554: Footer reads the signed-in user (the guest-only login link).
let mockUser = null;
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

import Footer from "@/components/Footer";

const utilityHrefs = () =>
  Array.from(screen.getByTestId("footer-utility-links").querySelectorAll("a[href]")).map((a) =>
    a.getAttribute("href"),
  );

afterEach(() => {
  mockUser = null;
});

describe("Footer utility row — login link is guest-only (MEH-2554)", () => {
  it("shows /login to a guest", () => {
    render(<Footer />);
    expect(utilityHrefs()).toContain("/login");
  });

  it("hides /login from a signed-in reader and keeps the other utility links", () => {
    mockUser = { id: 1, role: "consumer" };
    render(<Footer />);
    const hrefs = utilityHrefs();
    expect(hrefs).not.toContain("/login");
    expect(hrefs).toEqual(["/terms", "/privacy", "/accessibility", "/about#contact"]);
  });
});
