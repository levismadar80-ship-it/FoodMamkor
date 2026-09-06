import { test, expect, type Page } from "../_cloudinary-stub";

/**
 * Spec:     manual/dashboard-edit — MEH-1249 chunk 11b of 12
 * Purpose:  Convert the CONVERT-verdict rows of five MANUAL_TESTING sections
 *           covering the /producer/dashboard/edit ACCORDION SHELL:
 *             MT:MEH-1116        accordion + URL anchors
 *             MT:MEH-1158        content previews in the collapsed headers
 *             MT:MEH-2138-C      the חובה/רשות chip on every card
 *             MT:MEH-1163        the bio textarea is always visible
 *             MT:MEH-1157        401 → /login, and bio errors by reason
 * Touches:  NO backend. FIVE reads are route-fulfilled, and the count is
 *           measured rather than read off the page: `GET /producers/me`
 *           (page.js:414) is the only fetch the PAGE makes, but the child
 *           cards add `/producers/me/{products,locations,name-change-requests,
 *           kashrut-requests}`. An earlier version of this header claimed
 *           "exactly one endpoint" from page.js alone — with the four unstubbed
 *           they proxied to the real backend, 401'd, and bounced the tab to
 *           /login mid-test. Found by logging every request, not by reading.
 *           Plus /auth/me for the session; the token is seeded via
 *           addInitScript, so this runs on the DEFAULT CI E2E target and needs
 *           no DEMO_* fixture and no storageState. Same shape as chunk 11a and
 *           as flows/34-draft-submit-review.
 * Does NOT: save anything. Every row whose expected outcome is "…ורענון —
 *           הביו נשמר" needs a real write, and CI's authenticated specs point
 *           at the RAILWAY STAGING backend (.github/workflows/e2e.yml:229-233),
 *           so such an assertion would be a destructive write against shared
 *           staging — forbidden by Sapir's 13/07 ruling. Those rows are
 *           reported, not converted. Also does NOT cover the completeness card
 *           (MEH-288 / MEH-1106), the unsaved-changes guard (MEH-1100), the
 *           "מה זה?" explainers (MEH-1115) or the description card (MEH-1173):
 *           those are chunk 11c, together with the structured editors.
 * Related:  app/[locale]/producer/dashboard/edit/page.js ·
 *           components/EditAccordionCard.jsx · manual/dashboard-shell.spec.ts
 *           (chunk 11a, the tabs and read-only surfaces).
 * History:  MEH-1249 chunk 11b.
 *
 * ─── The MEH-1968 three conditions, stated because the rule requires it ────
 *
 *   1. No backend BEHAVIOUR is asserted. Every test asks what the client
 *      renders for a given payload — which preview shape, which chip, which
 *      card is open, which error string — never whether the server computed
 *      the payload correctly.
 *   2. `GET /producers/me` has a Pydantic response model, and chunk 11a plus
 *      flows/34 already intercept this exact endpoint.
 *   3. The unmocked alternative burns a shared resource, and worse than the
 *      rate-limiter case the rule cites: reaching "a business with 5 images
 *      and 4 categories" and then "the same business with none" means MUTATING
 *      shared staging, twice, per test.
 *
 * ─── Phase 0 correction: the accordion was NOT replaced ────────────────────
 *
 * MEH-1408 is easy to read as having replaced the flat accordion these two
 * sections describe. It did not: it added a hub-and-spoke layer OVER it, and
 * `edit/page.js:187-189` states the card keys and the anchor contract are
 * UNCHANGED. Verified in the resolver rather than taken from that comment —
 * `page.js:474-499` maps `#<anchor>` → key → group, calls
 * `setOpenKey(OPEN_KEY_FOR(key))`, and re-runs on `hashchange`. So a deep link
 * still lands on its card, now through its group, and that is what the tests
 * below navigate with.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 *
 * D1 · MT:MEH-1158:4 describes a LOCATION header preview — "אייקון סיכת מפה +
 *      שם היישוב". There is no such preview. The `previews` map (page.js:583)
 *      has exactly eight keys — images, categories, bio, products, contact,
 *      pricing, license, questions — and `location` is not among them;
 *      `MapPin` survives only in the comment at `page.js:50` recording that
 *      MEH-2058 deleted it. Measured by enumerating the map's keys, not by
 *      trusting that comment. The row is STALE and left for the deletion pass.
 * D2 · The same section lists SIX previews and the code renders EIGHT. It
 *      names no preview for `pricing`, `license` or `questions`. Under-listing
 *      is not a wrong claim, so nothing is corrected — but the count assertion
 *      below is written against the measured set, so a future removal reds.
 * D3 · MT:MEH-1158:1 expects the overflow chip to read «2+». It renders «+2»:
 *      `PreviewOverflowChip` sets `dir="ltr"` precisely so the plus leads in an
 *      RTL context, and its comment says so in those words. The doc has the
 *      sign on the wrong side. Asserted as rendered.
 * D4 · MT:MEH-1116:1 lists the cards as "ביו / שאלות / ערוצי קשר / קטגוריות /
 *      תמונות / מיקום / מוצרים" — a flat list of seven, which is the pre-hub
 *      shape. Today they are distributed across four groups and only one
 *      group's cards are in the DOM at a time. What survives of the row is
 *      "closed on load, each header carries a one-line summary", which is what
 *      is asserted; the enumeration itself is not convertible as written.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = (n: number) => `https://res.cloudinary.com/demo/image/upload/p${n}.jpg`;

/** A business filled enough that every preview has content. */
const FILLED = {
  id: 7,
  name: "מאפיית שקד",
  status: "approved",
  city: "חיפה",
  phone: "050-1234567",
  primary_contact_method: "whatsapp",
  whatsapp: "050-1234567",
  has_physical_location: true,
  offers_delivery: false,
  delivery_areas: [],
  // five images and four categories are what MT:MEH-1158:1-2 specify, and the
  // cap is 3 + overflow — so these two numbers are the ones that make the
  // "+2" and "+1" assertions mean anything.
  images: [1, 2, 3, 4, 5].map((n) => ({ id: n, url: IMG(n) })),
  categories: [
    { id: 1, name: "לחמים ואפייה" },
    { id: 2, name: "גבינות" },
    { id: 3, name: "ריבות" },
    { id: 4, name: "שמנים" },
  ],
  products: [{ id: 1, name: "חלה מתוקה" }],
  short_description: "מאפייה שכונתית קטנה\nשורה שנייה שאסור שתופיע בכותרת",
  description: "מאפייה שכונתית קטנה\nשורה שנייה שאסור שתופיע בכותרת",
  locations: [
    { id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" },
  ],
};

/** The same business with every previewable field emptied. */
const EMPTY = {
  ...FILLED,
  images: [],
  categories: [],
  products: [],
  short_description: null,
  description: null,
  phone: null,
  whatsapp: null,
  primary_contact_method: null,
};

type Opts = {
  profile?: Record<string, unknown> | null;
  profileStatus?: number;
  role?: string;
};

async function stubEdit(page: Page, opts: Opts = {}): Promise<void> {
  const { profile = FILLED, profileStatus = 200, role = "producer" } = opts;
  await page.addInitScript(() => {
    localStorage.setItem("token", "e2e-token");
  });
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 42, email: "owner@example.com", name: "שקד", role, producer_id: 7 }),
    }),
  );
  await page.route("**/favorites**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  // The child cards' reads. `**/producers/me` is anchored at both ends and so
  // does NOT match these — they need their own handlers or they fall through to
  // the real backend and 401.
  for (const sub of ["products", "locations", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
  }
  await page.route("**/producers/me", (route) =>
    route.fulfill({
      status: profileStatus,
      contentType: "application/json",
      body: JSON.stringify(profileStatus === 200 ? profile : { detail: "unauthorized" }),
    }),
  );
}

const hub = (page: Page) => page.getByTestId("edit-hub");
/** The card's header BUTTON — carries the chip, the summary and the preview. */
const card = (page: Page, anchor: string) => page.getByTestId(`accordion-${anchor}`);
/** The card's BODY — `<div role="region">` inside `<section id={anchorId}>`.
 *  The header button holds no form controls, so anything editable is here. */
const cardBody = (page: Page, anchor: string) => page.locator(`#${anchor} [role="region"]`);

/**
 * Opens the edit tab at a card's deep link and waits for THAT card to be
 * VISIBLE — not merely attached.
 *
 * Measured: all FOURTEEN accordion cards are in the DOM at every moment. The
 * group panels are `hidden` toggles, not unmounts (`page.js:818`), so
 * `toBeAttached` on any card passes even when its group was never selected —
 * it cannot tell "the deep link resolved" from "it did nothing", which is
 * exactly what a control has to distinguish. Visibility is the question here,
 * and it is the opposite call from chunk 11a's tools grid for the opposite
 * reason: there the subject could legitimately be empty, here it cannot.
 *
 * Note the URL does NOT keep the fragment: the resolver rewrites it to
 * `?group=<g>` (observed: `/producer/dashboard/edit?group=profile`). So a test
 * must never assert on `location.hash` after navigating.
 */
async function openAt(page: Page, anchor: string): Promise<void> {
  await page.goto(`/producer/dashboard/edit#${anchor}`);
  await expect(
    card(page, anchor),
    `control: the #${anchor} deep link never brought its card on screen — every assertion here is void`,
  ).toBeVisible({ timeout: 15_000 });
}

/** The back link of whichever group is currently showing (each group has one). */
const backLink = (page: Page) => page.locator('[data-testid="hub-back"]:visible');

/** Enters a group from the hub. The hub TILE is `hub-card-<g>`; `group-<g>` is
 *  the panel it reveals, and clicking that never works — it is `hidden`. */
async function enterGroup(page: Page, group: string): Promise<void> {
  await page.getByTestId(`hub-card-${group}`).click();
  await expect(
    page.getByTestId(`group-${group}`),
    `control: the ${group} panel never opened — every assertion here is void`,
  ).toBeVisible({ timeout: 15_000 });
}

// ── MT:MEH-1116 — the accordion and its URL anchors ────────────────────────

test.describe("edit tab — accordion + URL anchors", () => {
  // MT:MEH-1116:5 — the deep link, which now has to cross the hub layer.
  test("a #anchor deep link opens that card, through its group", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "categories");

    await expect(card(page, "categories")).toHaveAttribute("aria-expanded", "true");
    // The hub itself steps aside once a group is selected — `hidden` is the
    // mechanism (page.js:791), so assert the attribute rather than a paint.
    await expect(hub(page)).toBeHidden();
    await expect(backLink(page)).toBeVisible();
  });

  // MT:MEH-1116:5 second half — "עובד גם בשינוי hash תוך כדי שהייה בדף".
  test("changing the hash in place moves the open card", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "categories");
    await expect(card(page, "categories")).toHaveAttribute("aria-expanded", "true");

    await page.evaluate(() => {
      window.location.hash = "#images";
    });

    await expect(card(page, "images")).toHaveAttribute("aria-expanded", "true");
    // And the previous one closed — this is also MT:MEH-1116:2, asserted on
    // the path a user actually takes to a second card.
    await expect(card(page, "categories")).toHaveAttribute("aria-expanded", "false");
  });

  // MT:MEH-1116:2 — one open at a time, by clicking rather than by hash.
  test("opening a second card closes the first", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "images");

    const open = page.locator('[data-testid^="accordion-"][aria-expanded="true"]:visible');
    await expect(open).toHaveCount(1);

    await card(page, "categories").click();
    // A COUNT, not two presence checks: two simultaneously-open cards is the
    // regression, and only a count can see it.
    await expect(open).toHaveCount(1);
    await expect(open).toHaveAttribute("data-testid", "accordion-categories");
  });

  // MT:MEH-1116:1 — closed on load, each header carrying a one-line summary.
  test("with no hash every card in the group is closed and still summarised", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit");
    await expect(
      hub(page),
      "control: the edit hub never rendered — every assertion here is void",
    ).toBeVisible({ timeout: 15_000 });

    // The hub is the landing state now, so "all cards closed" is trivially
    // true there. Enter a group and assert it where it can actually fail.
    await enterGroup(page, "profile");
    // Scoped to the VISIBLE group: all 14 cards are always mounted, so an
    // unscoped count would silently include three groups nobody is looking at.
    const cards = page.getByTestId("group-profile").locator('[data-testid^="accordion-"]');
    await expect(cards.first()).toBeVisible();
    await expect(
      page.getByTestId("group-profile").locator('[data-testid^="accordion-"][aria-expanded="true"]'),
    ).toHaveCount(0);

    // The row's SECOND half, which the first version of this test silently did
    // not cover: every header carries a one-line status summary. Asserted per
    // card rather than once, because "some header has a summary" is satisfied
    // by a single one and the row says every.
    const n = await cards.count();
    expect(n, "the profile group rendered no cards — the loop below would be free").toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const anchor = await cards.nth(i).getAttribute("data-testid");
      await expect(
        cards.nth(i).locator("span.truncate.text-fg-muted").first(),
        `${anchor} has no status summary line`,
      ).toBeVisible();
    }
  });

  // Not a checklist row — a property of the resolver worth pinning, because an
  // unknown hash silently doing something would be worse than doing nothing.
  test("an unknown hash is ignored rather than guessed at", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit#not-a-card");
    await expect(
      hub(page),
      "control: the edit hub never rendered — the assertion below is void",
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('[data-testid^="accordion-"][aria-expanded="true"]:visible'),
    ).toHaveCount(0);
  });
});

// ── MT:MEH-1158 — the collapsed-header previews ────────────────────────────

test.describe("edit tab — header previews", () => {
  // MT:MEH-1158:1 — three thumbnails and an overflow chip, from five images.
  test("images: three thumbs cap the row and the rest become «+2»", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "images");

    const header = card(page, "images");
    const thumbs = header.getByTestId("preview-thumbs");
    await expect(thumbs).toBeVisible();
    await expect(thumbs.locator("img")).toHaveCount(3);
    // Drift D3: the doc says «2+». It renders «+2», deliberately (dir="ltr").
    await expect(header.getByTestId("preview-overflow")).toHaveText("+2");
  });

  // MT:MEH-1158:2 — same cap, chips instead of thumbs, from four categories.
  test("categories: three chips and «+1»", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "categories");

    const header = card(page, "categories");
    // `> span:not([data-testid])` — the chips only. The overflow chip is also a
    // direct span child (it carries `preview-overflow`), so a bare span count
    // reads 4 and the cap assertion would be off by one in the safe direction.
    await expect(
      header.getByTestId("preview-chips").locator("> span:not([data-testid])"),
    ).toHaveCount(3);
    await expect(header.getByTestId("preview-overflow")).toHaveText("+1");
  });

  // MT:MEH-1158:3 — the bio preview is the FIRST line only.
  test("bio: the first line only, never the second", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");

    const header = card(page, "bio");
    await expect(header).toContainText("מאפייה שכונתית קטנה");
    // The load-bearing half: the fixture's second line must not reach the
    // header. Without this the assertion passes on a preview that renders the
    // whole description, which is exactly the regression the row names.
    await expect(header).not.toContainText("שורה שנייה שאסור שתופיע בכותרת");
  });

  // MT:MEH-1158:5 — the contact preview is the PRIMARY channel's icon + label.
  test("contact: the primary channel's own label", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "contact-channels");

    const header = card(page, "contact-channels");
    await expect(header).toContainText("וואטסאפ");
    await expect(header.locator("svg")).not.toHaveCount(0);
  });

  // MT:MEH-1158:6 — the empty state is a placeholder, with no marketing copy.
  test("an empty card gets the dashed placeholder and no sales pitch", async ({ page }) => {
    await stubEdit(page, { profile: EMPTY });
    await openAt(page, "images");

    const header = card(page, "images");
    await expect(header.getByTestId("preview-empty")).toBeAttached();
    await expect(header.getByTestId("preview-thumbs")).toHaveCount(0);
    // The placeholder is decorative by design — copy here would be the thing
    // the row forbids, and aria-hidden is how the component says so.
    await expect(header.getByTestId("preview-empty")).toHaveAttribute("aria-hidden", "true");
  });

  // Drift D1 — the row this section still carries for a preview that is gone.
  test("there is no location preview, and the set is the eight measured keys", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit");
    await expect(
      hub(page),
      "control: the edit hub never rendered — the assertions below are void",
    ).toBeVisible({ timeout: 15_000 });

    await enterGroup(page, "location");
    await expect(card(page, "locations")).toBeVisible();
    // MT:MEH-1158:4 expects a map-pin + city name here. Neither renders: the
    // locations card carries no preview node at all.
    const locHeader = card(page, "locations");
    await expect(locHeader.getByTestId("preview-thumbs")).toHaveCount(0);
    await expect(locHeader.getByTestId("preview-chips")).toHaveCount(0);
  });
});

// ── MT:MEH-2138 chunk C — the חובה/רשות chip ───────────────────────────────

test.describe("edit tab — required/optional chip", () => {
  const GROUPS = ["profile", "trust", "location", "contact"];

  // MT:MEH-2138-C:1 — every card carries one, in every group.
  test("every card in every group carries exactly one chip", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit");
    await expect(
      hub(page),
      "control: the edit hub never rendered — every assertion here is void",
    ).toBeVisible({ timeout: 15_000 });

    let seen = 0;
    for (const group of GROUPS) {
      await enterGroup(page, group);
      const panel = page.getByTestId(`group-${group}`);
      const cards = panel.locator('[data-testid^="accordion-"]');
      // `:visible` is load-bearing, and it was added because the discrimination
      // run proved its absence: hiding every chip left this test GREEN, because
      // `toHaveCount` counts ATTACHED nodes and a hidden chip is still attached.
      // The row says the chip is IN the header — a chip nobody can see does not
      // satisfy it.
      const chips = panel.locator('[data-testid^="section-chip-"]:visible');
      const n = await cards.count();
      expect(n, `${group} rendered no cards — the chip assertion would be free`).toBeGreaterThan(0);
      // One chip per card, counted rather than sampled: a card with no chip is
      // precisely what the row forbids, and a presence check cannot see it.
      await expect(chips, `${group}: one chip per card`).toHaveCount(n);
      for (const label of await chips.allInnerTexts()) {
        expect(["חובה", "רשות"], `${group}: unexpected chip text «${label}»`).toContain(label.trim());
      }
      seen += n;
      await backLink(page).click();
      await expect(hub(page)).toBeVisible();
    }
    expect(seen, "no cards were visited at all — every chip assertion above was free").toBeGreaterThan(0);
  });

  // MT:MEH-2138-C:2 — an EXACT partition, which is the only form that can fail
  // in both directions: a new required card and a demoted one both red it.
  test("«חובה» marks exactly the five submission gates, and nothing else", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/producer/dashboard/edit");
    await expect(
      hub(page),
      "control: the edit hub never rendered — every assertion here is void",
    ).toBeVisible({ timeout: 15_000 });

    const required: string[] = [];
    const optional: string[] = [];
    for (const group of GROUPS) {
      await enterGroup(page, group);
      const chips = page.getByTestId(`group-${group}`).locator('[data-testid^="section-chip-"]:visible');
      for (const el of await chips.all()) {
        const anchor = (await el.getAttribute("data-testid"))!.replace("section-chip-", "");
        ((await el.innerText()).trim() === "חובה" ? required : optional).push(anchor);
      }
      await backLink(page).click();
      await expect(hub(page)).toBeVisible();
    }

    expect(required.sort()).toEqual(
      ["categories", "contact-channels", "images", "locations", "products"].sort(),
    );
    // The other half of the partition: everything else is «רשות», and there is
    // no third state. Asserted as a count so a card carrying neither chip —
    // which is what MT:MEH-2138-C:1 forbids — cannot hide in here.
    expect(optional.length, "every non-gate card must carry «רשות»").toBeGreaterThan(0);
    expect(new Set([...required, ...optional]).size).toBe(required.length + optional.length);
  });

  // MT:MEH-2138-C:3 — the chip states whether a card GATES submission, not
  // whether it is finished. Same card, both fill states, same chip.
  test("the chip does not move when the card's content does", async ({ page }) => {
    await stubEdit(page, { profile: FILLED });
    await openAt(page, "images");
    await expect(page.getByTestId("section-chip-images")).toBeVisible();
    const filled = await page.getByTestId("section-chip-images").innerText();

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubEdit(page, { profile: EMPTY });
    await openAt(page, "images");
    await expect(page.getByTestId("section-chip-images")).toBeVisible();
    const empty = await page.getByTestId("section-chip-images").innerText();

    expect(filled.trim(), "images is a submission gate in both states").toBe("חובה");
    expect(empty.trim(), "emptying the card must not change what the chip says").toBe(filled.trim());
  });
});

// ── MT:MEH-1163 / MT:MEH-1157 — the bio card ───────────────────────────────

test.describe("edit tab — bio card", () => {
  // MT:MEH-1163:1 — the manual textarea is visible with no AI round-trip.
  test("with no saved bio the textarea is already there, empty", async ({ page }) => {
    await stubEdit(page, { profile: EMPTY });
    await openAt(page, "bio");

    const area = cardBody(page, "bio").locator("textarea").first();
    await expect(area).toBeVisible();
    await expect(area).toHaveValue("");
  });

  // MT:MEH-1163:2 — and pre-filled when there is one.
  test("with a saved bio the textarea is pre-filled with it", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");

    const area = cardBody(page, "bio").locator("textarea").first();
    await expect(area).toBeVisible();
    await expect(area).toHaveValue(/מאפייה שכונתית קטנה/);
  });

  // MT:MEH-1157:1 — a dead session redirects instead of parking on a spinner.
  test("a 401 on the profile fetch redirects to /login, showing no form", async ({ page }) => {
    await stubEdit(page, { profileStatus: 401 });
    await page.goto("/producer/dashboard/edit");

    await page.waitForURL(/\/login/, { timeout: 15_000 });
    // Both halves of the row: it redirects, AND it does not leave a form or a
    // stuck "loading" behind. The second is what distinguishes this from a
    // page that merely happens to navigate.
    await expect(page.getByTestId("edit-hub")).toHaveCount(0);
    await expect(page.locator('[data-testid^="accordion-"]')).toHaveCount(0);
  });
});
