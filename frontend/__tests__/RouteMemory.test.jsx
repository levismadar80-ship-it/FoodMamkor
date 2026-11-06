/**
 * MEH-2714 — route-memory: entrance reveals play on the first visit only, and
 * the homepage's scroll/grid restore runs on a history return only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

let mockPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

async function freshModule() {
  vi.resetModules();
  return import("@/lib/route-memory");
}

function Probe({ hook, onValue }) {
  onValue(hook());
  return null;
}

describe("useRevealSkip", () => {
  beforeEach(() => {
    mockPath = "/";
  });

  it("is false on the first visit, true after leaving and coming back", async () => {
    const { useRevealSkip } = await freshModule();
    const seen = [];
    const first = render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);
    first.unmount(); // navigate away
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(true);
  });

  it("does not skip a section that mounts late on the FIRST visit", async () => {
    const { useRevealSkip } = await freshModule();
    const seen = [];
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    // a second block mounts while the reader is still on the route
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen).toEqual([false, false]);
  });

  it("is per route — leaving / does not skip /about", async () => {
    const { useRevealSkip } = await freshModule();
    const seen = [];
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />).unmount();
    mockPath = "/about";
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);
  });
});

describe("consumeHistoryReturn", () => {
  it("is false for a fresh document load (navigate) and for a link click", async () => {
    window.history.replaceState(null, "", "/");
    const { consumeHistoryReturn } = await freshModule();
    expect(consumeHistoryReturn()).toBe(false);
    window.history.pushState(null, "", "/meshek-barak");
    window.history.pushState(null, "", "/"); // logo click
    expect(consumeHistoryReturn()).toBe(false);
  });

  it("is true for a back step that lands on this route", async () => {
    window.history.replaceState(null, "", "/");
    const { consumeHistoryReturn } = await freshModule();
    consumeHistoryReturn();
    window.history.pushState(null, "", "/meshek-barak");
    window.history.replaceState(null, "", "/"); // location after the back step
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(consumeHistoryReturn()).toBe(true);
    // consumed: the next arrival by link is not a return
    expect(consumeHistoryReturn()).toBe(false);
  });

  it("ignores a back step that was for another route", async () => {
    window.history.replaceState(null, "", "/about");
    const { consumeHistoryReturn } = await freshModule();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    window.history.pushState(null, "", "/"); // then a link to home
    expect(consumeHistoryReturn()).toBe(false);
  });

  it("is true when the document itself was a reload of this route", async () => {
    window.history.replaceState(null, "", "/");
    const spy = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([{ type: "reload" }]);
    const { consumeHistoryReturn } = await freshModule();
    expect(consumeHistoryReturn()).toBe(true);
    spy.mockRestore();
  });
});
