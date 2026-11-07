import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import he from "../messages/he.json";
import JoinStickyBar from "@/components/join/JoinStickyBar";

/**
 * MEH-2799 — the /join sticky «מצטרפים» bar. The rule it exists for: never two
 * «מצטרפים» on screen at once. The hero CTA owns the top, the closing band owns
 * the bottom, the bar owns only the stretch between them.
 *
 * The observer is driven by hand, so each case is a scroll position stated as
 * the two IntersectionObserver entries the browser would deliver there.
 * Inert handling mirrors StickyContactBarInert.test.jsx (MEH-1333).
 */

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));

let observers = [];
class FakeIO {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = [];
    observers.push(this);
  }
  observe(el) {
    this.targets.push(el);
  }
  disconnect() {
    this.targets = [];
  }
}
const observerOf = (selector) => observers.find((io) => io.targets.some((t) => t.matches(selector)));
function fire(selector, { isIntersecting, top }) {
  const io = observerOf(selector);
  act(() => io.callback([{ isIntersecting, boundingClientRect: { top } }]));
}
const heroInView = () => fire("[data-join-hero-cta]", { isIntersecting: true, top: 300 });
const heroPassed = () => fire("[data-join-hero-cta]", { isIntersecting: false, top: -200 });
const closingFar = () => fire("[data-join-closing]", { isIntersecting: false, top: 2400 });
const closingNear = () => fire("[data-join-closing]", { isIntersecting: true, top: 880 });
const closingPassed = () => fire("[data-join-closing]", { isIntersecting: false, top: -900 });

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <span data-join-hero-cta>hero</span>
      <section data-join-closing>closing</section>
      <JoinStickyBar />
    </NextIntlClientProvider>,
  );
}
const bar = () => screen.getByTestId("join-sticky-bar");
const isShown = () => bar().dataset.visible === "true";

describe("visibility", () => {
  it("hidden on load (the hero CTA is on screen) — and inert, not just transparent", () => {
    renderPage();
    heroInView();
    closingFar();
    expect(isShown()).toBe(false);
    expect(bar().hasAttribute("inert")).toBe(true);
    expect(bar().className).toContain("invisible");
  });

  it("shown once the hero CTA has scrolled above the viewport", () => {
    renderPage();
    heroPassed();
    closingFar();
    expect(isShown()).toBe(true);
    expect(bar().hasAttribute("inert")).toBe(false);
    expect(bar().className).toContain("visible");
    expect(bar().className).not.toContain("invisible");
  });

  it("hidden again before the closing band arrives (its own CTA takes over)", () => {
    renderPage();
    heroPassed();
    closingNear();
    expect(isShown()).toBe(false);
    expect(bar().hasAttribute("inert")).toBe(true);
  });

  it("stays hidden past the band, over the footer", () => {
    renderPage();
    heroPassed();
    closingPassed();
    expect(isShown()).toBe(false);
  });

  it("scrolling back to the top hides it again", () => {
    renderPage();
    heroPassed();
    closingFar();
    expect(isShown()).toBe(true);
    heroInView();
    expect(isShown()).toBe(false);
  });

  it("reads the LAST observer entry: a queued [passed, back-in-view] pair means hidden", () => {
    renderPage();
    closingFar();
    const io = observerOf("[data-join-hero-cta]");
    act(() =>
      io.callback([
        { isIntersecting: false, boundingClientRect: { top: -200 } },
        { isIntersecting: true, boundingClientRect: { top: 300 } },
      ]),
    );
    expect(isShown()).toBe(false);
  });

  it("the band observer looks 90px ahead, so the bar is gone before the band is in view", () => {
    renderPage();
    expect(observerOf("[data-join-closing]").options.rootMargin).toBe("0px 0px 90px 0px");
    expect(observerOf("[data-join-hero-cta]").options.threshold).toBe(0);
  });
});

describe("content", () => {
  it("the meta line and one «מצטרפים» to the same target as the hero", () => {
    renderPage();
    heroPassed();
    closingFar();
    expect(bar().textContent).toContain(he.join.meta_line);
    const cta = screen.getByTestId("join-sticky-cta");
    expect(cta.textContent).toBe(he.join.cta);
    expect(cta.getAttribute("href")).toMatch(/\/register\/producer$/);
  });

  it("rides above the BottomNav pill on phones and is flush from md (pill hidden)", () => {
    renderPage();
    expect(bar().className).toContain("bottom-[var(--bottom-nav-clearance,");
    expect(bar().className).toContain("md:bottom-0");
    // No blur / glass (BRAND §3) and a bare z class, not a new arbitrary token.
    expect(bar().className).not.toMatch(/backdrop-blur/);
    expect(bar().className).not.toMatch(/z-\[/);
  });

  it("degrades to hidden where IntersectionObserver is missing", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    renderPage();
    expect(isShown()).toBe(false);
  });
});
