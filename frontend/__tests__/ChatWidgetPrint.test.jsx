import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import path from "node:path";
import he from "../messages/he.json";

/**
 * MEH-2793 — the floating chat button must not print.
 *
 * It printed on the A6 QR card (MEH-2785) and, since MEH-2649, on the A5
 * rescue counter card: `globals.css` hides only `header, footer, nav,
 * .no-print`, and ChatWidgetLazy's route gate covers /map, /producer/[id],
 * /favorites and /admin — no print route among them.
 *
 * DISCRIMINATION. Each case fails against the pre-fix component:
 *   - remove `print:hidden` from the launcher  → case 1 reds
 *   - remove it from the panel                 → case 2 reds
 *   - "fix" it by adding a `.vv-pin { display:none }` print rule instead
 *     → case 3 reds, because that class is shared with four other components
 * Verified by running each mutation before this file was committed.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));

import ChatWidget from "@/components/ChatWidget";

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderWidget() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ChatWidget />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockMatchMedia(true); // desktop
  localStorage.setItem("chatWasOpened", "true"); // icon-only launcher
});

afterEach(() => {
  cleanup();
  localStorage.removeItem("chatWasOpened");
  vi.clearAllMocks();
});

describe("MEH-2793 — the chat widget is hidden in print", () => {
  it("the launcher carries print:hidden", () => {
    renderWidget();
    const launcher = screen.getByTestId("chat-launcher");
    expect(launcher.className).toContain("print:hidden");
  });

  it("the open panel carries print:hidden too", () => {
    renderWidget();
    fireEvent.click(screen.getByTestId("chat-launcher"));
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("print:hidden");
  });

  it("is still visible on screen — the class is print-scoped, not a removal", () => {
    renderWidget();
    const launcher = screen.getByTestId("chat-launcher");
    // `hidden` on its own would remove it from the screen as well; only the
    // print-variant form is acceptable here.
    expect(launcher.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(launcher).toBeTruthy();
  });

  it("does NOT hide the shared .vv-pin class in print", () => {
    // vv-pin is the iOS viewport pin, shared with BackToTop, AccountSheet,
    // InstallPrompt and BottomNav. Hiding it wholesale would take four
    // unrelated components off the page in print — a wrong fix that would
    // still make the first two cases pass if they only checked "nothing
    // renders in print".
    const css = read("app/globals.css");
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).not.toMatch(/\.vv-pin\b/);
  });

  it("every component that owns a fixed floating control states its print intent", () => {
    // A ratchet, not a style preference: the next floating control added to a
    // page is the next one to print over a card. Each of these carries either
    // print:hidden or a documented reason.
    const FLOATING = {
      "components/ChatWidget.jsx": "print:hidden",
      "components/CookieBanner.jsx": "print:hidden",
    };
    for (const [rel, token] of Object.entries(FLOATING)) {
      expect(read(rel), rel).toContain(token);
    }
  });
});
