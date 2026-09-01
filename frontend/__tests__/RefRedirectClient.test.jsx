import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import RefRedirectClient from "@/app/[locale]/ref/[code]/RefRedirectClient";

/**
 * MEH-2104 — the referral redirect, now that it is unit-testable.
 *
 * This logic used to live in `ref/[code]/page.js`, which was `"use client"`
 * and therefore the whole route. Splitting the route so `page.js` could
 * declare `robots: noindex` left the behaviour in a plain component, and the
 * adversarial reviewer on PR #3197 pointed out that made it testable for the
 * first time. This is that test.
 *
 * It guards the two things the redirect actually promises, which are
 * independent of each other:
 *   1. the referral code is persisted before leaving, and
 *   2. the navigation happens REGARDLESS — including when there is no code,
 *      and including when localStorage throws (private browsing), which the
 *      component swallows on purpose.
 *
 * The third case is the one worth having: a `catch` that swallowed the throw
 * AND skipped the redirect would strand the visitor on a blank page, and
 * nothing else in the suite would notice.
 */

const paramsRef = { current: { code: "ABC123" } };
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => paramsRef.current,
  useRouter: () => ({ replace }),
}));

/** Swap in a localStorage whose setItem behaves however the case needs. */
function stubLocalStorage(setItem) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { setItem, getItem: vi.fn(), removeItem: vi.fn() },
  });
}

describe("RefRedirectClient (MEH-2104)", () => {
  beforeEach(() => {
    replace.mockClear();
    paramsRef.current = { code: "ABC123" };
  });

  it("persists the referral code and then leaves for the home page", () => {
    const setItem = vi.fn();
    stubLocalStorage(setItem);

    render(<RefRedirectClient />);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith("referral_code", "ABC123");
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("still redirects when there is no code to persist", () => {
    const setItem = vi.fn();
    stubLocalStorage(setItem);
    paramsRef.current = {};

    render(<RefRedirectClient />);

    // Nothing to store, but the visitor must not be stranded on a null render.
    expect(setItem).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("still redirects when localStorage throws (private browsing)", () => {
    stubLocalStorage(
      vi.fn(() => {
        throw new Error("QuotaExceededError: storage is disabled");
      }),
    );

    // The component swallows the throw deliberately. What must NOT be
    // swallowed with it is the navigation — this is the case where a
    // too-wide try block would leave a blank page and no error anywhere.
    expect(() => render(<RefRedirectClient />)).not.toThrow();
    expect(replace).toHaveBeenCalledWith("/");
  });
});
