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

vi.mock("@phosphor-icons/react", () => ({
  InstagramLogo: () => <span data-testid="ig" />,
  ArrowRight: () => <span data-testid="arrow" />,
}));

vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span /> }));
// MEH-1918: the footer now asks GET /experiences/count to decide whether the
// data-gated "חוויות" link appears. A promise that never settles keeps the gate
// in its fail-closed state for this spec, so the link counts below stay about
// the MEH-1177 split and not about experience supply. The gate's own behaviour
// is asserted in ExperiencesNavGate.test.jsx.
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

  it("groups the reader links under 'גלו' and the producer links under 'לבתי עסק'", () => {
    render(<Footer />);
    const discover = hrefsUnder(screen.getByText("nav.footer.group_discover_heading"));
    const business = hrefsUnder(screen.getByText("nav.footer.group_business_heading"));

    // MEH-1060 (SEO-09): /producers index link added to the discover group.
    // MEH-1289: /about/why-local editorial page added to the discover group.
    expect(discover).toEqual(["/", "/producers", "/map", "/events", "/about", "/about/why-local", "/share"]);
    expect(business).toEqual(["/join", "/about/process", "/about/for-businesses"]);
  });

  it("keeps all 10 nav links exactly once (no link dropped in the split)", () => {
    render(<Footer />);
    const navLinks = Array.from(
      screen.getByRole("navigation", { name: "nav.footer.nav_aria" }).querySelectorAll("a[href]"),
    ).map((a) => a.getAttribute("href"));
    expect(navLinks.sort()).toEqual(
      ["/", "/about", "/about/for-businesses", "/about/why-local", "/about/process", "/events", "/join", "/map", "/producers", "/share"].sort(),
    );
  });
});
