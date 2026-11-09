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

import { useHubNavGate } from "@/lib/use-hub-nav-gate";

function Probe({ hub }) {
  const visible = useHubNavGate(hub);
  return <span data-testid="gate">{visible ? "shown" : "hidden"}</span>;
}
const gate = () => screen.getByTestId("gate").textContent;
const list = (n) => Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `x${i}` })) });

beforeEach(() => {
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
