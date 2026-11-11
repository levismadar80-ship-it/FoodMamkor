/**
 * MEH-2859 — the shared four-tab hub row.
 *
 * What a green here is supposed to mean: the row shows «אירועים» ·
 * «חוויות» · «קבוצות רכישה» · «סלי הפתעה» in that order, the last two appear
 * ONLY when their own supply gate says so, each goes to its own route, and the
 * page that owns two of the tabs still switches them without a navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k) => (ns ? `${ns}.${k}` : k),
}));

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
  Link: ({ children, href, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

const gates = { groupBuys: false, rescue: false };
vi.mock("@/lib/use-hub-nav-gate", () => ({ useHubNavGate: (hub) => gates[hub] }));

import ListingHubTabs, { HUB_TABS } from "@/components/ListingHubTabs";

const labels = () => screen.getAllByRole("tab").map((el) => el.textContent);
const values = () => screen.getAllByRole("tab").map((el) => el.getAttribute("data-tab-value"));

beforeEach(() => {
  cleanup();
  push.mockClear();
  gates.groupBuys = false;
  gates.rescue = false;
});

describe("ListingHubTabs — which tabs exist", () => {
  it("with no supply: the two always-on tabs only", () => {
    render(<ListingHubTabs active="events" />);
    expect(values()).toEqual(["events", "experiences"]);
    expect(screen.queryByText("events.list.tab_group_buys")).toBeNull();
    expect(screen.queryByText("events.list.tab_rescue")).toBeNull();
  });

  it("group buys in supply adds ONLY its tab", () => {
    gates.groupBuys = true;
    render(<ListingHubTabs active="events" />);
    expect(values()).toEqual(["events", "experiences", "groupBuys"]);
  });

  it("baskets in supply adds ONLY its tab", () => {
    gates.rescue = true;
    render(<ListingHubTabs active="events" />);
    expect(values()).toEqual(["events", "experiences", "rescue"]);
  });

  it("all four in supply: the AC's order, left to right", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    render(<ListingHubTabs active="events" />);
    expect(values()).toEqual(["events", "experiences", "groupBuys", "rescue"]);
    expect(labels()).toEqual([
      "events.list.tab_events",
      // «חוויות», the short form — the tab row's only. The route keeps
      // `tab_experiences` / `h1_experiences` for its own heading.
      "events.list.tab_experiences_short",
      "events.list.tab_group_buys",
      "events.list.tab_rescue",
    ]);
  });

  it("a gated tab is ABSENT, never rendered-and-disabled", () => {
    render(<ListingHubTabs active="events" />);
    const disabled = screen.getAllByRole("tab").filter((el) => el.hasAttribute("disabled"));
    expect(disabled).toHaveLength(0);
    expect(screen.queryByText("events.list.tab_group_buys")).toBeNull();
  });
});

describe("ListingHubTabs — what a tab does", () => {
  it("exactly one tab stop, on the selected tab, whatever the supply", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    render(<ListingHubTabs active="groupBuys" />);
    const indexes = screen.getAllByRole("tab").map((el) => el.getAttribute("tabindex"));
    expect(indexes).toEqual(["-1", "-1", "0", "-1"]);
    expect(screen.getAllByRole("tab").filter((el) => el.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  it("a gated tab navigates to its own route", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    render(<ListingHubTabs active="events" />);
    fireEvent.click(screen.getByText("events.list.tab_group_buys"));
    expect(push).toHaveBeenCalledWith("/group-buys");
    fireEvent.click(screen.getByText("events.list.tab_rescue"));
    expect(push).toHaveBeenCalledWith("/rescue");
  });

  it("the owning page's own two tabs switch locally, without a navigation", () => {
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("events.list.tab_experiences_short"));
    expect(onSelect).toHaveBeenCalledWith("experiences");
    expect(push, "a local switch must not also push a route").not.toHaveBeenCalled();
  });

  it("onSelect does NOT swallow a gated tab — that one still navigates", () => {
    gates.groupBuys = true;
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("events.list.tab_group_buys"));
    expect(push).toHaveBeenCalledWith("/group-buys");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the tab already showing does nothing at all", () => {
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("events.list.tab_events"));
    expect(push).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ArrowRight from the first tab wraps to the LAST one (RTL contract)", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    render(<ListingHubTabs active="events" />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    // ArrowRight = previous in Hebrew reading order (hooks/useTabsKeyboard.js),
    // so from the first tab it wraps to «סלי הפתעה» and navigates there.
    expect(document.activeElement).toBe(tabs[3]);
    expect(push).toHaveBeenCalledWith("/rescue");
  });
});

describe("ListingHubTabs — the trailing action is ONE element", () => {
  it("renders the action once, outside the tablist", () => {
    render(<ListingHubTabs active="events" action={<a href="/x">הוסיפו אירוע</a>} />);
    expect(screen.getAllByText("הוסיפו אירוע")).toHaveLength(1);
    const tablist = screen.getByRole("tablist");
    expect(
      within(tablist).queryByText("הוסיפו אירוע"),
      "a tablist may only own role=tab children (axe aria-required-children)",
    ).toBeNull();
  });

  it("no action, no empty wrapper", () => {
    render(<ListingHubTabs active="events" />);
    expect(screen.queryByText("הוסיפו אירוע")).toBeNull();
  });

  it("the action is not duplicated per breakpoint (frontend.md § one control, one element)", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../components/ListingHubTabs.jsx"), "utf8");
    // The MEH-2776 failure mode: `hidden md:block` beside `md:hidden`, which
    // drifts because a fix lands in one copy. This row wraps instead.
    expect(src).not.toMatch(/md:hidden/);
    expect(src, "control: the file really does lay the row out with wrapping").toMatch(/flex-wrap/);
  });
});

describe("ListingHubTabs — every tab the registry declares has a real route", () => {
  it("four tabs, four distinct hrefs, matching the pages that render them", () => {
    expect(HUB_TABS.map((tab) => tab.href)).toEqual([
      "/events",
      "/experiences",
      "/group-buys",
      "/rescue",
    ]);
    expect(new Set(HUB_TABS.map((tab) => tab.value)).size).toBe(4);
  });

  it("the three other routes mount the row with their own tab selected", () => {
    const read = (f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
    expect(read("app/[locale]/group-buys/GroupBuysClient.jsx")).toMatch(/<ListingHubTabs active="groupBuys"/);
    expect(read("app/[locale]/rescue/page.jsx")).toMatch(/<ListingHubTabs active="rescue"/);
    const events = read("app/[locale]/events/EventsClient.jsx");
    expect(events).toMatch(/<ListingHubTabs/);
    expect(events, "the events hub picks its tab from the route it was mounted on").toMatch(
      /active=\{isExp \? "experiences" : "events"\}/,
    );
    // Control: the inline two-tab row it replaced is gone, so this cannot pass
    // against a page that still renders its own.
    expect(events).not.toMatch(/data-tab-value="experiences"/);
  });
});
