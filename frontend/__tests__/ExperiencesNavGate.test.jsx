import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * MEH-1918 — the "חוויות" nav link is gated on real supply.
 *
 * The gate is FAIL-CLOSED, which makes "the link is absent" the answer in
 * several very different worlds: below threshold, network error, malformed
 * body, and simply "hasn't resolved yet". A test that only asserted absence
 * would be green in all of them and would prove nothing about the threshold
 * (.claude/rules/testing.md — "a green that has two possible causes"). So the
 * visible case is asserted first and hardest, and every hidden case is paired
 * with a check that the request actually happened.
 */

const get = vi.fn();

vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn() } }));

vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({ default: (props) => <img alt={props.alt ?? ""} {...props} /> }));
vi.mock("@phosphor-icons/react", () => ({
  InstagramLogo: () => <span />,
  ArrowRight: () => <span />,
}));
vi.mock("@/components/ButtonSpinner", () => ({ default: () => <span /> }));
vi.mock("@/lib/errors", () => ({ detailToMessage: (e) => String(e) }));
vi.mock("@/lib/constants", () => ({ BRAND_NAME: "מהמקור" }));

import Footer from "@/components/Footer";
import {
  EXPERIENCES_NAV_THRESHOLD,
  useExperiencesNavGate,
} from "@/lib/use-experiences-nav-gate";

const ok = (count) => Promise.resolve({ data: { count } });

// A probe over the hook itself, so the gate's logic is asserted without
// dragging a whole nav component's dependency tree behind every case.
function Probe() {
  const visible = useExperiencesNavGate();
  return <span data-testid="gate">{visible ? "shown" : "hidden"}</span>;
}

const gate = () => screen.getByTestId("gate").textContent;
const experiencesLink = () => document.querySelector('a[href="/experiences"]');

beforeEach(() => {
  get.mockReset();
  sessionStorage.clear();
});

describe("useExperiencesNavGate — the threshold (MEH-1918)", () => {
  it("the constant is 3, and it is the value the gate actually compares against", () => {
    expect(EXPERIENCES_NAV_THRESHOLD).toBe(3);
  });

  it("at the threshold exactly → shown", async () => {
    get.mockReturnValue(ok(EXPERIENCES_NAV_THRESHOLD));
    render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledWith("/experiences/count");
  });

  it("above the threshold → shown", async () => {
    get.mockReturnValue(ok(11));
    render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
  });

  it("one below the threshold → hidden, and the request DID happen", async () => {
    get.mockReturnValue(ok(EXPERIENCES_NAV_THRESHOLD - 1));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    // Pairing the absence with the call is what separates "below threshold"
    // from "never asked".
    expect(gate()).toBe("hidden");
  });

  it("zero experiences → hidden", async () => {
    get.mockReturnValue(ok(0));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("renders hidden on the very first paint, before the response lands", () => {
    get.mockReturnValue(new Promise(() => {})); // never resolves
    render(<Probe />);
    // No flash-then-vanish during hydration: the initial state matches what
    // the server rendered.
    expect(gate()).toBe("hidden");
  });
});

describe("useExperiencesNavGate — fail-closed", () => {
  it("a rejected request leaves the link hidden and raises nothing", async () => {
    get.mockReturnValue(Promise.reject(new Error("network down")));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("a malformed body is rejected by the schema rather than compared", async () => {
    // `undefined >= 3` is false, so a missing guard would give the RIGHT answer
    // for the WRONG reason. The cache assertion below is what discriminates:
    // an unvalidated body would be cached and reused.
    get.mockReturnValue(Promise.resolve({ data: { count: "many" } }));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
    expect(sessionStorage.getItem("meh_experiences_count")).toBeNull();
  });

  it("a negative count is rejected too", async () => {
    get.mockReturnValue(ok(-5));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });

  it("an empty body does not throw", async () => {
    get.mockReturnValue(Promise.resolve({}));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(gate()).toBe("hidden");
  });
});

describe("useExperiencesNavGate — session cache", () => {
  it("a second mount in the same session does not re-request", async () => {
    get.mockReturnValue(ok(7));
    const first = render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<Probe />);
    // Answer still correct, and no second network call — this is what makes
    // "Header + Footer on one page" one request rather than two.
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("an expired cache entry is refetched, not trusted", async () => {
    sessionStorage.setItem(
      "meh_experiences_count",
      JSON.stringify({ count: 99, at: Date.now() - 2 * 60 * 60 * 1000 }),
    );
    get.mockReturnValue(ok(0));
    render(<Probe />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    // The stale 99 would have shown the link; the fresh 0 hides it.
    expect(gate()).toBe("hidden");
  });

  it("a corrupt cache entry is a miss, not an error", async () => {
    sessionStorage.setItem("meh_experiences_count", "{not json");
    get.mockReturnValue(ok(5));
    render(<Probe />);
    await waitFor(() => expect(gate()).toBe("shown"));
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("Footer — the link itself (MEH-1918)", () => {
  it("renders /experiences in the discover group once the gate opens", async () => {
    get.mockReturnValue(ok(4));
    render(<Footer />);
    await waitFor(() => expect(experiencesLink()).not.toBeNull());
    expect(experiencesLink().textContent).toBe("nav.footer.experiences");

    // It joins the READER group, next to /events — not the business column.
    const group = experiencesLink().closest("div");
    const hrefs = [...group.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/events");
    expect(hrefs).not.toContain("/join");
  });

  it("is absent below the threshold, while the rest of the footer is intact", async () => {
    get.mockReturnValue(ok(1));
    render(<Footer />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(experiencesLink()).toBeNull();
    // Not green by rendering nothing: the neighbours are still there.
    expect(document.querySelector('a[href="/events"]')).not.toBeNull();
    expect(document.querySelector('a[href="/map"]')).not.toBeNull();
  });

  it("is absent when the count request fails", async () => {
    get.mockReturnValue(Promise.reject(new Error("boom")));
    render(<Footer />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(experiencesLink()).toBeNull();
    expect(document.querySelector('a[href="/events"]')).not.toBeNull();
  });
});
