/**
 * MEH-3669 — «כלים» grouped by what the owner came to do, and the four offer
 * tiles folded into two in-place cards: «אירועים» (events + experiences) and
 * «הזדמנויות» (group buys + surprise bags). Same split as the bottom nav.
 *
 * Cells covered (5-state rule, count × open/closed):
 *   many × closed — «אירועים» shows no tool link until opened
 *   many × open   — «אירועים» opened shows exactly its two tools
 *   1             — «הזדמנויות» with bags off is a plain link to group buys
 *   many (rescue) — «הזדמנויות» with bags on opens to its two tools
 *   0             — a pending business has no «ביקורות מלקוחות» section
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import ToolsPage from "@/app/[locale]/producer/dashboard/tools/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const { AUTH } = vi.hoisted(() => ({ AUTH: { user: { id: 1, name: "דנה", role: "producer" }, loading: false } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => AUTH }));
// Namespace-aware keys, so «אירועים» from nav.events is told apart from a
// dashboard key with the same tail.
// One function per namespace, as next-intl gives: the page's fetch effect
// depends on `t`, and a fresh function per render would refetch forever.
vi.mock("next-intl", () => {
  const cache = new Map();
  const make = (ns) => {
    const t = (key) => `${ns}.${key}`;
    t.rich = (key) => `${ns}.${key}`;
    return t;
  };
  return {
    useLocale: () => "he",
    useTranslations: (ns) => {
      if (!cache.has(ns)) cache.set(ns, make(ns));
      return cache.get(ns);
    },
  };
});
// A stable router too: the fetch effect depends on it.
const { ROUTER } = vi.hoisted(() => ({ ROUTER: { push: () => {}, replace: () => {} } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
  useRouter: () => ROUTER,
}));
vi.mock("@/components/producer/RequestReviewCard", () => ({ default: () => <div data-testid="request-review-stub" /> }));
vi.mock("@/components/producer/BusinessQrCard", () => ({ default: () => null }));
vi.mock("@/components/producer/ShareKitSection", () => ({ default: () => null }));
vi.mock("@/lib/producer-completeness", () => ({ producerCompleteness: () => ({ missing: [], priority: "green" }) }));

const { state } = vi.hoisted(() => ({ state: { status: "approved", rescue: false, newTools: new Set() } }));
vi.mock("@/lib/rescue", () => ({ rescueBagsEnabled: () => state.rescue }));
vi.mock("@/hooks/useWhatsNew", () => ({ useNewTools: () => state.newTools }));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn((url) => {
      if (url === "/producers/me/dashboard") {
        return Promise.resolve({ data: { producer: { id: "7", name: "חוות ערוגות נועם", status: state.status } } });
      }
      if (url === "/producers/me") {
        return Promise.resolve({ data: { id: 7, slug: "arugot-noam", status: state.status, kind: "producer", images: [], categories: [] } });
      }
      return Promise.resolve({ data: [] });
    }),
  },
}));

const G = "dashboard.producer.quick_links.groups";
const hrefs = (el) => within(el).queryAllByRole("link").map((a) => a.getAttribute("href"));

beforeEach(() => {
  state.status = "approved";
  state.rescue = false;
  state.newTools = new Set();
});

describe("«כלים» grouped by task (MEH-3669)", () => {
  it("shows the groups in order: offer → reviews → content → share", async () => {
    render(<ToolsPage />);
    await screen.findByTestId("tools-grid");
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([`${G}.offer_heading`, `${G}.reviews_heading`, `${G}.content_heading`, "share.quiet_label"]);
  });

  it("«אירועים» is closed by default and holds no tool link (many × closed)", async () => {
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-events");
    const toggle = within(card).getByRole("button", { name: /nav\.events/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(card).getByText(`${G}.events_sub`)).toBeInTheDocument();
    expect(hrefs(card)).toEqual([]);
  });

  it("opening «אירועים» shows exactly events and experiences (many × open)", async () => {
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-events");
    const toggle = within(card).getByRole("button", { name: /nav\.events/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls"));
    expect(panel).not.toBeNull();
    expect(hrefs(panel)).toEqual(["/producer/dashboard/events", "/producer/dashboard/experiences"]);
    fireEvent.click(toggle);
    expect(hrefs(card)).toEqual([]);
  });

  it("bags off: «הזדמנויות» is one link straight to group buys, sub «קבוצת רכישה» (1 item)", async () => {
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-opportunities");
    expect(within(card).queryByRole("button")).toBeNull();
    expect(hrefs(card)).toEqual(["/producer/dashboard/group-buys"]);
    expect(within(card).getByText(`${G}.opportunities_sub_no_rescue`)).toBeInTheDocument();
    expect(within(card).queryByText(`${G}.opportunities_sub`)).toBeNull();
  });

  it("bags on: «הזדמנויות» opens to group buys and bags", async () => {
    state.rescue = true;
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-opportunities");
    expect(within(card).getByText(`${G}.opportunities_sub`)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: /nav\.opportunities/ }));
    expect(hrefs(card)).toEqual(["/producer/dashboard/group-buys", "/producer/dashboard/rescue"]);
  });

  it("the reviews group holds the reviews tile and the request-a-review card", async () => {
    render(<ToolsPage />);
    const section = await screen.findByTestId("tools-group-reviews");
    expect(hrefs(section)).toEqual(["/producer/dashboard/reviews"]);
    expect(within(section).getByTestId("request-review-stub")).toBeInTheDocument();
    expect(hrefs(screen.getByTestId("tools-group-content"))).toEqual(["/producer/dashboard/recipes"]);
  });

  it("a pending business has no reviews group, and «הזדמנויות» carries the locked line (0 items)", async () => {
    state.status = "pending";
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-opportunities");
    expect(within(card).getByTestId("tool-locked-line")).toBeInTheDocument();
    expect(screen.queryByTestId("tools-group-reviews")).toBeNull();
  });

  it("a closed group shows «חדש» when one of its tools is new", async () => {
    state.newTools = new Set(["/producer/dashboard/experiences"]);
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-events");
    expect(within(card).getAllByTestId("new-tool-pill")).toHaveLength(1);
    // Opened, the group pill gives way to the row's own: still one pill.
    fireEvent.click(within(card).getByRole("button", { name: /nav\.events/ }));
    const pills = within(card).getAllByTestId("new-tool-pill");
    expect(pills).toHaveLength(1);
    expect(pills[0].closest("a")?.getAttribute("href")).toBe("/producer/dashboard/experiences");
  });

  it("a one-tool group (bags off) shows «חדש» when that tool is new", async () => {
    state.newTools = new Set(["/producer/dashboard/group-buys"]);
    render(<ToolsPage />);
    const card = await screen.findByTestId("tool-group-opportunities");
    expect(within(card).getAllByTestId("new-tool-pill")).toHaveLength(1);
    expect(within(screen.getByTestId("tool-group-events")).queryByTestId("new-tool-pill")).toBeNull();
  });
});
