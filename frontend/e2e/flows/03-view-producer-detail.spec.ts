import { test, expect } from "@playwright/test";

// MEH-1440: this spec used to click the FIRST producer card and assert the
// contact CTA — but PrimaryContactButton self-collapses (returns null) when
// the producer has no derivable contact href (PrimaryContactButton.jsx:70),
// so the assertion silently depended on whichever producer staging happens to
// serve first. The 2026-07-21 producer_locations re-seed reordered the feed
// and the spec went red on clean staging (both projects, run 29897314926).
// Deterministic form: pick a producer that HAS contact data from the live
// /producers feed (phone covers the whatsapp/phone primary methods,
// contact_email covers email) and click ITS card. The CTA assertion stays
// strict — for a contactable producer the CTA MUST render; its absence is a
// real regression, not a data accident.
test.describe("Producer detail", () => {
  test("clicking a contactable producer card opens detail page with h1 and CTA", async ({ page }) => {
    const res = await page.request.get("/api/producers");
    expect(res.ok(), "GET /producers must respond 2xx").toBeTruthy();
    const producers = (await res.json()) as Array<{
      id: string;
      slug?: string | null;
      phone?: string | null;
      contact_email?: string | null;
    }>;
    const contactable = producers.filter((p) => p.phone || p.contact_email);
    if (contactable.length === 0) {
      test.skip(true, "No producer with contact data in the feed — staging data problem, not a UI regression");
      return;
    }

    await page.goto("/producers");
    await page.waitForLoadState("domcontentloaded");
    const cards = page.locator('[data-testid="producer-card"]');
    if ((await cards.count()) === 0) {
      test.skip(true, "No producer cards found — staging DB may be empty");
      return;
    }

    // ProducerCard.jsx:173 — card href is /{slug} or /producer/{id} (an
    // optional ?from= referrer suffix may follow). Find the first contactable
    // producer whose card is rendered on the page.
    let card = null;
    for (const p of contactable) {
      const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
      const candidate = page
        .locator(`[data-testid="producer-card"]:has(a[href="${href}"]), [data-testid="producer-card"]:has(a[href^="${href}?"])`)
        .first();
      if ((await candidate.count()) > 0) {
        card = candidate;
        break;
      }
    }
    if (!card) {
      test.skip(true, "No contactable producer's card rendered on /producers — data problem, not a UI regression");
      return;
    }

    await expect(card).toBeVisible({ timeout: 15_000 });
    // MEH-1369: click the card's inner nav anchor (real <a href>, navigates
    // natively pre-hydration), not the <article> wrapper whose click routes
    // through a React onClick that races hydration. See parity.spec.ts header.
    await card.locator('a[href^="/"]').first().click();
    // Detail pages: /producer/:id, /p/:slug, or /{slug} (top-level for slugged producers)
    await page.waitForURL(url => !url.pathname.startsWith('/producers'), { timeout: 20_000 });

    // MEH-1550: the predicate above is permissive — a 404/redirect satisfies it
    // too — and Next's error document carries its own <h1>, so neither it nor
    // the CTA check below can tell a failed navigation from a real detail page
    // (the CTA would just fail as "missing", pointing at the wrong thing).
    // Assert the error boundary is absent first so the failure names the cause.
    await expect(
      page.locator("#__next_error__"),
      "navigation failed — landed on Next's error page instead of a producer detail",
    ).toHaveCount(0);
    await expect(page.locator("h1").first()).toBeVisible();
    // Either the unified PrimaryContactButton or a standalone WhatsApp button.
    // :visible filters out the md:hidden mobile CTA that appears first in DOM.
    await expect(
      page
        .locator('[data-testid="primary-contact-button"]:visible, [data-testid="whatsapp-cta"]:visible')
        .first()
    ).toBeVisible();
  });
});
