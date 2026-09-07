import { test, expect, type Page, type Route } from "../_cloudinary-stub";

/**
 * Spec:     manual/dashboard-edit-cards — MEH-1249 chunk 11c of 12 (edit half)
 * Purpose:  Convert the CONVERT-verdict rows of the remaining edit-tab sections
 *           plus the completeness card that mounts on the Overview:
 *             MT:MEH-1100        unsaved-changes guard (banner + confirm dialog)
 *             MT:MEH-1116:3      state survives close/reopen (deferred from 11b)
 *             MT:MEH-1173        description card: hero field, AI assist, errors
 *             MT:MEH-1115        the "מה זה?" explainers
 *             MT:MEH-288         ProfileCompletenessCard states + a11y
 *             MT:MEH-1106        the completeness checklist + deep links
 * Touches:  NO real backend. Reads are route-fulfilled exactly as chunks 11a/11b
 *           do (including the four child-card reads 11b found the hard way).
 *           Two WRITES are also route-fulfilled — `PUT /producers/me` and
 *           `POST /producers/me/bio/generate` — because the rows under test are
 *           about what the CLIENT does with the response (does the banner clear,
 *           does the textarea keep its text, which error string renders). No
 *           byte reaches a server. The token is seeded via addInitScript.
 * Does NOT: assert persistence after reload (that needs a real write, and CI's
 *           authed specs point at the RAILWAY STAGING backend — e2e.yml:229-233 —
 *           so it would be a destructive write against shared staging; Sapir's
 *           13/07 ruling). Does NOT cover the structured editors (locations,
 *           delivery, hours, availability, events, group-buy, perks) — that is
 *           the second half of 11c, and the draft banner is flows/34's already.
 * Related:  manual/dashboard-shell.spec.ts (11a) · manual/dashboard-edit.spec.ts
 *           (11b) · components/ProfileCompletenessCard.jsx · components/WhatsThis.jsx
 *           · app/[locale]/producer/dashboard/edit/{page.js,cards.jsx}
 * History:  MEH-1249 chunk 11c.
 *
 * ─── MEH-1968 three conditions, stated because the rule requires it ────────
 *   1. No backend BEHAVIOUR is asserted — only what the client renders for a
 *      given response. A mocked PUT that "succeeds" tests that the banner
 *      clears; it does not test that anything was saved.
 *   2. /producers/me, /producers/me/bio/generate and the child-card reads all
 *      have Pydantic response models; chunks 11a/11b intercept the same set.
 *   3. Reaching "profile with exactly 3 of 6 steps done", "AI returned empty",
 *      "AI returned 429" against shared staging means mutating it and/or
 *      exhausting a real rate limiter — both forbidden.
 *
 * ─── Doc-vs-code drift found, REPORTED and not fixed ───────────────────────
 * D1 · MT:MEH-1106 is titled "צ'קליסט 4-צעדים" and its rows do 4-step math
 *      ("4/4", "75%", "50%"). buildSteps() returns SIX steps — image,
 *      location, products, contact, phone_verified, hours (five required, one
 *      recommended; ProfileCompletenessCard.jsx:187-252). With six steps the
 *      only reachable percentages are 17/33/50/67/83/100, so the doc's 75%
 *      cannot occur. MEH-2100 added phone_verified; MEH-1895 added hours.
 * D2 · MT:MEH-1106:1 and :4 gate products on "≥3". CHECKLIST_PRODUCTS_MIN is
 *      1 (ProfileCompletenessCard.jsx:61), decoupled by MEH-1238 — the file's
 *      own header says so. Asserted at the measured threshold.
 * D3 · MT:MEH-288:1 describes a RED state — "טבעת אדומה", "הפרופיל שלך חסר
 *      פרטים קריטיים". The component is never red since MEH-1092 (comment at
 *      :42/:70), and the i18n keys `red_headline` / `red_sub` have ZERO
 *      references in frontend/components or frontend/app — dead keys. The row
 *      is STALE; what is asserted is that a critically-incomplete profile gets
 *      the yellow_low headline, not a red one.
 * D4 · MT:MEH-1106:5 lists deep links `#profile-images|profile-categories|…`.
 *      Two moved: location → `#locations` (MEH-2058) and hours → `#locations`
 *      (MEH-2142); phone_verified → `#phone-verify` is new. Asserted as the
 *      exact six-way partition the code has today.
 * D5 · MT:MEH-288:4 says the green row "לא נעלם". At the PAGE level it does:
 *      MEH-1397 mounts the card only when `!isApproved || !isComplete`
 *      (chunk 11a asserted the approved+complete absence). The collapsed green
 *      row therefore exists only while complete-but-NOT-approved, which is the
 *      state asserted here. The row's claim holds inside the component and
 *      fails one level up; both halves are now pinned.
 */

// ── fixtures ───────────────────────────────────────────────────────────────

const IMG = "https://res.cloudinary.com/demo/image/upload/p.jpg";
const PRIMARY_LOC = { id: 1, kind: "branch", is_primary: true, lat: 32.08, lng: 34.78, opening_hours: "א-ה 09:00-17:00" };

/** 6/6 checklist steps done. `status` is set per test. */
const FULL = {
  id: 7,
  name: "מאפיית שקד",
  city: "חיפה",
  phone: "050-1234567",
  primary_contact_method: "whatsapp",
  whatsapp: "050-1234567",
  phone_verified: true,
  has_physical_location: true,
  offers_delivery: false,
  delivery_areas: [],
  categories: [{ id: 2, name: "לחמים ואפייה" }],
  images: [{ id: 1, url: IMG }],
  products: [{ id: 1, name: "חלה" }],
  short_description: "מאפייה שכונתית",
  description: "מאפייה שכונתית קטנה בלב חיפה",
  locations: [PRIMARY_LOC],
};

type Overrides = Partial<typeof FULL> & Record<string, unknown>;
const profile = (o: Overrides = {}) => ({ ...FULL, ...o });

type EditOpts = {
  profile?: Record<string, unknown>;
  status?: string;
  /** what POST /producers/me/bio/generate answers */
  generate?: { status: number; body: unknown };
  /** records every PUT body */
  puts?: unknown[];
};

async function stubEdit(page: Page, opts: EditOpts = {}): Promise<void> {
  const { profile: p = FULL, status = "approved", generate = { status: 200, body: { bio: "תיאור שנוצר על ידי AI" } }, puts } = opts;
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ id: 42, email: "owner@example.com", name: "שקד", role: "producer", producer_id: 7 }) }));
  await page.route("**/favorites**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  for (const sub of ["products", "locations", "name-change-requests", "kashrut-requests"]) {
    await page.route(`**/producers/me/${sub}**`, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  }
  await page.route("**/producers/me/bio/generate", (r) =>
    r.fulfill({ status: generate.status, contentType: "application/json", body: JSON.stringify(generate.body) }));
  await page.route("**/producers/me/dashboard", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ producer: { id: 7, name: FULL.name, slug: null, status, availability_state: "accepting_orders", vacation_until: null }, stats: {} }) }));
  await page.route("**/producers/me/analytics**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ profile_views: { total: 0, last_7d: 0 }, whatsapp_clicks: { total: 0, last_7d: 0 }, contact_clicks: { total: 0, last_7d: 0 },
        average_rating: null, total_reviews: 0, rank_in_city: null, conversion_rate: "0%", profile_strength: 10, top_cities: [], follower_count: 0, new_followers_this_week: 0 }) }));
  await page.route("**/producers/me", (r: Route) => {
    if (r.request().method() === "PUT") {
      puts?.push(r.request().postDataJSON());
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...p, status, ...r.request().postDataJSON() }) });
    }
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...p, status }) });
  });
}

const card = (page: Page, anchor: string) => page.getByTestId(`accordion-${anchor}`);
const cardBody = (page: Page, anchor: string) => page.locator(`#${anchor} [role="region"]`);
const banner = (page: Page) => page.getByTestId("unsaved-banner");
/** The description card's hero textarea — the only textarea in the bio card body. */
const heroField = (page: Page) => cardBody(page, "bio").locator("textarea").first();

async function openAt(page: Page, anchor: string): Promise<void> {
  await page.goto(`/producer/dashboard/edit#${anchor}`);
  await expect(card(page, anchor), `control: #${anchor} never came on screen — every assertion here is void`).toBeVisible({ timeout: 15_000 });
}

// ── MT:MEH-1100 + MT:MEH-1116:3 — the unsaved-changes guard ────────────────

test.describe("edit tab — unsaved-changes guard", () => {
  // MT:MEH-1100:1 — nothing edited, nothing guarding.
  test("a clean page shows no banner and lets navigation through", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");
    await expect(banner(page)).toHaveCount(0);

    let dialogs = 0;
    page.on("dialog", (d) => { dialogs += 1; void d.dismiss(); });
    await page.getByRole("link", { name: "סקירה" }).click();
    await page.waitForURL(/\/producer\/dashboard\/?(\?.*)?$/, { timeout: 15_000 });
    expect(dialogs, "a clean page must never prompt").toBe(0);
  });

  // MT:MEH-1100:2 — typing anywhere raises the banner.
  test("typing in a field raises the banner, naming the card", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");
    await heroField(page).fill("טקסט חדש שלא נשמר");

    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toHaveAttribute("role", "status");
    await expect(banner(page)).toContainText("שינויים שלא נשמרו ב:");
  });

  // MT:MEH-1100:3 (also MT:MEH-1116:4 by reference) — the confirm dialog, both branches.
  test("navigating away with changes prompts; cancel stays, accept leaves", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");
    await heroField(page).fill("טקסט חדש שלא נשמר");
    await expect(banner(page)).toBeVisible();

    // Branch 1 — dismiss: still here, banner still up.
    page.once("dialog", (d) => {
      expect(d.message()).toBe("יש שינויים שלא נשמרו. לעזוב את העמוד בלי לשמור?");
      void d.dismiss();
    });
    await page.getByRole("link", { name: "סקירה" }).click();
    // Inverted bounded wait (testing.md): the navigation must NOT happen.
    const strayed = await page.waitForURL(/\/producer\/dashboard\/?(\?.*)?$/, { timeout: 2_500 }).then(() => true).catch(() => false);
    expect(strayed, "cancel must keep her on the edit tab").toBe(false);
    await expect(banner(page)).toBeVisible();

    // Branch 2 — accept: leaves.
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("link", { name: "סקירה" }).click();
    await page.waitForURL(/\/producer\/dashboard\/?(\?.*)?$/, { timeout: 15_000 });
  });

  // MT:MEH-1100:5 — a (mocked) save clears the guard.
  test("saving clears the banner and frees navigation", async ({ page }) => {
    const puts: unknown[] = [];
    await stubEdit(page, { puts });
    await openAt(page, "bio");
    await heroField(page).fill("תיאור מעודכן");
    await expect(banner(page)).toBeVisible();

    await cardBody(page, "bio").getByRole("button", { name: "שמרו" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(puts.length, "exactly one PUT must have left the client").toBe(1);

    let dialogs = 0;
    page.on("dialog", (d) => { dialogs += 1; void d.dismiss(); });
    await page.getByRole("link", { name: "סקירה" }).click();
    await page.waitForURL(/\/producer\/dashboard\/?(\?.*)?$/, { timeout: 15_000 });
    expect(dialogs).toBe(0);
  });

  // MT:MEH-1116:3 — the body is hidden-toggled, not unmounted, so typed text survives.
  test("typed text survives closing and reopening the card, and the banner stays up meanwhile", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");
    await heroField(page).fill("טיוטה באמצע");
    await expect(banner(page)).toBeVisible();

    await card(page, "bio").click();
    await expect(card(page, "bio")).toHaveAttribute("aria-expanded", "false");
    await expect(banner(page), "the banner must outlive the collapse").toBeVisible();

    await card(page, "bio").click();
    await expect(card(page, "bio")).toHaveAttribute("aria-expanded", "true");
    await expect(heroField(page)).toHaveValue("טיוטה באמצע");
  });
});

// ── MT:MEH-1173 — the description card ─────────────────────────────────────

test.describe("edit tab — description card", () => {
  const assistOpen = (page: Page) => cardBody(page, "bio").getByRole("button", { name: "צרו תיאור עם AI" });
  const generateBtn = (page: Page) => cardBody(page, "bio").getByRole("button", { name: "צרו תיאור", exact: true });
  const q1 = (page: Page) => cardBody(page, "bio").getByPlaceholder(/ריבות ביתיות/);

  // MT:MEH-1173:1 — one hero field plus the tagline, both labelled with where they appear.
  test("the card leads with one hero field and one tagline field", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");
    const body = cardBody(page, "bio");
    await expect(body.getByText("תיאור מלא", { exact: true })).toBeVisible();
    await expect(body.getByText("מופיע בעמוד העסק", { exact: true })).toBeVisible();
    await expect(body.getByText("משפט תדמית", { exact: true })).toBeVisible();
    await expect(body.getByText("מופיע על כרטיס העסק בחיפוש וברשימות")).toBeVisible();
    await expect(heroField(page)).toHaveValue(FULL.description);
  });

  // MT:MEH-1173:2 — the generate button is disabled WITH a reason until Q1 is answered.
  test("generate is disabled with a stated reason until the first question is answered", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "bio");
    await assistOpen(page).click();

    const body = cardBody(page, "bio");
    // Exactly three questions, counted.
    await expect(body.getByText("מה אתם מוכרים?")).toBeVisible();
    await expect(body.getByText("באיזה אזור אתם פועלים?")).toBeVisible();
    await expect(body.getByText("מה מיוחד אצלכם?")).toBeVisible();

    await expect(generateBtn(page)).toBeDisabled();
    await expect(body.getByText("ענו על השאלה הראשונה כדי להתחיל.")).toBeVisible();

    await q1(page).fill("ריבות ביתיות");
    await expect(generateBtn(page)).toBeEnabled();
    await expect(body.getByText("ענו על השאלה הראשונה כדי להתחיל.")).toHaveCount(0);
  });

  // MT:MEH-1173:3 — a successful generate lands in the hero field.
  test("a generated description lands in the hero field", async ({ page }) => {
    await stubEdit(page, { generate: { status: 200, body: { bio: "תיאור שנוצר על ידי AI" } } });
    await openAt(page, "bio");
    await assistOpen(page).click();
    await q1(page).fill("ריבות ביתיות");
    await generateBtn(page).click();
    await expect(heroField(page)).toHaveValue("תיאור שנוצר על ידי AI");
  });

  // MT:MEH-1173:4 — an empty (fail-open) result must not wipe existing text.
  test("an empty AI result keeps the existing text and says the service is unavailable", async ({ page }) => {
    await stubEdit(page, { generate: { status: 200, body: { bio: "" } } });
    await openAt(page, "bio");
    await expect(heroField(page)).toHaveValue(FULL.description);
    await assistOpen(page).click();
    await q1(page).fill("ריבות ביתיות");
    await generateBtn(page).click();

    await expect(cardBody(page, "bio").getByText(/העזרה בכתיבה לא זמינה כרגע/)).toBeVisible();
    // The load-bearing half: the text she already had is still there.
    await expect(heroField(page)).toHaveValue(FULL.description);
  });

  // MT:MEH-1173:5 — a 429 gets its own copy, not the generic error.
  test("a 429 from the generator shows the rate-limit copy", async ({ page }) => {
    await stubEdit(page, { generate: { status: 429, body: { detail: "rate limited" } } });
    await openAt(page, "bio");
    await assistOpen(page).click();
    await q1(page).fill("ריבות ביתיות");
    await generateBtn(page).click();
    await expect(cardBody(page, "bio").getByText(/נוצרו כבר כמה תיאורים בשעה האחרונה/)).toBeVisible();
    await expect(cardBody(page, "bio").getByText(/העזרה בכתיבה לא זמינה/)).toHaveCount(0);
  });

  // MT:MEH-1173:6 — one PUT carries both fields.
  test("one save request carries both the description and the tagline", async ({ page }) => {
    const puts: Array<Record<string, unknown>> = [];
    await stubEdit(page, { puts });
    await openAt(page, "bio");
    await heroField(page).fill("תיאור חדש");
    await cardBody(page, "bio").getByPlaceholder(/משפט אחד שמסכם/).fill("משפט תדמית חדש");
    await cardBody(page, "bio").getByRole("button", { name: "שמרו" }).click();
    await expect(banner(page)).toHaveCount(0);

    expect(puts.length).toBe(1);
    expect(puts[0]).toMatchObject({ description: "תיאור חדש", short_description: "משפט תדמית חדש" });
  });
});

// ── MT:MEH-1115 — "מה זה?" ─────────────────────────────────────────────────

test.describe("edit tab — what's-this explainers", () => {
  async function toggles(page: Page, testId: string) {
    const btn = page.getByTestId(testId);
    await expect(btn, `control: ${testId} never rendered`).toBeVisible({ timeout: 15_000 });
    await expect(btn).toHaveText("מה זה?");
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    const panelId = await btn.getAttribute("aria-controls");
    expect(panelId, "the trigger must control a panel").toBeTruthy();
    const panel = page.locator(`[id="${panelId}"]`);
    await expect(panel).toBeHidden();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
  }

  // MT:MEH-1115:1
  test("primary channel — opens and closes", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "contact-channels");
    await toggles(page, "whats-this-primary-channel");
  });

  // MT:MEH-1115:2
  test("order form — opens and closes", async ({ page }) => {
    await stubEdit(page);
    await openAt(page, "contact-channels");
    await toggles(page, "whats-this-order-form");
  });

  // MT:MEH-1115:3 — a different page, so its own reads.
  test("group-buys page — opens and closes", async ({ page }) => {
    await stubEdit(page);
    await page.route("**/api/group-buys**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
    await page.goto("/producer/dashboard/group-buys");
    await toggles(page, "whats-this-group-buy");
  });

  // MT:MEH-1115:5
  test("/en — the trigger reads «What's this?»", async ({ page }) => {
    await stubEdit(page);
    await page.goto("/en/producer/dashboard/edit#contact-channels");
    const btn = page.getByTestId("whats-this-primary-channel");
    await expect(btn, "control: the trigger never rendered on /en").toBeVisible({ timeout: 15_000 });
    await expect(btn).toHaveText("What's this?");
  });
});

// ── MT:MEH-288 / MT:MEH-1106 — the completeness card (on the Overview) ─────

test.describe("overview — completeness card", () => {
  const cardRoot = (page: Page) => page.getByTestId("profile-completeness-card");
  const ring = (page: Page) => cardRoot(page).getByRole("progressbar");
  const checklist = (page: Page) => cardRoot(page).getByRole("list", { name: "התקדמות השלמת הפרופיל" });

  /** Mounts the card: status pending keeps `completenessFirst` true regardless of profile. */
  async function openOverview(page: Page, p: Record<string, unknown>) {
    await stubEdit(page, { profile: p, status: "pending" });
    await page.goto("/producer/dashboard");
    const ov = page.getByTestId("producer-overview");
    await expect(ov, "control: the Overview never rendered").toBeVisible({ timeout: 15_000 });
    await expect(ov, "fixture precondition: the card mounts only while NOT approved").toHaveAttribute("data-state-approved", "false");
    await expect(cardRoot(page), "control: the completeness card never mounted").toBeVisible();
  }

  // MT:MEH-1106:1 (at the measured 6, not 4) · MT:MEH-288:4 (drift D5: inside the component)
  test("6/6 collapses to the single green row", async ({ page }) => {
    await openOverview(page, FULL);
    await expect(cardRoot(page)).toHaveAttribute("role", "status");
    await expect(cardRoot(page)).toContainText("הפרופיל מלא");
    await expect(ring(page)).toHaveCount(0);
    await expect(checklist(page)).toHaveCount(0);
  });

  // MT:MEH-288:3 · MT:MEH-1106:2 (83%, not the doc's 75%)
  // The doc's "רק N פרטים עד שהפרופיל מלא" sub-line is `yellow_high_sub`, and the
  // card never reads it: `checklist_sub` renders unconditionally under either
  // yellow headline (ProfileCompletenessCard.jsx:311). Four `completeness.*`
  // keys — red_headline, red_sub, yellow_low_sub, yellow_high_sub — have zero
  // references in the component (grep, 05/09).
  test("one step missing → 83%, «כמעט שם», exactly one todo", async ({ page }) => {
    await openOverview(page, profile({ images: [] }));
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "83");
    await expect(cardRoot(page)).toContainText("כמעט שם — 83% מוכן");
    await expect(cardRoot(page)).toContainText("עוד כמה צעדים והפרופיל שלכם מוכן לקבל פניות");
    await expect(checklist(page).getByRole("listitem")).toHaveCount(6);
  });

  // MT:MEH-288:2 · MT:MEH-1106:3 (50% is reachable with 6 steps: 3 done)
  test("three steps missing → 50% with the neutral headline", async ({ page }) => {
    await openOverview(page, profile({ images: [], products: [], phone_verified: false }));
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "50");
    await expect(cardRoot(page)).toContainText("הפרופיל שלך 50% מוכן");
    await expect(cardRoot(page)).not.toContainText("כמעט שם");
  });

  // MT:MEH-288:1 — drift D3: the "red" state does not exist; the critical case is yellow.
  test("a profile missing city, coords and contact is NOT red — the dead red keys never render", async ({ page }) => {
    await openOverview(page, profile({ city: null, locations: [], phone: null, whatsapp: null, primary_contact_method: null }));
    await expect(cardRoot(page)).not.toContainText("עוד כמה פרטים חשובים ואתם באוויר");
    await expect(cardRoot(page)).not.toContainText("חסר פרטים קריטיים");
    await expect(cardRoot(page)).toContainText(/הפרופיל שלך \d+% מוכן/);
  });

  // MT:MEH-288:6 — a11y: progressbar value + CTA name.
  test("the ring is a progressbar with the percentage, and the CTA has its own name", async ({ page }) => {
    await openOverview(page, profile({ images: [] }));
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "83");
    await expect(ring(page)).toHaveAttribute("aria-label", "השלמת פרופיל: 83%");
    await expect(cardRoot(page).getByRole("link", { name: "השלימו את הפרופיל שלך" })).toBeVisible();
  });

  // MT:MEH-1106:4 — drift D2: the threshold is 1, not 3.
  test("products: zero is a todo, one is done", async ({ page }) => {
    await openOverview(page, profile({ products: [] }));
    await expect(cardRoot(page).getByTestId("completeness-chip-products")).toBeVisible();
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "83");

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await openOverview(page, profile({ products: [{ id: 1, name: "חלה" }] }));
    await expect(cardRoot(page)).toContainText("הפרופיל מלא");
  });

  // MT:MEH-1106:5 — drift D4: the six-way href partition as it stands today.
  test("each checklist step deep-links to the editor that owns it", async ({ page }) => {
    await openOverview(page, profile({ images: [], products: [], phone_verified: false, locations: [], city: null, phone: null, whatsapp: null, primary_contact_method: null }));
    const items = checklist(page).getByRole("listitem");
    await expect(items).toHaveCount(6);
    const hrefs = await items.locator("a").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).hash));
    expect(hrefs.sort()).toEqual(["#locations", "#locations", "#phone-verify", "#profile-contact", "#profile-images", "#profile-products"].sort());
  });

  // MT:MEH-1106:6 — delivery-only satisfies the location step without coordinates.
  test("a delivery-only business completes the location step through its delivery areas", async ({ page }) => {
    await openOverview(page, profile({ has_physical_location: false, offers_delivery: true, delivery_nationwide: true, locations: [] }));
    // Only `hours` can be missing now (it reads the primary location), so 5/6.
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "83");
    const locationRow = checklist(page).getByRole("listitem").filter({ has: page.getByTestId("completeness-chip-location") });
    await expect(locationRow).toHaveCount(1);
    await expect(locationRow.locator("a")).toHaveAttribute("href", /#locations$/);
  });
});
