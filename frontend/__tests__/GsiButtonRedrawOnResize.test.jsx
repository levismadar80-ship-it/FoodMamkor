/**
 * MEH-3687 — Google's button is drawn again, at the new width, when the screen
 * gets narrower.
 *
 * Staging went red on e2e/flows/43-site-sanity.spec.ts (/register/producer at
 * 320): the page loads at 390, the button is drawn 361px wide, the viewport
 * shrinks to 320 and the button stays 361px. renderButton() takes a fixed
 * pixel width, so nothing redraws it.
 *
 * What is real here: GoogleAuthButton, ProducerOAuthButtons, the GSI hook
 * (lib/use-google-sign-in.js) and the redraw hook. Only the GSI script itself
 * is replaced: window.google is installed before mount, so the hook takes its
 * "script already loaded" branch and calls renderButton synchronously. The fake
 * renderButton appends a child sized to the width it was given — what GSI does.
 *
 * jsdom has no layout, so the slot's offsetWidth is defined per test. It
 * reports the CHILD's width while a child is inside (the real flex case, where
 * the old button holds the slot open) and the layout width once empty — so a
 * redraw that measured without emptying the slot first stays at 361 and fails.
 *
 * Shown failing: with the useGsiRedrawOnResize calls removed from both buttons,
 * the "redraws at 288" cases are red (renderButton called once, width 361).
 * Without the rAF coalescing the burst draws [361, 288, 288]; without the
 * cleanup's removeEventListener the unmount case is red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => `${scope}.${key}`,
}));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    NEXT_PUBLIC_APPLE_CLIENT_ID: "",
    NEXT_PUBLIC_APPLE_REDIRECT_URI: "",
  },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ loginWithGoogle: vi.fn() }),
  PasskeyStepRequired: class extends Error {},
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/register",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const WIDE = 361;
const NARROW = 288;
let layoutWidth = WIDE;
let draws = [];
let drawsAChild = true;

function installFakeGsi() {
  draws = [];
  drawsAChild = true;
  window.google = {
    accounts: {
      id: {
        initialize: () => {},
        cancel: () => {},
        renderButton: (el, opts) => {
          draws.push(opts.width);
          if (!drawsAChild) return;
          const child = document.createElement("div");
          child.dataset.width = String(opts.width);
          el.replaceChildren(child);
        },
      },
    },
  };
}

// The slot's width: the drawn child's while one is inside, else the layout's.
function patchOffsetWidth() {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      const child = this.firstElementChild;
      if (child?.dataset?.width) return Number(child.dataset.width);
      return layoutWidth;
    },
  });
}

// The hook redraws on the next animation frame; this waits one frame past it.
const nextFrame = () => act(() => new Promise((r) => window.requestAnimationFrame(() => r())));

// 390 → 350 → 320 inside one frame, as a drag or setViewportSize can fire.
async function shrinkScreen() {
  layoutWidth = NARROW;
  act(() => {
    for (const w of [350, 320]) {
      window.innerWidth = w;
      window.dispatchEvent(new Event("resize"));
    }
  });
  await nextFrame();
}

async function freshButtons() {
  vi.resetModules();
  const GoogleAuthButton = (await import("@/components/GoogleAuthButton")).default;
  const ProducerOAuthButtons = (await import("@/components/ProducerOAuthButtons")).default;
  return { GoogleAuthButton, ProducerOAuthButtons };
}

const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

beforeEach(() => {
  layoutWidth = WIDE;
  window.innerWidth = 390;
  installFakeGsi();
  patchOffsetWidth();
});

afterEach(() => {
  cleanup();
  delete window.google;
  if (originalOffsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
});

describe("MEH-3687 — Google button follows the screen width", () => {
  for (const name of ["GoogleAuthButton", "ProducerOAuthButtons"]) {
    it(`${name}: drawn at 361, redraws at 288 when the screen narrows`, async () => {
      const Buttons = await freshButtons();
      const Button = Buttons[name];
      render(<Button />);
      expect(draws).toEqual([WIDE]);

      await shrinkScreen();
      // One redraw for the burst, at the new layout width.
      expect(draws).toEqual([WIDE, NARROW]);
    });

    it(`${name}: a height-only resize does not redraw`, async () => {
      const Buttons = await freshButtons();
      const Button = Buttons[name];
      render(<Button />);
      act(() => {
        window.innerHeight = 500;
        window.dispatchEvent(new Event("resize"));
      });
      await nextFrame();
      expect(draws).toEqual([WIDE]);
    });
  }

  it("no redraw before the first draw (GSI not loaded yet)", async () => {
    delete window.google;
    const { GoogleAuthButton } = await freshButtons();
    render(<GoogleAuthButton />);
    await shrinkScreen();
    expect(draws).toEqual([]);
  });

  it("no redraw while GSI is loaded but the slot holds no button", async () => {
    drawsAChild = false;
    const { GoogleAuthButton } = await freshButtons();
    render(<GoogleAuthButton />);
    expect(draws).toEqual([WIDE]);
    await shrinkScreen();
    expect(draws).toEqual([WIDE]);
  });

  it("unmount removes the resize listener it added", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { GoogleAuthButton } = await freshButtons();
    const { unmount } = render(<GoogleAuthButton />);
    const added = add.mock.calls.filter(([type]) => type === "resize").map(([, fn]) => fn);
    expect(added.length).toBeGreaterThan(0);
    unmount();
    const removed = remove.mock.calls.filter(([type]) => type === "resize").map(([, fn]) => fn);
    for (const fn of added) expect(removed).toContain(fn);
    add.mockRestore();
    remove.mockRestore();
    await shrinkScreen();
    expect(draws).toEqual([WIDE]);
  });
});
