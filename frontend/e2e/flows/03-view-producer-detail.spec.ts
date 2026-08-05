import { test, expect } from "@playwright/test";
import {
  pickProducer,
  detailPath,
  assertDetailRendered,
  watchPageErrors,
  REQUIREMENTS,
} from "./_producer-fixture";

// MEH-1440: this spec used to click the FIRST producer card and assert the
// contact CTA — but PrimaryContactButton self-collapses (returns null) when
// the producer has no derivable contact href (PrimaryContactButton.jsx:70),
// so the assertion silently depended on whichever producer staging happens to
// serve first.
//
// MEH-1717: that fix picked a contactable producer from the feed but still
// required ITS card to be present on the first render of /producers, and
// skipped when it was not. Two defects rode on that:
//
//   - a RACE. The card count was read immediately after `domcontentloaded`,
//     and the cards are client-rendered — measured, `cards: 0 → skip` while a
//     probe that waited 2.5s saw 12. The spec's verdict tracked scheduling.
//   - a DATA SKIP. Whether any contactable business was visible at all moved
//     with the vacation calendar (MEH-1883's nightly window) and with feed
//     ranking, so the spec skipped silently and the suite still read green.
//
// Now: the target producer is chosen by an explicit requirement and a stable
// sort (_producer-fixture.ts), the wait is an assertion with a timeout rather
// than an instantaneous count, and a missing seed FAILS by name. Skip is
// reserved for explicit env conditions — never for data.
//
// The assertions themselves are unchanged; only what the spec depends on to
// reach them is.
test.describe("Producer detail", () => {
  test("clicking a contactable producer card opens detail page with h1 and CTA", async ({ page }) => {
    const pageErrors = watchPageErrors(page);
    const producer = await pickProducer(page.request, REQUIREMENTS.contactable);
    const href = detailPath(producer);

    await page.goto("/producers");

    // MEH-1717: the cards are client-rendered, so this must be an assertion
    // with a timeout, not a count read at `domcontentloaded`. A zero here now
    // fails the spec after waiting, instead of skipping it instantly.
    const cards = page.locator('[data-testid="producer-card"]');
    await expect(
      cards,
      "no producer cards rendered on /producers — the feed or the grid is broken",
    ).not.toHaveCount(0, { timeout: 20_000 });

    // ProducerCard.jsx:173 — the card's href is `/{slug}` or `/producer/{id}`,
    // optionally followed by a `?from=` referrer suffix.
    const card = page
      .locator(
        `[data-testid="producer-card"]:has(a[href="${href}"]), [data-testid="producer-card"]:has(a[href^="${href}?"])`,
      )
      .first();
    await expect(
      card,
      `the chosen producer's card (${href}) is not on /producers. It satisfies ` +
        `"${REQUIREMENTS.contactable.label}" per the API, so either the grid dropped it or the ` +
        "listing filters disagree with the feed — both are real regressions, not reasons to skip.",
    ).toBeVisible({ timeout: 20_000 });

    // MEH-1369: click the card's inner nav anchor (real <a href>, navigates
    // natively pre-hydration), not the <article> wrapper whose click routes
    // through a React onClick that races hydration. See parity.spec.ts header.
    await card.locator('a[href^="/"]').first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/producers"), { timeout: 20_000 });

    // MEH-1550: the predicate above is permissive — a 404/redirect satisfies it
    // too — and Next's error document carries its own <h1>, so neither it nor
    // the CTA check below can tell a failed navigation from a real detail page
    // (the CTA would just fail as "missing", pointing at the wrong thing).
    // Assert the error boundary is absent first so the failure names the cause.
    // MEH-1712: this boundary also renders a deliberate notFound() on the slug
    // route, so a red here means "the detail route did not resolve", NOT
    // necessarily a crash.
    await assertDetailRendered(page, producer, href, pageErrors);
    await expect(page.locator("h1").first()).toBeVisible();
    // Either the unified PrimaryContactButton or a standalone WhatsApp button.
    // :visible filters out the md:hidden mobile CTA that appears first in DOM.
    await expect(
      page
        .locator('[data-testid="primary-contact-button"]:visible, [data-testid="whatsapp-cta"]:visible')
        .first(),
    ).toBeVisible();
  });
});
