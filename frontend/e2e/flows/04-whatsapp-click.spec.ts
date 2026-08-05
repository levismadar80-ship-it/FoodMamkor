import { test, expect } from "@playwright/test";
import { pickProducer, detailPath, openDetail, watchPageErrors, REQUIREMENTS } from "./_producer-fixture";

/**
 * MEH-1426 attribution chain: the producer-detail primary CTA fires
 * pingWhatsAppBeacon + markWhatsAppClickedLocal — but ONLY for a producer
 * whose primary contact method is WhatsApp.
 *
 * MEH-1717 — this spec used to open "the first card" and then skip, mid-test,
 * when that producer's CTA turned out to be phone or email. Its assertion
 * therefore ran only on the nights the feed happened to order a WhatsApp
 * business first, and reported green the rest of the time. That is not a
 * flaky test; it is a test whose subject was chosen by the vacation calendar.
 *
 * Now the WhatsApp-method producer is SELECTED by that requirement up front,
 * so the beacon assertion always runs — and if the seed contains no such
 * producer the spec fails by name instead of skipping.
 *
 * Navigating straight to the detail URL is deliberate: this spec's subject is
 * the beacon, not the card grid. Card-click coverage lives in 03, and routing
 * the beacon check through the listing only re-imported that spec's feed
 * dependency. The assertion itself is unchanged.
 */
test.describe("WhatsApp analytics", () => {
  test("clicking WhatsApp CTA fires analytics beacon", async ({ page }) => {
    // Use page.route() — more reliable than page.on('request') for sendBeacon
    let beaconFired = false;
    await page.route("**/whatsapp-click", (route) => {
      beaconFired = true;
      route.continue();
    });

    const pageErrors = watchPageErrors(page);
    const producer = await pickProducer(page.request, REQUIREMENTS.whatsappPrimary);
    // MEH-1550 / MEH-1712: Next's error document has its own <h1>, and the slug
    // route renders this boundary for a deliberate notFound() too — so assert
    // it is absent first, or a routing failure masquerades as "CTA missing".
    await openDetail(page, producer, pageErrors);

    // Block WhatsApp navigation so the test page stays active
    await page.route("https://wa.me/**", (route) => route.abort());

    // MEH-1467: the standalone WhatsAppButton (data-testid="whatsapp-cta") was
    // removed as orphaned; the producer-detail primary CTA is now
    // PrimaryContactButton (data-testid="primary-contact-button").
    //
    // `:visible` is load-bearing, and this run proved it: the detail page mounts
    // the CTA TWICE — once in the md:hidden mobile bar, which comes first in the
    // DOM, and once in the ContactCard. On desktop a bare `.first()` therefore
    // resolves the hidden copy and `toBeVisible` fails against a page that is
    // perfectly healthy ("42 × locator resolved to <a data-method='whatsapp' …>
    // — unexpected value 'hidden'", run 30884339971). Spec 03 already filters
    // this way for the same reason; the old form of THIS spec never noticed,
    // because it skipped before reaching the CTA on every desktop run.
    const primaryCta = page.locator('[data-testid="primary-contact-button"]:visible').first();
    await expect(
      primaryCta,
      `no primary contact CTA on ${detailPath(producer)}, whose primary_contact_method is ` +
        '"whatsapp" per the API. PrimaryContactButton self-collapses when it cannot derive an ' +
        "href (PrimaryContactButton.jsx:70), so this is a real regression.",
    ).toBeVisible({ timeout: 20_000 });

    // Selected on this exact property, so a mismatch is a contract disagreement
    // between the list feed and the rendered CTA — assert it rather than skip.
    await expect(
      primaryCta,
      "the API says this producer's primary contact method is whatsapp but the CTA disagrees",
    ).toHaveAttribute("data-method", "whatsapp");

    await primaryCta.click();
    await page.waitForTimeout(500);

    expect(beaconFired, "whatsapp-click beacon did not fire").toBe(true);
  });
});
