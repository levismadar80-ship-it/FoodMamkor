import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

/**
 * MEH-2835 PR 1 — the mobile chat launcher stays put (Sapir 31/10) but never
 * hides content: while it is on screen it publishes --chat-fab-clearance on
 * <html>, --bottom-inset adds it (so a page's last line ends above it), the
 * launcher wears a cream ring (it reads on green), and BackToTop takes the
 * launcher's slot when the launcher is away.
 */

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>,
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import ChatWidget from "@/components/ChatWidget";
import BackToTop from "@/components/BackToTop";

const VAR = "--chat-fab-clearance";
const root = () => document.documentElement.style.getPropertyValue(VAR);

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
const withIntl = (ui) => (
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    {ui}
  </NextIntlClientProvider>
);

beforeEach(() => {
  localStorage.setItem("chatWasOpened", "true");
  document.documentElement.style.removeProperty(VAR);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.removeItem("chatWasOpened");
});

describe("ChatWidget publishes --chat-fab-clearance", () => {
  it("mobile, launcher shown → 64px (48px circle + 16px gap); removed on unmount", () => {
    mockMatchMedia(false);
    const { unmount } = render(withIntl(<ChatWidget />));
    expect(screen.getByTestId("chat-launcher")).toBeInTheDocument();
    expect(root()).toBe("64px");
    unmount();
    expect(root()).toBe("");
  });

  it("panel open → 0 (removed); closed again → back to 64px", () => {
    mockMatchMedia(false);
    render(withIntl(<ChatWidget />));
    fireEvent.click(screen.getByTestId("chat-launcher"));
    expect(root()).toBe("");
    fireEvent.click(screen.getByTestId("chat-launcher"));
    expect(root()).toBe("64px");
  });

  it("desktop → never published", () => {
    mockMatchMedia(true);
    render(withIntl(<ChatWidget />));
    expect(screen.getByTestId("chat-launcher")).toBeInTheDocument();
    expect(root()).toBe("");
  });

  it("a page that keeps the launcher off phones (hideOnMobile) → not published", () => {
    mockMatchMedia(false);
    render(withIntl(<ChatWidget hideOnMobile />));
    expect(screen.queryByTestId("chat-launcher")).toBeNull();
    expect(root()).toBe("");
  });

  it("the launcher wears a 2px cream ring, so it reads on green surfaces", () => {
    mockMatchMedia(false);
    render(withIntl(<ChatWidget />));
    const cls = screen.getByTestId("chat-launcher").className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["ring-2", "ring-background"]));
  });
});

describe("--bottom-inset carries the launcher's room (globals.css)", () => {
  it("the mobile --bottom-inset adds var(--chat-fab-clearance, 0px); the md override stays the cookie banner only", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
    const decls = [...css.matchAll(/--bottom-inset:\s*([^;]+);/g)].map((m) => m[1]);
    expect(decls).toHaveLength(2);
    expect(decls[0]).toContain("var(--chat-fab-clearance, 0px)");
    expect(decls[1].trim()).toBe("var(--cookie-banner-h, 0px)");
    // The footer still owns the reserve (MEH-2824) — so the extra room is
    // inside the green footer, not a cream strip under it.
    expect(css).toMatch(/footer\[data-site-footer\]\s*\{\s*padding-bottom:\s*var\(--bottom-inset\)/);
  });
});

describe("BackToTop takes the launcher's slot when the launcher is away", () => {
  it("mobile bottom = the launcher's own bottom + max(clearance − 4px, 0) → +60 only while the launcher is shown", () => {
    mockMatchMedia(false);
    window.requestAnimationFrame = (cb) => { cb(); return 0; };
    window.innerHeight = 667;
    window.scrollY = 5000;
    render(withIntl(<BackToTop />));
    act(() => { window.dispatchEvent(new Event("scroll")); });
    const bottom = screen.getByTestId("back-to-top").style.bottom;
    expect(bottom).toContain("max(var(--chat-fab-clearance, 0px) - 4px, 0px)");
    expect(bottom).not.toMatch(/\+ 60px\)/);
  });
});
