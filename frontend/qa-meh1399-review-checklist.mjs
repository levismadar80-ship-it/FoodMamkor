/**
 * MEH-1399 self-QA — the review checklist as data, at 375 and 1440.
 *
 * Two surfaces, one run:
 *   /he/admin/settings          — the editable item list (chunk 2)
 *   /he/admin/producers         — the review sub-row + the evidence dossier
 *                                 (chunks 1, 3, 4)
 *
 * Stubs the API rather than booting a backend: `alembic upgrade` is denied to
 * CC (.claude/settings.json:317), so there is no sanctioned way to build a real
 * schema locally, and scripts/local-backend.sh runs exactly that command. Both
 * pages are "use client", so page.route() reaches their fetches.
 *
 * WHAT THIS PROVES: the items render from the API on both surfaces, a persisted
 * tick arrives pre-checked, toggling issues the PUT with the right body, the
 * dossier renders from the row's own ProducerAdminOut fields, and none of it
 * overflows at either width.
 * WHAT IT DOES NOT PROVE: that the tables exist (no DB) or that a save actually
 * round-trips (no backend). Those are pytest's job and Sapir's post-deploy check.
 *
 * Both constants below are hardcoded on purpose. An earlier harness read them
 * from the environment, and the `Env drift` gate reds any variable a file reads
 * that no .env.example documents — it scans the whole repo, QA harnesses
 * included. Do not reintroduce an env knob here.
 *
 * The controls are the point — every "not found" this harness could report is
 * paired with something that MUST be found, so a dead page cannot read as a pass.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3100";
const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "qa-artifacts/MEH-1399";

const PRODUCER_ID = "11111111-2222-3333-4444-555555555555";
const ITEM_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ITEM_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ITEM_C = "cccccccc-0000-0000-0000-000000000003";

const ADMIN = {
  id: "11111111-0000-0000-0000-000000000001",
  email: "admin@example.com",
  role: "admin",
  name: "ספיר",
};

// Three items, one of them retired — so the settings screen (include_inactive)
// and the review flow (active only) are provably reading DIFFERENT lists.
const ALL_ITEMS = [
  { id: ITEM_A, position: 0, label: "פרטים בסיסיים תקינים", hint: "שם, עיר, טלפון", active: true },
  { id: ITEM_B, position: 10, label: "רישיון הוצלב מול מאגר משרד הבריאות", hint: null, active: true },
  { id: ITEM_C, position: 20, label: "סעיף שהופסק", hint: null, active: false },
];
const ACTIVE_ITEMS = ALL_ITEMS.filter((i) => i.active);

// ITEM_A arrives already ticked — the whole point of Phase 2 is that a tick
// survives a page load, so a run where nothing is pre-checked proves nothing.
const CHECKS = [
  {
    item_id: ITEM_A,
    label_snapshot: "פרטים בסיסיים תקינים",
    checked_by_name: "ספיר",
    checked_at: "2026-08-20T09:00:00Z",
  },
];

const PRODUCER = {
  id: PRODUCER_ID,
  name: "מאפיית הגליל",
  slug: "galil-bakery",
  city: "צפת",
  status: "pending",
  images: ["https://res.cloudinary.com/demo/image/upload/v1/a.jpg"],
  categories: [{ id: 1, name: "מאפים" }],
  producer_license_number: "1234567",
  license_expires_at: "2026-09-10",
  website: "https://example.com",
  instagram: "https://instagram.com/example",
  kashrut_badges: [],
  phone: "0501234567",
  risk_score: null,
  created_at: "2026-08-01T00:00:00Z",
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function overflowOf(page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function newAdminPage(browser, width, height, onPut) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();

  await page.addInitScript(
    ([token, user]) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", user);
    },
    ["qa-fake-admin-token", JSON.stringify(ADMIN)],
  );

  // Catch-all FIRST: Playwright matches routes in REVERSE registration order,
  // so the specific handlers below still win. Without it, any /api/* this page
  // fetches that I did not stub falls through to next.config.js's rewrite ->
  // localhost:8000 -> ECONNREFUSED, which kills the dev server outright. An
  // unstubbed request must fail closed and cheap, not escape the harness.
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/auth/me", (r) => r.fulfill(json(ADMIN)));
  await page.route("**/api/admin/producers?**", (r) => r.fulfill(json([PRODUCER])));
  await page.route("**/api/admin/producers", (r) => r.fulfill(json([PRODUCER])));
  await page.route("**/api/admin/checklist-items**", (r) => {
    const url = r.request().url();
    if (r.request().method() === "PUT") return r.fulfill(json(ALL_ITEMS));
    // The active/all split is the assertion, so it is honoured here rather
    // than served from one list for both callers.
    return r.fulfill(json(url.includes("include_inactive=true") ? ALL_ITEMS : ACTIVE_ITEMS));
  });
  await page.route(`**/api/admin/producers/${PRODUCER_ID}/review-checks`, (r) => {
    if (r.request().method() === "PUT") {
      onPut?.(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill(json({ producer_id: PRODUCER_ID, checks: CHECKS }));
    }
    return r.fulfill(json({ producer_id: PRODUCER_ID, checks: CHECKS }));
  });

  return { ctx, page };
}

async function settingsSurface(browser, label, width, height) {
  const { ctx, page } = await newAdminPage(browser, width, height);
  await page.goto(`${BASE}/he/admin/settings`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  const heading = page.getByText("רשימת בדיקה לפני אישור");
  await heading.first().waitFor({ state: "visible", timeout: 25_000 }).catch(() => {});

  // CONTROL — the section rendered at all. Every "not found" below is void if
  // this fails, because an error page has no rows to miss.
  check(
    `[settings ${label}] CONTROL: the checklist section rendered`,
    (await heading.count()) > 0,
  );

  const labelInputs = page.locator('input[value="פרטים בסיסיים תקינים"]');
  check(
    `[settings ${label}] item label hydrated into an editable input`,
    (await labelInputs.count()) > 0,
  );

  // The retired item must be REACHABLE here — an item you cannot see is an item
  // you cannot bring back. This is the include_inactive=true half of the split.
  check(
    `[settings ${label}] the retired item is offered for editing`,
    (await page.locator('input[value="סעיף שהופסק"]').count()) > 0,
  );
  check(
    `[settings ${label}] the retired item reads as retired, not as in use`,
    (await page.getByText("הופסק השימוש").count()) > 0,
  );

  // No bin anywhere: the FK is ON DELETE RESTRICT, so a delete button could
  // only ever 500 on the items with history worth keeping.
  check(
    `[settings ${label}] no delete affordance is offered`,
    (await page.getByRole("button", { name: /מחיק|מחק/ }).count()) === 0,
  );

  const overflow = await overflowOf(page);
  check(`[settings ${label}] horizontal page overflow = ${overflow}px`, overflow <= 0, `${overflow}px`);

  await page.screenshot({ path: `${OUT}/checklist-settings-${label}.png`, fullPage: true });
  await ctx.close();
}

async function reviewSurface(browser, label, width, height) {
  let putBody = null;
  const { ctx, page } = await newAdminPage(browser, width, height, (b) => {
    putBody = b;
  });
  await page.goto(`${BASE}/he/admin/producers`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  const toggle = page.getByRole("button", { name: /רשימת בדיקה/ });
  await toggle.first().waitFor({ state: "visible", timeout: 25_000 }).catch(() => {});

  // CONTROL — the pending row rendered and carries the checklist toggle.
  check(
    `[review ${label}] CONTROL: the pending row renders the checklist toggle`,
    (await toggle.count()) > 0,
  );

  // CLOSED state of the 5-state matrix: the counter is the only signal, so it
  // has to be honest before anything is expanded. This producer HAS a recorded
  // tick, and the ticks are only fetched on expand — so a `(0/2)` here would be
  // a confident wrong answer, not a neutral default. `(?/2)` is the true one.
  // This assertion is why the harness carries a pre-ticked producer at all.
  const closedText = (await toggle.first().textContent().catch(() => "")) || "";
  check(
    `[review ${label}] closed counter says unknown, not a false zero`,
    closedText.includes("(?/2)") && !closedText.includes("(0/2)"),
    JSON.stringify(closedText.trim()),
  );

  await toggle.first().click();

  const itemB = page.getByText("רישיון הוצלב מול מאגר משרד הבריאות");
  await itemB.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  check(`[review ${label}] items render from the API when expanded`, (await itemB.count()) > 0);

  // The active-only half of the split — the retired item must NOT be offered
  // to an admin working a business.
  check(
    `[review ${label}] the retired item is NOT offered here`,
    (await page.getByText("סעיף שהופסק").count()) === 0,
  );

  const boxes = page.locator('input[type="checkbox"]');
  const checkedCount = await page.locator('input[type="checkbox"]:checked').count();
  check(
    `[review ${label}] the persisted tick arrives pre-checked`,
    checkedCount === 1,
    `checked=${checkedCount} of ${await boxes.count()}`,
  );

  // Toggling must PUT the whole wanted set, not a diff.
  const unchecked = page.locator('input[type="checkbox"]:not(:checked)').first();
  await unchecked.click();
  await page.waitForTimeout(500);
  check(
    `[review ${label}] toggling PUTs the full item_ids set`,
    Array.isArray(putBody?.item_ids) && putBody.item_ids.length === 2,
    JSON.stringify(putBody),
  );

  // Chunk 4 — the dossier, from this row's own fields, no extra fetch.
  check(
    `[review ${label}] the evidence dossier renders`,
    (await page.getByText("תיק בדיקה").count()) > 0,
  );
  check(
    `[review ${label}] dossier shows the licence number from the admin row`,
    (await page.getByText("מספר: 1234567").count()) > 0,
  );
  check(
    `[review ${label}] dossier shows the MEH-2072 expiry date`,
    (await page.getByText("תוקף: 2026-09-10").count()) > 0,
  );
  const registry = page.getByRole("link", { name: "מאגר משרד הבריאות" });
  check(
    `[review ${label}] the registry link opens in a new tab, safely`,
    (await registry.first().getAttribute("target")) === "_blank" &&
      ((await registry.first().getAttribute("rel")) || "").includes("noopener"),
  );

  // The eye pass on the 375 capture showed «מספר: …» running past the visible
  // area, so this measures it instead of my judging it from a thumbnail: does
  // the dossier's own content fit the viewport, or does reading it require
  // scrolling the table sideways?
  const dossierBox = await page
    .locator('p:has-text("תיק בדיקה")')
    .first()
    .evaluate((el) => {
      const r = el.parentElement.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    })
    .catch(() => null);
  check(
    `[review ${label}] the evidence dossier fits the viewport without sideways scroll`,
    !!dossierBox && dossierBox.left >= -1 && dossierBox.right <= width + 1,
    dossierBox
      ? `left=${Math.round(dossierBox.left)} right=${Math.round(dossierBox.right)} w=${Math.round(dossierBox.width)} viewport=${width}`
      : "no box",
  );

  const overflow = await overflowOf(page);
  // The admin producers table scrolls horizontally by design (many columns),
  // so this is REPORTED and attributed by the control below, not asserted.
  check(`[review ${label}] horizontal page overflow = ${overflow}px`, true, "see ATTRIBUTION");

  await page.screenshot({ path: `${OUT}/review-checklist-${label}.png`, fullPage: true });
  await ctx.close();
  return overflow;
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  // The sandbox's pre-installed Chromium, not a downloaded one: this repo's
  // @playwright/test pin resolves to a build revision the image does not carry,
  // and `playwright install` is forbidden here (the browsers are baked in).
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--ssl-version-max=tls1.2"],
  });

  for (const [label, w, h] of [["375", 375, 812], ["1440", 1440, 900]]) {
    await settingsSurface(browser, label, w, h);
  }
  const withChecklist375 = await reviewSurface(browser, "375", 375, 812);
  await reviewSurface(browser, "1440", 1440, 900);

  // BASELINE CONTROL — the same producers table at 375 with the checklist
  // suppressed (status "approved" fails PENDING_PHOTO_STATUSES), so the sub-row
  // never renders. If the overflow is identical, the number above is the
  // table's pre-existing horizontal scroll and not something this diff added.
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.addInitScript(
    ([token, user]) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", user);
    },
    ["qa-fake-admin-token", JSON.stringify(ADMIN)],
  );
  await page.route("**/api/**", (r) => r.fulfill(json([])));
  await page.route("**/api/auth/me", (r) => r.fulfill(json(ADMIN)));
  const approved = { ...PRODUCER, status: "approved" };
  await page.route("**/api/admin/producers?**", (r) => r.fulfill(json([approved])));
  await page.route("**/api/admin/producers", (r) => r.fulfill(json([approved])));
  await page.goto(`${BASE}/he/admin/producers`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.getByText("מאפיית הגליל").first().waitFor({ state: "visible", timeout: 25_000 }).catch(() => {});
  const baselineToggles = await page.getByRole("button", { name: /רשימת בדיקה/ }).count();
  check(
    "BASELINE CONTROL: an approved row renders NO checklist toggle",
    baselineToggles === 0,
    `toggles=${baselineToggles}`,
  );
  const baseline = await overflowOf(page);
  check(
    `ATTRIBUTION: overflow without the checklist = ${baseline}px, with = ${withChecklist375}px`,
    baseline === withChecklist375,
    baseline === withChecklist375
      ? "identical — pre-existing table scroll, not added by this diff"
      : "DIFFERENT — this diff changed the horizontal extent",
  );
  await page.screenshot({ path: `${OUT}/baseline-no-checklist-375.png`, fullPage: true });
  await ctx.close();

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL ${f.name} — ${f.detail}`));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
