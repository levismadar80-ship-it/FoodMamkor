import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-1954: FooterSlot routes three ways — null on /map, DashboardFooter on
// producer-dashboard routes, the consumer Footer everywhere else. The mock
// pathname is mutable so each case re-renders the same component under a
// different route, which is the exact thing the slot discriminates on.
let mockPathname = "/";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
}));

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
// Fail-closed experiences gate (see FooterNavGroups.test.jsx) — keeps the
// consumer-footer render independent of experience supply.
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

import FooterSlot from "@/components/FooterSlot";

beforeEach(() => {
  mockPathname = "/";
});

describe("FooterSlot routing (MEH-1954)", () => {
  it("renders the full consumer footer on a public route", () => {
    mockPathname = "/producers";
    render(<FooterSlot />);
    // The newsletter heading exists only in the consumer footer.
    expect(screen.getByText("nav.footer.newsletter_heading")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-footer")).not.toBeInTheDocument();
  });

  it("renders the slim dashboard footer on producer-dashboard routes", () => {
    mockPathname = "/producer/dashboard/events";
    render(<FooterSlot />);
    expect(screen.getByTestId("dashboard-footer")).toBeInTheDocument();
    // Consumer-only surfaces must be absent: newsletter + discover nav.
    expect(screen.queryByText("nav.footer.newsletter_heading")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.footer.nav_discover")).not.toBeInTheDocument();
  });

  it("keeps the slim footer on the dashboard root path", () => {
    mockPathname = "/producer/dashboard";
    render(<FooterSlot />);
    expect(screen.getByTestId("dashboard-footer")).toBeInTheDocument();
  });

  it("does NOT slim the public producer detail page — only /producer/dashboard", () => {
    // /producer/[id] is a consumer surface; a prefix match on "/producer"
    // alone would wrongly slim it. This is the case that discriminates the
    // exact-prefix guard from a looser startsWith("/producer").
    mockPathname = "/producer/42";
    render(<FooterSlot />);
    expect(screen.getByText("nav.footer.newsletter_heading")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-footer")).not.toBeInTheDocument();
  });

  it("renders nothing on /map (MEH-30 behaviour preserved)", () => {
    mockPathname = "/map";
    const { container } = render(<FooterSlot />);
    expect(container).toBeEmptyDOMElement();
  });

  it("slim footer carries the IS-5568 accessibility link (MEH-867 must not regress)", () => {
    mockPathname = "/producer/dashboard";
    render(<FooterSlot />);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/accessibility");
    expect(links).toContain("/terms");
    expect(links).toContain("/privacy");
    expect(links).toContain("/about#contact");
  });
});
