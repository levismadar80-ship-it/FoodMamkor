/**
 * MEH-1784 — the callback-routing half of the GSI singleton assertion.
 *
 * WHY THIS IS A UNIT TEST AND NOT E2E. The e2e half
 * (e2e/flows/09-login-console-clean.spec.ts) proves a live button exists after
 * client-side navigation, against real GSI and with no mock, as
 * e2e/CLAUDE.md requires of a flow spec. What it CANNOT prove is that clicking
 * that button reaches the right handler: a click on Google's rendered button
 * hands control to Google's own auth flow, which no CI runner can complete.
 *
 * Stubbing `window.google` here is not the MEH-417 anti-pattern. MEH-417 bans
 * mocking OUR BACKEND in flow specs, because that hid real API bugs for 8 CI
 * cycles. This stubs a third-party browser SDK in order to observe OUR wiring —
 * the exact thing the fix changes — and asserts nothing about any endpoint.
 *
 * THE DISCRIMINATION THIS FILE EXISTS FOR
 *
 *   test 1 (initialize once)  fails on the CURRENT code, passes after the fix.
 *   test 2 (routes to live)   passes on the CURRENT code (last-wins already
 *                             does this) and passes after the fix — but FAILS
 *                             against a naive `if (initialized) return;` guard,
 *                             which leaves the callback pointing at the
 *                             unmounted component.
 *
 * Neither test alone can tell a correct fix from the naive one. Test 1 says
 * "initialize stopped firing twice" — true of both. Test 2 says "the live
 * component still owns the callback" — true only of the correct one. That pair
 * is the whole point, and it is why silencing the warning is not the goal.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

/**
 * Each test gets a FRESH module instance via vi.resetModules() + dynamic
 * import. This is not ceremony — the hook's singleton state lives at module
 * scope, so a static import would leak `gsiInitialized` from one test into the
 * next and the second test would observe zero initialize() calls.
 *
 * It is also the faithful model: module scope is reset by a real page load, so
 * "one fresh module per test" IS "one document per test". Getting this wrong
 * was the first thing that broke when the dispatcher landed, which is a fair
 * warning about the state's reach.
 */
async function freshHook() {
  vi.resetModules();
  return (await import("@/lib/use-google-sign-in")).useGoogleSignIn;
}

/** Records every initialize() call and exposes the callback GSI would invoke. */
function installFakeGsi() {
  const initCalls = [];
  window.google = {
    accounts: {
      id: {
        initialize: (config) => initCalls.push(config),
        cancel: () => {},
        renderButton: () => {},
      },
    },
  };
  return {
    initCalls,
    /** Fire the credential callback the way GSI would: the LAST one registered. */
    fireCredential: (response) => {
      const last = initCalls[initCalls.length - 1];
      if (!last) throw new Error("initialize() was never called");
      last.callback(response);
    },
  };
}

/** Built per test, bound to that test's freshly-imported hook. */
function makeConsumer(useGoogleSignIn) {
  return function Consumer({ onCredential }) {
    useGoogleSignIn(CLIENT_ID, onCredential, () => {});
    return null;
  };
}

describe("useGoogleSignIn — one initialize per document (MEH-1784)", () => {
  let gsi;
  let Consumer;

  beforeEach(async () => {
    gsi = installFakeGsi();
    Consumer = makeConsumer(await freshHook());
  });

  afterEach(() => {
    cleanup();
    delete window.google;
    vi.restoreAllMocks();
  });

  it("calls initialize() exactly once across two sequential mounts", () => {
    // Mount #1 — e.g. GoogleAuthButton on /register.
    const first = render(<Consumer onCredential={() => {}} />);
    first.unmount();

    // Mount #2 — the same document, after a client-side navigation to /login.
    // This is the shape the e2e spec reproduces by following an in-app link;
    // a fresh document would reset everything and prove nothing.
    render(<Consumer onCredential={() => {}} />);

    expect(
      gsi.initCalls.length,
      "google.accounts.id.initialize() must fire once per document. Two calls is " +
        "the MEH-274/MEH-1776 defect: GSI keeps only the last registration, so an " +
        "earlier button goes dead.",
    ).toBe(1);
  });

  it("routes the credential to the LIVE mount, not the unmounted one", () => {
    const deadHandler = vi.fn();
    const liveHandler = vi.fn();

    const first = render(<Consumer onCredential={deadHandler} />);
    first.unmount();
    render(<Consumer onCredential={liveHandler} />);

    gsi.fireCredential({ credential: "fake-jwt" });

    // THIS is the assertion a naive `if (initialized) return;` fails. That guard
    // makes the test above pass while leaving the registration owned by the
    // FIRST, now-unmounted component — so a user on /login would have her
    // sign-in dispatched into a dead closure. Silent, and worse than the bug.
    expect(
      liveHandler,
      "The credential must reach the currently-mounted component. If this fails " +
        "while the 'exactly once' test passes, the guard is skipping initialize() " +
        "without re-pointing the callback — a regression, not a fix (MEH-1784).",
    ).toHaveBeenCalledWith({ credential: "fake-jwt" });

    expect(
      deadHandler,
      "The unmounted component must never receive a credential.",
    ).not.toHaveBeenCalled();
  });
});
