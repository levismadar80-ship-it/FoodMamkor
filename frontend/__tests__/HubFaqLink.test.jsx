/**
 * MEH-3949 — the way to «שאלות נפוצות» when the list is long. The questions
 * sit under the /group-buys and /rescue lists (MEH-3737), and the lists have
 * no pages, so a link above the list jumps to them and a link on each offer
 * page leads to them.
 *
 * Cells: list page × (0 groups, 1, many, load error) → the link is there in
 * each, above the list; the anchor it points at is the HubFaq section id;
 * offer page link → the hub path + the anchor, with catalog text in he + en.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import he from "../messages/he.json";
import en from "../messages/en.json";

const CATALOG = { he, en };
let locale = "he";
const lookup = (msgs, ns) => (key) => `${ns}.${key}`.split(".").reduce((o, k) => o?.[k], msgs);
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key, vars) => {
    const v = lookup(CATALOG[locale], ns)(key);
    return typeof v === "string" ? v.replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? "") : `${ns}.${key}`;
  },
  useLocale: () => locale,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (arg) => (key) => lookup(CATALOG[arg.locale], arg.namespace)(key) ?? key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
  usePathname: () => "/group-buys",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/image", () => ({ default: (props) => <img alt="" {...props} /> }));
vi.mock("@/components/CitySearch", () => ({ default: () => <div /> }));
const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a) } }));

import HubFaqLink from "@/components/HubFaqLink";
import HubFaq from "@/components/HubFaq";
import GroupBuysClient from "@/app/[locale]/group-buys/GroupBuysClient";
import { HUB_FAQ } from "@/lib/hub-faq";

const gb = (id) => ({ id, title: `g${id}`, status: "open", commits_count: 1, min_participants: 5, deadline: "2099-01-01T00:00:00", price: 10, group_price: 8, producer: { id: 1, name: "b" } });

describe("MEH-3949 · link above the /group-buys list", () => {
  it.each([
    ["0 groups", () => Promise.resolve({ data: [] }), 1],
    ["1 group", () => Promise.resolve({ data: [gb(1)] }), 1],
    ["many groups", () => Promise.resolve({ data: [gb(1), gb(2), gb(3), gb(4)] }), 4],
    ["a load error", () => Promise.reject(new Error("down")), 1],
  ])("is there with %s, before the list", async (_, answer, shown) => {
    locale = "he";
    get.mockImplementation((url) => (url.includes("counts") ? Promise.resolve({ data: {} }) : answer()));
    const { container } = render(<GroupBuysClient />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    const link = screen.getByTestId("hub-faq-link-list");
    expect(link.getAttribute("href")).toBe("/group-buys#faq");
    expect(link.textContent).toBe(he.hub_faq.list_link);
    // Above the list: the link comes before every card and the empty / error state.
    let after = [];
    await waitFor(() => {
      after = [...container.querySelectorAll('a[href^="/group-buys/"], [data-testid="group-buys-empty"], [data-testid="group-buys-error"]')];
      expect(after).toHaveLength(shown);
    });
    for (const el of after) expect(link.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("MEH-3949 · link above the /rescue list", () => {
  // Source text on purpose: the page is an async server component with the
  // pilot flag and two server reads; what matters here is only that it
  // renders the link before the list (testing.md allows this, MEH-3531).
  it("rescue/page.jsx renders HubFaqLink before RescueList", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(`${process.cwd()}/app/[locale]/rescue/page.jsx`, "utf8");
    const link = src.indexOf('<HubFaqLink hub="rescue" variant="list"');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(src.indexOf("<RescueList"));
  });
});

describe.each(["groupBuys", "rescue"])("MEH-3949 · %s", (hub) => {
  it("the list link points at the id HubFaq renders", async () => {
    render(<div>{await HubFaq({ faq: HUB_FAQ[hub], locale: "he" })}<HubFaqLink hub={hub} variant="list" /></div>);
    const target = screen.getByTestId("hub-faq-link-list").getAttribute("href").split("#")[1];
    expect(document.getElementById(target)).toBe(screen.getByTestId("hub-faq"));
  });

  it.each(["he", "en"])("[%s] the offer-page link goes to the hub's questions, in catalog text", (l) => {
    locale = l;
    render(<HubFaqLink hub={hub} variant="detail" />);
    const link = screen.getByTestId("hub-faq-link-detail");
    expect(link.getAttribute("href")).toBe(`${HUB_FAQ[hub].path}#faq`);
    expect(link.textContent).toBe(CATALOG[l].hub_faq[`detail_${hub}`]);
  });
});
