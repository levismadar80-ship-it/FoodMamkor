/**
 * MEH-2975 — where a link to the listing hub lands.
 */
import { describe, expect, it } from "vitest";

import { HUB_TABS } from "@/components/ListingHubTabs";
import { HUB_LANDING_ORDER, hubLandingHref, isHubHref, isHubPath } from "@/lib/hub-landing";

describe("hubLandingHref", () => {
  it.each([
    [{ events: true }, "/events"],
    [{ experiences: true }, "/experiences"],
    [{ groupBuys: true }, "/group-buys"],
    [{ rescue: true }, "/rescue"],
    [{ events: true, experiences: true, groupBuys: true, rescue: true }, "/events"],
    [{ events: false, experiences: true, rescue: true }, "/experiences"],
    [{ groupBuys: true, rescue: true }, "/group-buys"],
  ])("%j → %s", (supply, href) => {
    expect(hubLandingHref(supply)).toBe(href);
  });

  // Loading, or the backend unreachable: every gate is closed. The callers
  // hide the link in that state; the function still answers the hub default.
  it.each([[{}], [undefined], [{ events: false, experiences: false, groupBuys: false, rescue: false }]])(
    "with nothing known (%j) it is the hub default",
    (supply) => {
      expect(hubLandingHref(supply)).toBe("/events");
    },
  );

  // The landing order is a second copy of the tab row's order. If a tab is
  // added, removed or moved there, this goes red instead of the link quietly
  // skipping it.
  it("follows the tab row: same routes, same order", () => {
    expect(HUB_LANDING_ORDER.map((entry) => entry.href)).toEqual(HUB_TABS.map((tab) => tab.href));
    expect(HUB_LANDING_ORDER.map((entry) => entry.gate)).toEqual(HUB_TABS.map((tab) => tab.value));
  });

  it.each(["/events", "/events/12", "/experiences", "/group-buys/7", "/rescue"])("%s is a hub path", (path) => {
    expect(isHubPath(path)).toBe(true);
  });

  // A shared prefix is not the hub: these are business slugs or other pages.
  it.each(["/eventsx", "/rescued", "/about", "/", "", null, undefined])("%j is not a hub path", (path) => {
    expect(isHubPath(path)).toBe(false);
  });

  it("knows a hub href from any other", () => {
    expect(["/events", "/experiences", "/group-buys", "/rescue"].map(isHubHref)).toEqual([true, true, true, true]);
    expect(["/", "/about", "/map", "/events/12"].map(isHubHref)).toEqual([false, false, false, false]);
  });
});
