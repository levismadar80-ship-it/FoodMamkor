import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2998: the © year in both footers is the ISRAEL calendar year.
let mockPathname = "/";
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
  // MEH-1981: the consumer Footer now carries a CollectionNotice whose
  // /privacy link is this module's locale-aware Link; without the stub the
  // consumer-footer cases throw "No Link export is defined on the mock".
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
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
  FacebookLogo: () => <span />, // MEH-2311
  TiktokLogo: () => <span />,
  YoutubeLogo: () => <span />,
  CaretDown: () => <span />,
  ArrowRight: () => <span data-testid="arrow" />,
}));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span /> }));
// Fail-closed experiences gate (see FooterNavGroups.test.jsx) — keeps the
// consumer-footer render independent of experience supply.
// MEH-2554: Footer reads the signed-in user (the guest-only login link).
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/api", () => ({
  default: { post: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));
import Footer from "@/components/Footer";
import DashboardFooter from "@/components/DashboardFooter";

// 31.12.2026 22:30 UTC = 1.1.2027 00:30 in Israel (UTC+2 in winter).
// The server renders in UTC, so `new Date().getFullYear()` there says 2026
// while every Israeli reader is already in 2027 — this instant is the window
// where the old code and the Israel year disagree, which is what makes the
// case discriminate.
const NEW_YEAR_NIGHT_ISRAEL = new Date("2026-12-31T22:30:00Z");
const RUNNER_IS_ISRAEL =
  Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Jerusalem";

// Footer + DashboardFooter both print «© <year> footer.copyright».
function copyrightYears() {
  return screen
    .getAllByText(/©/)
    .map((el) => el.textContent.match(/©\s*(\d{4})/)?.[1])
    .filter(Boolean);
}

describe("© year follows the Israel calendar (MEH-2998)", () => {
  beforeEach(() => {
    mockPathname = "/";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NEW_YEAR_NIGHT_ISRAEL);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The old code read the RUNNER's zone. CI runs in UTC, where this instant is
  // still 2026, so there the cases below fail on the old code (shown in the PR).
  // On a machine set to Israel time no instant can tell the two apart; this
  // precondition is skipped there and the cases below are only a sanity check.
  it.skipIf(RUNNER_IS_ISRAEL)("precondition — the runner's own calendar still says 2026 at this instant", () => {
    expect(NEW_YEAR_NIGHT_ISRAEL.getFullYear()).toBe(2026);
  });

  it("consumer Footer shows 2027 at 00:30 on 1 Jan in Israel (22:30 UTC on 31 Dec)", () => {
    render(<Footer />);
    expect(copyrightYears()).toEqual(["2027"]);
  });

  it("DashboardFooter shows 2027 at the same instant", () => {
    mockPathname = "/producer/dashboard";
    render(<DashboardFooter />);
    expect(copyrightYears()).toEqual(["2027"]);
  });

  // Sanity only — the old code passes this one too.
  it("an ordinary mid-year day still shows that year", () => {
    vi.setSystemTime(new Date("2027-06-15T09:00:00Z"));
    render(<Footer />);
    expect(copyrightYears()).toEqual(["2027"]);
  });
});
