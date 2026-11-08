import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

/**
 * MEH-2835 PR 2 — one mechanism: any element with data-chat-hide hides the
 * MOBILE chat launcher while it intersects the viewport. Hidden = faded out,
 * inert, no pointer events, and --chat-fab-clearance → 0 (so BackToTop takes
 * the launcher's slot). Desktop is unchanged.
 */

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import ChatWidget from "@/components/ChatWidget";

// A controllable IntersectionObserver: the test decides what intersects.
let observers = [];
class FakeIO {
  constructor(cb) { this.cb = cb; this.targets = new Set(); observers.push(this); }
  observe(el) { this.targets.add(el); }
  unobserve(el) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
}
const intersect = (el, isIntersecting) =>
  act(() => { for (const o of observers) if (o.targets.has(el)) o.cb([{ target: el, isIntersecting }]); });

function mockMatchMedia(desktop) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("min-width") ? desktop : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}
const clearance = () => document.documentElement.style.getPropertyValue("--chat-fab-clearance");

function renderWithPage(pageAttrs = { "data-chat-hide": "" }) {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <form data-testid="page-form" {...pageAttrs} />
      <ChatWidget />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  observers = [];
  window.IntersectionObserver = FakeIO;
  window.requestAnimationFrame = (cb) => { cb(0); return 1; };
  window.cancelAnimationFrame = () => {};
  localStorage.setItem("chatWasOpened", "true");
  document.documentElement.style.removeProperty("--chat-fab-clearance");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.removeItem("chatWasOpened");
});

describe("data-chat-hide (mobile)", () => {
  it("the launcher steps aside while a [data-chat-hide] element intersects, and returns after", () => {
    mockMatchMedia(false);
    renderWithPage();
    const launcher = screen.getByTestId("chat-launcher");
    const form = screen.getByTestId("page-form");
    expect(launcher.style.opacity).toBe("1");
    expect(clearance()).toBe("64px");

    intersect(form, true);
    expect(launcher.getAttribute("data-stepped-aside")).toBe("true");
    expect(launcher.style.opacity).toBe("0");
    expect(launcher.style.pointerEvents).toBe("none");
    expect(launcher.style.transition).toContain("150ms");
    expect(launcher.hasAttribute("inert")).toBe(true);
    expect(clearance()).toBe("");

    intersect(form, false);
    expect(launcher.hasAttribute("data-stepped-aside")).toBe(false);
    expect(launcher.style.opacity).toBe("1");
    expect(launcher.hasAttribute("inert")).toBe(false);
    expect(clearance()).toBe("64px");
  });

  it("an element that GAINS data-chat-hide later is watched (the sticky bar toggles its attribute)", async () => {
    mockMatchMedia(false);
    renderWithPage({});
    const form = screen.getByTestId("page-form");
    expect(observers.some((o) => o.targets.has(form))).toBe(false);
    await act(async () => {
      form.setAttribute("data-chat-hide", "");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(observers.some((o) => o.targets.has(form))).toBe(true);
    intersect(form, true);
    expect(screen.getByTestId("chat-launcher").getAttribute("data-stepped-aside")).toBe("true");
    // …and losing the attribute releases it.
    await act(async () => {
      form.removeAttribute("data-chat-hide");
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByTestId("chat-launcher").hasAttribute("data-stepped-aside")).toBe(false);
  });

  it("an open panel stays open — stepping aside applies to the closed launcher only", () => {
    mockMatchMedia(false);
    renderWithPage();
    fireEvent.click(screen.getByTestId("chat-launcher"));
    intersect(screen.getByTestId("page-form"), true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("chat-launcher").hasAttribute("data-stepped-aside")).toBe(false);
  });
});

describe("desktop is unchanged", () => {
  it("no observer, no fade, even with a [data-chat-hide] element on screen", () => {
    mockMatchMedia(true);
    renderWithPage();
    expect(observers).toHaveLength(0);
    const launcher = screen.getByTestId("chat-launcher");
    expect(launcher.style.opacity).toBe("");
    expect(launcher.hasAttribute("data-stepped-aside")).toBe(false);
  });
});

describe("the marked places (attribute only)", () => {
  // Read from source: these are attribute-only edits on large components whose
  // own suites cover their rendering.
  const fs = require("node:fs");
  const path = require("node:path");
  const src = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  it.each([
    ["the /map mobile shell", "app/[locale]/map/MapClient.jsx", /data-testid="map-mobile-shell" data-chat-hide=""/],
    ["the /settings profile form", "app/[locale]/settings/page.jsx", /<form onSubmit=\{handleSubmit\} data-chat-hide=""/],
    ["the /contact form", "app/[locale]/contact/ContactClient.jsx", /<form onSubmit=\{handleSubmit\} data-chat-hide=""/],
    ["the /recommend form", "app/[locale]/recommend/RecommendClient.jsx", /data-testid="recommend-form" data-chat-hide=""/],
    ["the /about #contact section", "app/[locale]/about/AboutClient.jsx", /id="contact" data-chat-hide=""/],
    ["the business page sticky bar, only while shown", "app/[locale]/producer/[id]/components/StickyContactBar.jsx", /data-chat-hide=\{isBarVisible \? "" : undefined\}/],
  ])("%s carries data-chat-hide", (_, file, re) => {
    expect(src(file)).toMatch(re);
  });
});
