/**
 * MEH-2927 (pilot B3b) — the install prompt stays off the registration flow.
 *
 * It is `position: fixed` and 126px tall at the iPhone visual viewport, and it
 * arms a 30s timer on a 2nd+ visit. On the DETAILS step a sweep of the whole
 * scroll range in 50px steps found 16 (scroll position × control) hits, worst
 * 48px, including «הבא» — so it covers the form a seller is in the middle of
 * filling. Sapir's call (11/11): same route exclusion as the BottomNav.
 *
 * Measuring it on ONE scroll position is how it reads as harmless — the
 * ACCOUNT step's four controls all sit above the band. That is why the gate is
 * by route and not by overlap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import InstallPrompt from "@/components/InstallPrompt";

const pathnameRef = { current: "/" };
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

vi.mock("next-intl", () => {
  // The component calls both `t(key)` and `t.rich(key, {...})`, so the stub
  // needs the second form too — a bare key-echo throws before the assertion
  // this file is about ever runs.
  const t = (key) => key;
  t.rich = (key) => key;
  return { useTranslations: () => t };
});

// The iOS arm needs no `beforeinstallprompt`: it shows on a timer, which makes
// it the arm a jsdom test can drive end to end.
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const prompt = () => screen.queryByRole("dialog");

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  // 2nd+ visit: the component increments and requires >= 2.
  localStorage.setItem("pwa_visits", "5");
  Object.defineProperty(navigator, "userAgent", { value: IPHONE_UA, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const renderAndWaitOutTheTimer = () => {
  render(<InstallPrompt />);
  act(() => {
    vi.advanceTimersByTime(31000);
  });
};

describe("MEH-2927 · the install prompt is gated off /register", () => {
  it.each(["/register", "/register/producer", "/register/organizer"])(
    "never appears on %s",
    (path) => {
      pathnameRef.current = path;
      renderAndWaitOutTheTimer();
      expect(prompt()).toBeNull();
    },
  );

  // Controls. Without these the cases above pass against a component that
  // never shows the prompt anywhere — which is most of what could go wrong
  // when adding a gate to a thing that is already conditional.
  it.each(["/", "/map", "/registerx/foo"])("still appears on %s", (path) => {
    pathnameRef.current = path;
    renderAndWaitOutTheTimer();
    expect(prompt()).not.toBeNull();
  });

  it("control — on a consumer route it is the timer that reveals it, not the render", () => {
    pathnameRef.current = "/";
    render(<InstallPrompt />);
    expect(prompt(), "nothing before the 30s timer").toBeNull();
    act(() => {
      vi.advanceTimersByTime(31000);
    });
    expect(prompt(), "and something after it").not.toBeNull();
  });
});
