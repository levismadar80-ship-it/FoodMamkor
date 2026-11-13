import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-2858 — the footer's «גלו» group lists group buys and rescue bags next to
 * events and experiences, each only while its hub has supply. The gates
 * themselves are HubNavGate.test.jsx's job; here they are set directly and the
 * test reads the hrefs and their ORDER under «גלו».
 */

const gates = vi.hoisted(() => ({ events: false, experiences: false, groupBuys: false, rescue: false }));
vi.mock("@/lib/use-events-nav-gate", () => ({ useEventsNavGate: () => gates.events }));
vi.mock("@/lib/use-experiences-nav-gate", () => ({ useExperiencesNavGate: () => gates.experiences }));
vi.mock("@/lib/use-hub-nav-gate", () => ({ useHubNavGate: (hub) => gates[hub] }));

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

const discoverHrefs = () => {
  const group = screen.getByText("nav.footer.group_discover_heading").closest("div");
  return Array.from(group.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
};

beforeEach(() => Object.assign(gates, { events: false, experiences: false, groupBuys: false, rescue: false }));

describe("Footer «גלו»: group buys + rescue bags, data-gated (MEH-2858)", () => {
  it("all four hubs with supply → «גלו»: … אירועים · חוויות · קבוצות רכישה · סלי הפתעה", () => {
    Object.assign(gates, { events: true, experiences: true, groupBuys: true, rescue: true });
    render(<Footer />);
    // MEH-2858 (scope add): «אודות» and the rest moved to «עלינו».
    expect(discoverHrefs()).toEqual(["/producers", "/map", "/events", "/experiences", "/group-buys", "/rescue"]);
  });

  it("the link labels are the two new keys", () => {
    Object.assign(gates, { groupBuys: true, rescue: true });
    render(<Footer />);
    expect(screen.getByRole("link", { name: "nav.footer.group_buys" })).toHaveAttribute("href", "/group-buys");
    expect(screen.getByRole("link", { name: "nav.footer.rescue" })).toHaveAttribute("href", "/rescue");
  });

  it("no supply → neither link", () => {
    render(<Footer />);
    const hrefs = discoverHrefs();
    expect(hrefs, "control: the ungated links render").toContain("/producers");
    expect(hrefs).not.toContain("/group-buys");
    expect(hrefs).not.toContain("/rescue");
  });

  it("each gate drives only its own link", () => {
    gates.rescue = true;
    render(<Footer />);
    expect(discoverHrefs()).toContain("/rescue");
    expect(discoverHrefs()).not.toContain("/group-buys");
  });
});
