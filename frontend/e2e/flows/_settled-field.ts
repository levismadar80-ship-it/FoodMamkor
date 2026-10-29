import type { Page, Locator } from "./_cloudinary-stub";

// MEH-2323 — a full `goto` onto a streamed page does not leave the form in ONE
// settled state: the server segment can arrive hidden while React commits a
// client-rendered copy, so for ~120 ms there are two matches (strict-mode
// violation for `fill`), and a revealed server copy can be replaced after a
// fill landed on it. A bare `toHaveCount(1)` was measured insufficient (it
// passes on the lone server copy before the second appears). The settled
// state is: exactly one copy AND React owns it — a node React created or
// hydrated carries a `__reactFiber$…` expando, the not-yet-hydrated server
// copy does not. Timing traces and the shown-failing runs: PR #3651 and the
// MEH-2323 card. Shared since MEH-2323 chunk 3: flows/30 and flows/25 fill
// the same login form. 01-home-load.spec.ts (MEH-1078) waits for the same settling
// with a count alone. `__reactFiber$` is a React internal (verified on React
// 18.3, package.json): a rename cannot pass this silently — the wait fails,
// and the thrown error names the helper and the suspect so seven timeouts do
// not have to be read back to one cause. Explicit bound per e2e/CLAUDE.md;
// `waitForFunction` is not an action, so `actionTimeout` does not cover it.
export async function settledField(page: Page, testId: string): Promise<Locator> {
  try {
    await page.waitForFunction(
      (id) => {
        const els = document.querySelectorAll(`[data-testid="${id}"]`);
        return (
          els.length === 1 &&
          Object.keys(els[0]).some((k) => k.startsWith("__reactFiber"))
        );
      },
      testId,
      { timeout: 15_000 },
    );
  } catch (err) {
    throw new Error(
      `settledField(${testId}): no single React-owned [data-testid="${testId}"] ` +
        "within 15 s — either the page kept two copies / never hydrated, or " +
        "React renamed the `__reactFiber$` expando (MEH-2323). " +
        `Cause: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return page.getByTestId(testId);
}
