/**
 * MEH-3628 — the bottom nav loads a page from the first touch.
 *
 * Every chrome link keeps prefetch={false} (MEH-2850: viewport prefetch cost
 * ~137 KB after load), so before this a tap waited for the network and showed
 * the full-page logo loader. Sapir chose (21/11) to prefetch on intent, as the
 * footer already did (MEH-3059): touchstart / pointerenter / focus call
 * router.prefetch for that tab's href — and nothing is prefetched on sight.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

const prefetch = vi.fn();

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, prefetch: _p, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>{children}</a>
  ),
  usePathname: () => "/about",
  useRouter: () => ({ prefetch, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("framer-motion", () => ({
  motion: { div: ({ initial, animate, transition, ...props }) => <div {...props} /> },
}));
vi.mock("@/lib/use-events-nav-gate", () => ({ useEventsNavGate: () => false, useEventsNavGateState: () => ({ visible: !!(false), settled: true }) }));
vi.mock("@/lib/use-experiences-nav-gate", () => ({ useExperiencesNavGate: () => false, useExperiencesNavGateState: () => ({ visible: !!(false), settled: true }) }));
vi.mock("@/lib/use-hub-nav-gate", () => ({ useHubNavGate: () => false, useHubNavGateState: () => ({ visible: !!(false), settled: true }) }));
vi.mock("@phosphor-icons/react", () => ({
  Compass: () => null, MapTrifold: () => null, Flower: () => null,
  CalendarBlank: () => null, Basket: () => null, User: () => null,
}));
vi.mock("@/components/AccountSheet", () => ({ default: () => null }));

import BottomNav from "@/components/BottomNav";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";

beforeEach(() => prefetch.mockClear());

describe("bottom nav — prefetch on intent (MEH-3628)", () => {
  it("nothing is prefetched just by rendering the nav", () => {
    render(<BottomNav />);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("a touch on a tab starts loading exactly that tab's page", () => {
    const { container } = render(<BottomNav />);
    const tab = container.querySelector('nav a[href="/map"]');
    expect(tab).not.toBeNull();
    fireEvent.touchStart(tab);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/map");
  });

  it("every link tab except the open one carries the intent prefetch", () => {
    const { container } = render(<BottomNav />);
    const tabs = [...container.querySelectorAll("nav a[href]")];
    const open = tabs.filter((a) => a.getAttribute("aria-current") === "page");
    const others = tabs.filter((a) => a.getAttribute("aria-current") !== "page");
    // /about is open and is a tab here (the nav gates are closed): both lists
    // must be non-empty for this case to say anything.
    expect(open.map((a) => a.getAttribute("href"))).toEqual(["/about"]);
    expect(others.length).toBeGreaterThan(1);
    for (const a of tabs) fireEvent.pointerEnter(a);
    expect(prefetch.mock.calls.map(([h]) => h).sort()).toEqual(others.map((a) => a.getAttribute("href")).sort());
  });
});

describe("useIntentPrefetch", () => {
  function Probe({ href }) {
    const intent = useIntentPrefetch();
    return <a data-testid="l" href={href} {...intent(href)}>x</a>;
  }

  it("touch, hover and focus prefetch the link's href once", () => {
    render(<Probe href="/events" />);
    const l = screen.getByTestId("l");
    fireEvent.touchStart(l);
    fireEvent.pointerEnter(l);
    fireEvent.focus(l);
    // Hover, touch and focus on one link ask once.
    expect(prefetch.mock.calls).toEqual([["/events"]]);
  });

  it("a prefetch that throws never breaks the tap, and the next intent retries", () => {
    prefetch.mockImplementationOnce(() => { throw new Error("offline"); });
    render(<Probe href="/events" />);
    const l = screen.getByTestId("l");
    expect(() => fireEvent.touchStart(l)).not.toThrow();
    expect(prefetch).toHaveBeenCalledTimes(1);
    fireEvent.pointerEnter(l);
    expect(prefetch).toHaveBeenCalledTimes(2);
  });
});
