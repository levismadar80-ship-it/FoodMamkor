import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * MEH-2965 — one request per endpoint per page load, however many consumers
 * mount. Header, Footer and BottomNav mount in the same commit; each used to
 * miss the session cache (written only when the response lands) and fire its
 * own request, and `/experiences/count` is limited to 60/minute per IP.
 *
 * Shown failing against the old hooks: with three consumers each endpoint was
 * called 3 times.
 */

const get = vi.fn();
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn() } }));

import { useEventsNavGate, resetEventsNavGateRequest } from "@/lib/use-events-nav-gate";
import {
  useExperiencesNavGate,
  resetExperiencesNavGateRequest,
  EXPERIENCES_NAV_THRESHOLD,
} from "@/lib/use-experiences-nav-gate";
import { useHubNavGate, resetHubNavGateRequests } from "@/lib/use-hub-nav-gate";

const CONSUMERS = 3; // Header, Footer, BottomNav

function Probe({ id }) {
  const all = [
    useEventsNavGate(),
    useExperiencesNavGate(),
    useHubNavGate("groupBuys"),
    useHubNavGate("rescue"),
  ];
  return <span data-testid={`probe-${id}`}>{all.map((v) => (v ? "1" : "0")).join("")}</span>;
}

const answers = {
  "/events/upcoming": { data: [{ id: "e1" }] },
  "/experiences/count": { data: { count: EXPERIENCES_NAV_THRESHOLD } },
  "/group-buys": { data: [{ id: "g1" }] },
  "/rescue/offers": { data: [{ id: "r1" }] },
};
const callsTo = (endpoint) => get.mock.calls.filter(([url]) => url === endpoint).length;

beforeEach(() => {
  resetEventsNavGateRequest();
  resetExperiencesNavGateRequest();
  resetHubNavGateRequests();
  get.mockReset();
  sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_RESCUE_BAGS_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("nav gates share one request per endpoint (MEH-2965)", () => {
  it.each(Object.keys(answers))("%s is asked once for three consumers, and all three get the answer", async (endpoint) => {
    get.mockImplementation((url) => Promise.resolve(answers[url]));
    render(
      <>
        {Array.from({ length: CONSUMERS }, (_, i) => (
          <Probe key={i} id={i} />
        ))}
      </>,
    );
    // Every consumer opens every gate — so the shared promise reached all of
    // them, not only the one that started it.
    await waitFor(() => {
      for (let i = 0; i < CONSUMERS; i += 1) {
        expect(screen.getByTestId(`probe-${i}`).textContent).toBe("1111");
      }
    });
    expect(callsTo(endpoint)).toBe(1);
  });

  it("a failed request is shared too, and leaves every consumer closed", async () => {
    get.mockImplementation(() => Promise.reject(new Error("503")));
    render(
      <>
        <Probe id={0} />
        <Probe id={1} />
      </>,
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(Object.keys(answers).length));
    expect(screen.getByTestId("probe-0").textContent).toBe("0000");
    expect(screen.getByTestId("probe-1").textContent).toBe("0000");
  });

  it("a failure is not remembered: the next mount asks again", async () => {
    get.mockImplementation(() => Promise.reject(new Error("503")));
    const first = render(<Probe id={0} />);
    await waitFor(() => expect(callsTo("/events/upcoming")).toBe(1));
    first.unmount();
    // Let the settled promise drop out of the in-flight slot.
    await Promise.resolve();
    await Promise.resolve();
    get.mockImplementation((url) => Promise.resolve(answers[url]));
    render(<Probe id={1} />);
    await waitFor(() => expect(screen.getByTestId("probe-1").textContent).toBe("1111"));
    expect(callsTo("/events/upcoming")).toBe(2);
  });
});
