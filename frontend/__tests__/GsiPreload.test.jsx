/**
 * MEH-3744 — the GSI script is loaded ahead of need, when the browser is idle,
 * so a sign-in modal opened later has Google's library ready at once.
 *
 * What is real: preloadGsiWhenIdle. Nothing of Google is faked: the test only
 * counts the <script> tags it adds.
 *
 * MEH-3690 removed this file's other half (the reveal of Google's rendered
 * button): our own button is drawn by us, so there is nothing to reveal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "@testing-library/react";

let fullConsent = true;
vi.mock("@/lib/cookie-consent", () => ({ hasFullCookieConsent: () => fullConsent }));

import { preloadGsiWhenIdle, resetGsiPreloadForTests } from "@/lib/use-google-sign-in";

beforeEach(() => {
  vi.useFakeTimers();
  fullConsent = true;
  resetGsiPreloadForTests();
});
afterEach(() => {
  vi.useRealTimers();
  delete window.google;
  document.querySelectorAll('script[src^="https://accounts.google.com/gsi/client"]').forEach((s) => s.remove());
  window.localStorage.clear();
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
