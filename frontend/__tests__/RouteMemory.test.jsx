/**
 * MEH-2714 — route-memory: entrance reveals play on the first visit only, and
 * the homepage's scroll/grid restore runs on a history return only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
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

function Tracker({ hook }) {
  hook();
  return null;
}

describe("useRevealSkip", () => {
  beforeEach(() => {
    mockPath = "/";
  });

  it("is false on the first visit, true after leaving the route and coming back", async () => {
    const { useRevealSkip, useTrackRouteLeaves } = await freshModule();
    const seen = [];
    const tracker = render(<Tracker hook={useTrackRouteLeaves} />);
    const first = render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);
    first.unmount();
    mockPath = "/meshek-barak"; // navigate away: the layout-level tracker sees the change
    tracker.rerender(<Tracker hook={useTrackRouteLeaves} />);
    mockPath = "/"; // back
    tracker.rerender(<Tracker hook={useTrackRouteLeaves} />);
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(true);
  });

  it("a block unmounting while the reader stays on the route does not mark it", async () => {
    const { useRevealSkip, useTrackRouteLeaves } = await freshModule();
    const seen = [];
    render(<Tracker hook={useTrackRouteLeaves} />);
    // skeleton → content swap on the same route
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />).unmount();
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen).toEqual([false, false]);
  });

  it("StrictMode's dev double effect does not mark the route the reader is on", async () => {
    const { useRevealSkip, useTrackRouteLeaves } = await freshModule();
    const seen = [];
    render(
      <StrictMode>
        <Tracker hook={useTrackRouteLeaves} />
      </StrictMode>,
    );
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(false);
  });

  it("any second visit skips — a logo click back to / as well as browser back", async () => {
    const { useRevealSkip, useTrackRouteLeaves } = await freshModule();
    const seen = [];
    const tracker = render(<Tracker hook={useTrackRouteLeaves} />);
    mockPath = "/meshek-barak";
    tracker.rerender(<Tracker hook={useTrackRouteLeaves} />);
    window.history.pushState(null, "", "/"); // push, no popstate
    mockPath = "/";
    tracker.rerender(<Tracker hook={useTrackRouteLeaves} />);
    render(<Probe hook={useRevealSkip} onValue={(v) => seen.push(v)} />);
    expect(seen.at(-1)).toBe(true);
  });

  it("is per route — leaving / does not skip /about", async () => {
    const { useRevealSkip, useTrackRouteLeaves } = await freshModule();
    const seen = [];
    const tracker = render(<Tracker hook={useTrackRouteLeaves} />);
    mockPath = "/about";
    tracker.rerender(<Tracker hook={useTrackRouteLeaves} />);
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

  it("an unconsumed history step on / is dropped once the reader moves to another route", async () => {
    window.history.replaceState(null, "", "/");
    mockPath = "/";
    const { consumeHistoryReturn, useTrackRouteLeaves } = await freshModule();
    consumeHistoryReturn(); // document entry
    const tracker = render(<Tracker hook={useTrackRouteLeaves} />);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate")); // same-document step on /
    });
    window.history.pushState(null, "", "/about");
    mockPath = "/about";
    tracker.rerender(<Tracker hook={useTrackRouteLeaves} />);
    window.history.pushState(null, "", "/"); // logo
    mockPath = "/";
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
