import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * MEH-2369 — the footer "אירועים" link appears only when at least one upcoming
 * public event exists. Fail-closed like the experiences gate (MEH-1918), so
 * every "hidden" case is paired with proof that the request happened.
 */

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn() } }));

import { useEventsNavGate } from "@/lib/use-events-nav-gate";

function Probe() {
  const visible = useEventsNavGate();
  return <span data-testid="gate">{visible ? "shown" : "hidden"}</span>;
}
const gate = () => screen.getByTestId("gate").textContent;
const events = (n) => Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) });

beforeEach(() => {
  get.mockReset();
  sessionStorage.clear();
});

describe("useEventsNavGate (MEH-2369)", () => {
  it("1 upcoming event → shown, asking for at most one", async () => {
    get.mockReturnValue(events(1));
    render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledWith("/events/upcoming", { params: { limit: 1 } });
  });

  it("many (API ignores the limit) → shown", async () => {
    get.mockReturnValue(events(5));
    render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
  });

  it("0 upcoming events → hidden, and the request DID happen", async () => {
    get.mockReturnValue(events(0));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("first paint is hidden (no hydration flash)", () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<Probe />);
    expect(gate()).toBe("hidden");
  });

  it("a failed request → hidden", async () => {
    get.mockReturnValue(Promise.reject(new Error("down")));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("a malformed body → hidden and NOT cached", async () => {
    get.mockReturnValue(Promise.resolve({ data: { events: [1] } }));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
    expect(sessionStorage.getItem("meh_events_upcoming_any")).toBeNull();
  });

  it("a second mount in the session reuses the cached answer", async () => {
    get.mockReturnValue(events(2));
    const first = render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
    first.unmount();
    render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledTimes(1);
  });
});
