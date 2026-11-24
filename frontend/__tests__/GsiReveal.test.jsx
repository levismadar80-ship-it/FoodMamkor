/**
 * MEH-3744 — Google's button is shown once, when it has settled, not while
 * Google is still drawing it (temporary copy → iframe with a blank label →
 * final label, measured on staging 23/11).
 *
 * What is real: GoogleAuthButton, useGoogleSignIn, useGsiReveal and
 * preloadGsiWhenIdle. Only the GSI script is faked: window.google is installed
 * before mount, and the fake renderButton draws what GSI draws — a temporary
 * <div> copy plus an <iframe> whose `load` the test fires.
 *
 * Shown failing: with `useGsiReveal` replaced by `true` in GoogleAuthButton,
 * the "hidden while drawing" cases are red; with the reveal moved to the first
 * child GSI adds, "the temporary copy alone does not reveal" is red; without
 * the cap timer, "shown by the cap" is red; with the cap started at mount,
 * "the cap counts from Google's first paint" is red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => `${scope}.${key}`,
}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com" },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ loginWithGoogle: vi.fn() }),
  PasskeyStepRequired: class extends Error {},
}));
let fullConsent = true;
vi.mock("@/lib/cookie-consent", () => ({ hasFullCookieConsent: () => fullConsent }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/register",
  useRouter: () => ({ push: vi.fn() }),
}));

import GoogleAuthButton from "@/components/GoogleAuthButton";
import { GSI_SETTLE_MS, GSI_REVEAL_CAP_MS } from "@/lib/use-gsi-reveal";
import { preloadGsiWhenIdle, resetGsiPreloadForTests } from "@/lib/use-google-sign-in";

let frames = [];

function installFakeGsi({ withFrame = true } = {}) {
  frames = [];
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn(),
        cancel: vi.fn(),
        renderButton: vi.fn((el) => {
          const copy = document.createElement("div");
          copy.textContent = "להמשיך עם Google";
          el.appendChild(copy);
          if (withFrame) {
            const frame = document.createElement("iframe");
            el.appendChild(frame);
            frames.push(frame);
          }
        }),
      },
    },
  };
}

const slot = (container) => container.querySelector('[data-testid="google-auth-slot"]');
const isShown = (el) => el.hasAttribute("data-gsi-ready") && el.className.includes("opacity-100") && !el.inert;

beforeEach(() => {
  vi.useFakeTimers();
  fullConsent = true;
  resetGsiPreloadForTests();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.google;
  document.querySelectorAll('script[src^="https://accounts.google.com/gsi/client"]').forEach((s) => s.remove());
  window.localStorage.clear();
});

describe("GoogleAuthButton reveal (MEH-3744)", () => {
  it("is hidden, unclickable and inert while Google is drawing", () => {
    installFakeGsi();
    const { container } = render(<GoogleAuthButton />);
    const el = slot(container);
    expect(window.google.accounts.id.renderButton).toHaveBeenCalledTimes(1);
    expect(el.className).toContain("opacity-0");
    expect(el.className).toContain("pointer-events-none");
    expect(el.inert).toBe(true);
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("the temporary copy alone does not reveal it", () => {
    installFakeGsi({ withFrame: false });
    const { container } = render(<GoogleAuthButton />);
    act(() => { vi.advanceTimersByTime(GSI_REVEAL_CAP_MS - 1); });
    expect(isShown(slot(container))).toBe(false);
  });

  it("stays hidden right after the iframe loads, shows once it has settled", () => {
    installFakeGsi();
    const { container } = render(<GoogleAuthButton />);
    act(() => { frames[0].dispatchEvent(new Event("load")); });
    act(() => { vi.advanceTimersByTime(GSI_SETTLE_MS - 1); });
    expect(isShown(slot(container))).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(isShown(slot(container))).toBe(true);
    expect(slot(container).hasAttribute("aria-hidden")).toBe(false);
  });

  it("is shown by the cap when the iframe never loads", () => {
    installFakeGsi();
    const { container } = render(<GoogleAuthButton />);
    act(() => { vi.advanceTimersByTime(GSI_REVEAL_CAP_MS); });
    expect(isShown(slot(container))).toBe(true);
  });

  it("the cap counts from Google's first paint, not from mount", async () => {
    installFakeGsi();
    const draw = window.google.accounts.id.renderButton;
    window.google.accounts.id.renderButton = vi.fn(); // script "still loading": nothing drawn yet
    const { container } = render(<GoogleAuthButton />);
    act(() => { vi.advanceTimersByTime(GSI_REVEAL_CAP_MS * 2); });
    expect(isShown(slot(container))).toBe(false);
    await act(async () => { draw(slot(container)); }); // flushes the MutationObserver
    act(() => { vi.advanceTimersByTime(GSI_REVEAL_CAP_MS - 1); });
    expect(isShown(slot(container))).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(isShown(slot(container))).toBe(true);
  });

  it("a redraw before the reveal: only the newest iframe's load counts", async () => {
    installFakeGsi();
    const { container } = render(<GoogleAuthButton />);
    act(() => { frames[0].dispatchEvent(new Event("load")); });
    await act(async () => {
      slot(container).replaceChildren();
      window.google.accounts.id.renderButton(slot(container), {});
    });
    act(() => { vi.advanceTimersByTime(GSI_SETTLE_MS); });
    expect(isShown(slot(container))).toBe(false);
    act(() => { frames[1].dispatchEvent(new Event("load")); vi.advanceTimersByTime(GSI_SETTLE_MS); });
    expect(isShown(slot(container))).toBe(true);
  });

  it("is not hidden again when a resize redraws it (MEH-3687)", () => {
    installFakeGsi();
    const { container } = render(<GoogleAuthButton />);
    act(() => { frames[0].dispatchEvent(new Event("load")); vi.advanceTimersByTime(GSI_SETTLE_MS); });
    expect(isShown(slot(container))).toBe(true);
    act(() => {
      slot(container).replaceChildren();
      window.google.accounts.id.renderButton(slot(container), {});
    });
    expect(isShown(slot(container))).toBe(true);
  });
});

describe("preloadGsiWhenIdle (MEH-3744)", () => {
  const gsiScripts = () => document.querySelectorAll('script[src^="https://accounts.google.com/gsi/client"]');
  const CLIENT = "test-client.apps.googleusercontent.com";

  it("adds the script once the browser is idle, for a guest", () => {
    preloadGsiWhenIdle(CLIENT);
    expect(gsiScripts()).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(gsiScripts()).toHaveLength(1);
  });

  it("adds no second script when one is already there", () => {
    preloadGsiWhenIdle(CLIENT);
    preloadGsiWhenIdle(CLIENT);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(gsiScripts()).toHaveLength(1);
  });

  it("adds nothing for a signed-in visitor", () => {
    window.localStorage.setItem("token", "t");
    preloadGsiWhenIdle(CLIENT);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(gsiScripts()).toHaveLength(0);
  });

  it("adds nothing without full cookie consent", () => {
    fullConsent = false;
    preloadGsiWhenIdle(CLIENT);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(gsiScripts()).toHaveLength(0);
  });

  it("removes a tag that failed to load, so the next open retries", () => {
    preloadGsiWhenIdle(CLIENT);
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => { gsiScripts()[0].dispatchEvent(new Event("error")); });
    expect(gsiScripts()).toHaveLength(0);
  });

  it("adds nothing when cancelled before it ran", () => {
    const cancel = preloadGsiWhenIdle(CLIENT);
    cancel();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(gsiScripts()).toHaveLength(0);
  });
});
