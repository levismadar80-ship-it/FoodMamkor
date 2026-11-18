import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * MEH-2858 — no orphan lists: the footer's «קבוצות רכישה» and «סלי הפתעה»
 * links appear only while their hub has at least one public item. Fail-closed
 * like the events gate (MEH-2369), so every "hidden" case is paired with proof
 * that the request happened (or, for a pilot that is off, that it did not).
 */

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn() } }));

import { useHubNavGate, resetHubNavGateRequests } from "@/lib/use-hub-nav-gate";

function Probe({ hub }) {
  const visible = useHubNavGate(hub);
  return <span data-testid="gate">{visible ? "shown" : "hidden"}</span>;
}
const gate = () => screen.getByTestId("gate").textContent;
const list = (n) => Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `x${i}` })) });

beforeEach(() => {
  resetHubNavGateRequests();
  get.mockReset();
  sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe.each([
  ["groupBuys", "/group-buys"],
  ["rescue", "/rescue/offers"],
])("useHubNavGate(%s) (MEH-2858)", (hub, endpoint) => {
  it(`1 item → shown, read from ${endpoint}`, async () => {
    get.mockReturnValue(list(1));
    render(<Probe hub={hub} />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledWith(endpoint);
  });

  it("0 items → hidden, and the request DID happen", async () => {
    get.mockReturnValue(list(0));
    render(<Probe hub={hub} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("unknown (still loading) → hidden on first paint", () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<Probe hub={hub} />);
    expect(gate()).toBe("hidden");
  });

  it("a failed request (e.g. 404 while a pilot is off server-side) → hidden", async () => {
    get.mockReturnValue(Promise.reject(Object.assign(new Error("404"), { response: { status: 404 } })));
    render(<Probe hub={hub} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("a malformed body → hidden", async () => {
    get.mockReturnValue(Promise.resolve({ data: { items: [1] } }));
    render(<Probe hub={hub} />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("a cached answer is reused — one request per session", async () => {
    get.mockReturnValue(list(2));
    const { unmount } = render(<Probe hub={hub} />);
    await waitFor(() => expect(gate()).toBe("shown"));
    unmount();
    render(<Probe hub={hub} />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("cache lifetime per hub (MEH-2858)", () => {
  // An answer cached 11 minutes ago: past rescue's 10-minute life, inside
  // group buys' hour. The fresh fetch returns 0 items, so the visible state
  // tells which answer was used.
  it.each([
    ["rescue", "meh_rescue_offers_any", 1, "hidden"],
    ["groupBuys", "meh_group_buys_any", 0, "shown"],
  ])("%s: an 11-minute-old cached «yes» → %#", async (hub, key, fetches, state) => {
    sessionStorage.setItem(key, JSON.stringify({ any: true, at: Date.now() - 11 * 60 * 1000 }));
    get.mockReturnValue(list(0));
    render(<Probe hub={hub} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(get).toHaveBeenCalledTimes(fetches);
    expect(gate()).toBe(state);
  });
});

// MEH-3125: the «הזדמנויות» nav tab must not vanish between two navigations
// of one visit when the evening's bags sell out. Once shown, it stays until a
// full reload (module state); the reload control proves the stickiness is what
// keeps it, not a stale cache.
describe("once shown, stays shown for the visit (MEH-3125)", () => {
  it("rescue: «yes», then the cache expires and the supply is gone → still shown", async () => {
    get.mockReturnValue(list(2));
    const { unmount } = render(<Probe hub="rescue" />);
    await waitFor(() => expect(gate()).toBe("shown"));
    unmount();
    // The 10-minute cache has lapsed and the bags are sold out.
    sessionStorage.clear();
    get.mockReturnValue(list(0));
    render(<Probe hub="rescue" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(gate()).toBe("shown");
  });

  it("control: after a reload (module state gone) the same answer → hidden", async () => {
    get.mockReturnValue(list(2));
    const { unmount } = render(<Probe hub="rescue" />);
    await waitFor(() => expect(gate()).toBe("shown"));
    unmount();
    sessionStorage.clear();
    resetHubNavGateRequests(); // what a full reload does to module state
    get.mockReturnValue(list(0));
    render(<Probe hub="rescue" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(gate()).toBe("hidden");
  });

  it("a «no» is NOT sticky — supply that appears later still shows", async () => {
    get.mockReturnValue(list(0));
    const { unmount } = render(<Probe hub="groupBuys" />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    unmount();
    sessionStorage.clear();
    get.mockReturnValue(list(1));
    render(<Probe hub="groupBuys" />);
    await waitFor(() => expect(gate()).toBe("shown"));
  });
});

describe("rescue pilot off in this build (MEH-2858)", () => {
  it("asks nothing and stays hidden", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "false");
    get.mockReturnValue(list(3));
    render(<Probe hub="rescue" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
    expect(gate()).toBe("hidden");
  });
});

// MEH-3049: every hub tab is its own route, so the tab row mounts fresh on each
// switch. A cached answer must be on screen in the FIRST committed frame —
// otherwise the row is drawn without the tab and jumps when it appears. The
// commit is driven with flushSync and NO act(): layout effects (and their
// setState) flush inside that commit, passive effects do not, so the old
// useEffect version reads "hidden" here and the fix reads "shown".
describe("useHubNavGate — cached answer is in the first frame (MEH-3049)", () => {
  it.each(["groupBuys", "rescue"])("%s: cached true → shown before any passive effect runs", async (hub) => {
    const { createRoot } = await import("react-dom/client");
    const { flushSync } = await import("react-dom");
    const key = hub === "rescue" ? "meh_rescue_offers_any" : "meh_group_buys_any";
    sessionStorage.setItem(key, JSON.stringify({ any: true, at: Date.now() }));
    const prev = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      flushSync(() => root.render(<Probe hub={hub} />));
      expect(host.textContent).toBe("shown");
      expect(get).not.toHaveBeenCalled();
    } finally {
      flushSync(() => root.unmount());
      host.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = prev;
    }
  });
});
