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

// Every tab is an anchor now, so a destination is asserted as an href rather
// than as a router call — the mechanism is not the contract, the destination is.
vi.mock("@/i18n/navigation", () => ({
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

const hrefOf = (value) =>
  screen.getByTestId("listing-hub-tabs").querySelector(`[data-tab-value="${value}"]`).getAttribute("href");

beforeEach(() => {
  cleanup();
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
  it("exactly one tab stop, on the selected tab, when everything is in supply", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    render(<ListingHubTabs active="groupBuys" />);
    const indexes = screen.getAllByRole("tab").map((el) => el.getAttribute("tabindex"));
    expect(indexes).toEqual(["-1", "-1", "0", "-1"]);
    expect(screen.getAllByRole("tab").filter((el) => el.getAttribute("aria-selected") === "true")).toHaveLength(1);
  });

  /**
   * The page you are STANDING ON always has its tab, selected, even when its
   * own supply gate is false. Three ways that happens, none of them exotic:
   *   - every cold load of /group-buys and /rescue, because the gate starts
   *     false and only flips when its fetch lands (use-hub-nav-gate.js:84);
   *   - supply legitimately empty — the route still renders for a reader who
   *     arrived from a bookmark, a search result or the sitemap;
   *   - any error or malformed body, since the gate fails closed.
   *
   * Without the exemption the row shows two tabs claiming neither, and a
   * `role="tablist"` with no `tabIndex=0` child cannot be reached by Tab at
   * all — the exact failure hooks/useTabsKeyboard.js warns about.
   *
   * The earlier version of the test above was named "whatever the supply" and
   * set the gate to true before rendering, so it only ever ran the one state
   * where the answer was already right.
   */
  for (const active of ["groupBuys", "rescue"]) {
    it(`/${active}: its own tab is present and selected even with its gate false`, () => {
      expect(gates[active], "control: this is the gate-off case").toBe(false);
      render(<ListingHubTabs active={active} />);
      const tabs = screen.getAllByRole("tab");
      expect(tabs.map((el) => el.getAttribute("data-tab-value"))).toContain(active);
      expect(
        tabs.filter((el) => el.getAttribute("aria-selected") === "true").map((el) => el.getAttribute("data-tab-value")),
        "exactly one tab claims the page being shown",
      ).toEqual([active]);
      expect(
        tabs.filter((el) => el.getAttribute("tabindex") === "0"),
        "a tablist with no tab stop is unreachable by keyboard",
      ).toHaveLength(1);
    });
  }

  it("the exemption is for the ACTIVE tab only — the other gated one stays hidden", () => {
    render(<ListingHubTabs active="groupBuys" />);
    expect(screen.getAllByRole("tab").map((el) => el.getAttribute("data-tab-value"))).toEqual([
      "events",
      "experiences",
      "groupBuys",
    ]);
  });

  it("every tab is a real link to its own route — middle-click, ⌘-click, crawlable", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    render(<ListingHubTabs active="events" />);
    expect(hrefOf("events")).toBe("/events");
    expect(hrefOf("experiences")).toBe("/experiences");
    expect(hrefOf("groupBuys")).toBe("/group-buys");
    expect(hrefOf("rescue")).toBe("/rescue");
    // The AC says the two new tabs LINK to their routes; a button would have
    // no href at all, which is what this would have caught.
    expect(screen.getAllByRole("tab").every((el) => el.tagName === "A")).toBe(true);
  });

  it("the owning page's own two tabs switch in place, without following the link", () => {
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    const tab = screen.getByText("events.list.tab_experiences_short");
    const handled = fireEvent.click(tab);
    expect(onSelect).toHaveBeenCalledWith("experiences");
    // fireEvent returns false once preventDefault ran — the page switches
    // state first (MEH-2245's same-tick switch) and routes itself.
    expect(handled, "a local switch must not also follow the href").toBe(false);
    // It still carries the href, so it is a link for everything except a
    // plain left-click.
    expect(tab.getAttribute("href")).toBe("/experiences");
  });

  it("onSelect does NOT swallow a gated tab — that one follows its link", () => {
    gates.groupBuys = true;
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    const handled = fireEvent.click(screen.getByText("events.list.tab_group_buys"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(handled, "nothing intercepted it, so the anchor navigates").toBe(true);
  });

  it("clicking the tab already showing does nothing at all", () => {
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    const handled = fireEvent.click(screen.getByText("events.list.tab_events"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(handled, "no reload of the page you are already on").toBe(false);
  });

  it("arrows MOVE focus across the row without navigating away from it", () => {
    gates.groupBuys = true;
    gates.rescue = true;
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    // ArrowRight = previous in Hebrew reading order (hooks/useTabsKeyboard.js),
    // so from the first tab it wraps to «סלי הפתעה».
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[3]);
    // ...and that is ALL it does. A route-changing tab does not activate on
    // focus, or a keyboard user could not read the row without being taken
    // off the page. Enter on the focused anchor is what navigates.
    expect(onSelect).not.toHaveBeenCalled();
    expect(tabs[3].getAttribute("aria-selected")).toBe("false");
  });

  it("but the page's OWN two tabs still activate on focus (the MEH-2199 contract)", () => {
    const onSelect = vi.fn();
    render(<ListingHubTabs active="events" onSelect={onSelect} />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(onSelect, "switching in place is cheap, so focus selects").toHaveBeenCalledWith("experiences");
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

  it("no action prop, no wrapper element for it", () => {
    const { container } = render(<ListingHubTabs active="events" />);
    const row = container.querySelector('[role="tablist"]').parentElement;
    // The tablist is the row's only child when nothing was passed — an empty
    // wrapper would still occupy a flex slot and shift the border.
    expect(row.children).toHaveLength(1);
  });

  // The MEH-2776 "one control, one element" claim is asserted behaviourally by
  // "renders the action once" above — a `hidden md:block` + `md:hidden` pair
  // would put TWO matching nodes in the DOM. The source-text regexes that used
  // to sit here asserted that the prescribed change was applied rather than
  // what it does, which ADR-032 §2.6 rules out.
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

  // A WIRING check, named as one: it reads source text, so it proves the call
  // sites exist and nothing more. What they RENDER is evidenced in a real
  // browser instead — qa-artifacts/MEH-2859/tabs-{375,1440}-{events,experiences,
  // group-buys,rescue}.webp, each measured with its own tab reported selected.
  // MEH-3013: the routes now mount the row THROUGH components/HubShell.jsx
  // (hero + row, one owner); HubShellGuard.test.js asserts nobody else
  // imports ListingHubTabs. This keeps the per-route `active` wiring.
  it("wiring: the three other routes mount the row with their own tab", () => {
    const read = (f) => fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
    expect(read("components/HubShell.jsx")).toMatch(/<ListingHubTabs active=\{active\}/);
    expect(read("app/[locale]/group-buys/GroupBuysClient.jsx")).toMatch(/<HubShell\s+active="groupBuys"/);
    expect(read("app/[locale]/rescue/page.jsx")).toMatch(/<HubShell\s+active="rescue"/);
    const events = read("app/[locale]/events/EventsClient.jsx");
    expect(events).toMatch(/<HubShell/);
    expect(events, "the events hub picks its tab from the route it was mounted on").toMatch(
      /active=\{isExp \? "experiences" : "events"\}/,
    );
    // Control: the inline two-tab row it replaced is gone, so this cannot pass
    // against a page that still renders its own.
    expect(events).not.toMatch(/data-tab-value="experiences"/);
  });
});
