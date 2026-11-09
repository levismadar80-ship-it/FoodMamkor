import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1177 (ADR-024): the footer nav split into two audience groups —
// "גלו" (readers) and "לבתי עסק" (producers) — each with a real <h3> heading.
// Return each translation key verbatim so we can assert on the group-heading
// keys and locate links by href.
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
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

import Footer from "@/components/Footer";

const hrefsUnder = (heading) => {
  // the group's link list is the <ul> that follows its <h3> within the same group <div>
  const group = heading.closest("div");
  return Array.from(group.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
};

describe("Footer nav split into two audience groups (MEH-1177)", () => {
  it("renders both group headings", () => {
    render(<Footer />);
    expect(screen.getByText("nav.footer.group_discover_heading")).toBeInTheDocument();
    expect(screen.getByText("nav.footer.group_business_heading")).toBeInTheDocument();
  });

  it("groups the links: 'גלו' (what to find) · 'עלינו' (who we are) · 'לבתי עסק'", () => {
    render(<Footer />);
    const discover = hrefsUnder(screen.getByText("nav.footer.group_discover_heading"));
    const about = hrefsUnder(screen.getByText("nav.footer.group_about_heading"));
    const business = hrefsUnder(screen.getByText("nav.footer.group_business_heading"));

    // MEH-1060 (SEO-09): /producers index link added to the discover group.
    // MEH-1289: /about/why-local editorial page added to the discover group.
    // MEH-2369: /events is data-gated (no upcoming event → no link); the
    // never-settling api mock above keeps it hidden here. Its own behaviour is
    // asserted in EventsNavGate.test.jsx.
    // MEH-2858: «גלו עסקים» → / is gone (the logo links home), and the three
    // "who we are" links moved to their own «עלינו» group.
    expect(discover).toEqual(["/producers", "/map"]);
    expect(about).toEqual(["/about", "/about/why-local", "/recommend#share"]);
    expect(business).toEqual(["/join", "/about/process", "/about/for-businesses"]);
  });

  it("the groups come in the order גלו · עלינו · לבתי עסק", () => {
    render(<Footer />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    const order = ["nav.footer.group_discover_heading", "nav.footer.group_about_heading", "nav.footer.group_business_heading"];
    expect(headings.filter((h) => order.includes(h))).toEqual(order);
  });

  // MEH-2858: 8 — «גלו עסקים» → / left on purpose (the logo links home); the
  // brand-column logo link is asserted below so home stays one tap away.
  it("keeps all 8 ungated nav links exactly once (no link dropped in the split)", () => {
    render(<Footer />);
    const navLinks = Array.from(
      screen.getByRole("navigation", { name: "nav.footer.nav_aria" }).querySelectorAll("a[href]"),
    ).map((a) => a.getAttribute("href"));
    expect(navLinks.sort()).toEqual(
      ["/about", "/about/for-businesses", "/about/why-local", "/about/process", "/join", "/map", "/producers", "/recommend#share"].sort(),
    );
  });

  it("home stays one tap away through the brand-column logo", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "nav.footer.brand_aria" })).toHaveAttribute("href", "/");
  });
});

// MEH-2308: axe 4.14 `label-content-name-mismatch` (WCAG 2.5.3 Label in Name).
// The Instagram link used to carry an aria-label that REPLACED its visible
// handle. MEH-2417 moved Instagram into the icon row, so it has NO visible
// text at all now — the property that still matters is that the name is not
// an overriding aria-label and comes only from the sr-only description, with
// nothing visible left that the name could fail to contain.
describe("Footer Instagram link — icon-only, named by its sr-only text (MEH-2308 · MEH-2417)", () => {
  it("has no aria-label, no visible text, and the sr-only description is its name", () => {
    render(<Footer />);
    const link = document.querySelector('a[href*="instagram.com"]');
    expect(link).not.toHaveAttribute("aria-label");
    expect(link.querySelector("bdi")).toBeNull();
    const visible = [...link.childNodes]
      .filter((n) => !(n.nodeType === 1 && (n.classList.contains("sr-only") || n.tagName.toLowerCase() === "svg")))
      .map((n) => n.textContent)
      .join("")
      .trim();
    expect(visible).toBe("");
    expect(link.textContent.trim()).toBe("nav.footer.instagram_aria");
  });
});
