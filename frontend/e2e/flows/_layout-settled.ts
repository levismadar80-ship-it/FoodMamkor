import type { Locator } from "@playwright/test";

/**
 * Module:   _scroll-settled
 * Purpose:  Wait until a deep-linked card has stopped moving — for specs that
 *           land on `/producer/dashboard/edit#<anchor>` and then click in it.
 * Does NOT: assert anything. It is a readiness gate, not a check.
 * History:  MEH-3449 (creation).
 *
 * WHY. A `#<anchor>` on the edit page is resolved in steps, not at once
 * (app/[locale]/producer/dashboard/edit/page.js, applyHash): the card opens,
 * the page switches to the card's group (`router.replace(?group=…)`), the
 * other groups' sections collapse, the group's back link appears, and a smooth
 * `scrollIntoView` runs. The card is visible — so `toBeVisible()` passes —
 * from the first step. Measured locally on the contact-channels test, the
 * card kept moving for ~200 ms after that, in four separate layout shifts
 * (PerformanceObserver "layout-shift", e.g. #questions and #payment-info
 * collapsing 123→0 and 84→0 px), and the spec's click landed between them.
 *
 * Playwright checks the hit target on the FIRST pointer event of a click only
 * (`setupHitTargetInterceptor` in playwright-core: `result` is computed once,
 * from the first event). When a shift lands between mousedown and mouseup, the
 * mouseup hits another element, the browser fires `click` on their common
 * ancestor, the button's handler never runs — and Playwright still reports the
 * click as done. That is MEH-3449 («the PUT never left the browser») and the
 * order-window cap flake (a third range never appeared after two «add»
 * clicks): a millisecond window inside a ~200 ms settle, so rare; a retry
 * passes. On a loaded CI runner the steps spread out, which widens it.
 *
 * HOW. The element's viewport box, the scroll offset and the document height,
 * unchanged for `frames` consecutive animation frames. Ten frames (~160 ms)
 * outlasts the gap between two of the steps above.
 */
export async function layoutSettled(target: Locator, frames = 10): Promise<void> {
  await target.evaluate(
    (el, n) =>
      new Promise<void>((resolve, reject) => {
        let last = "";
        let same = 0;
        const deadline = performance.now() + 10_000;
        const tick = () => {
          const r = el.getBoundingClientRect();
          const sig = `${r.top}|${r.height}|${window.scrollY}|${document.documentElement.scrollHeight}`;
          same = sig === last ? same + 1 : 0;
          last = sig;
          if (same >= n) return resolve();
          if (performance.now() > deadline) return reject(new Error(`layout still moving after 10 s (last ${sig})`));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );
}
