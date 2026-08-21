/**
 * MEH-2155 self-QA — the dashboard questions card shows the live page state.
 *
 * Drives the REAL dashboard (local `next start` → local FastAPI → local
 * Postgres) at 375 and 1440, signed in as a seeded producer owner, and writes
 * a screenshot of the questions card per state per viewport into
 * qa-artifacts/MEH-2155/.
 *
 * SIGN-IN GOES THROUGH THE UI, NOT AN INJECTED TOKEN — and that is not
 * convenience. `get_current_user` enforces a request-fingerprint binding
 * (backend/app/auth.py:211-229, MEH-327): the access token carries a
 * `userFingerprint` claim that must hash-match a `__Secure-Fgp` cookie the
 * login response sets. A token pasted into localStorage without that cookie is
 * rejected with `אסימון לא תקין` — measured here first, from curl, before this
 * harness was written. Logging in through the form gets both halves the way a
 * real owner does.
 *
 * THE CONTROL, and why the negatives below need one:
 * Two of the three claims are absences — "the misleading empty state is gone",
 * "the save button is disabled". A harness that failed to reach the dashboard
 * at all (redirected to /login, card never expanded) reports exactly those
 * absences. So the run asserts FIRST that it is signed in and looking at an
 * expanded questions card with a non-empty live list; if that fails it exits 2
 * and declares every later line void rather than printing a reassuring pass.
 *
 * NOT a Playwright spec and not run by CI (`playwright.config.ts:35` matches
 * only `e2e/flows/**` and `e2e/visual/**` `.spec.ts` files) — an `.mjs` one-off
 * in the shape of the repo's other `qa-meh*.mjs` probes, committed so the
 * evidence in the PR is reproducible rather than asserted.
 *
 * USAGE — see qa-meh2154-channel-aware-chips.mjs for the server commands; this
 * additionally needs a producer-role user linked to the fixture. Two field
 * names cost a diagnostic round each, so they are recorded here: the password
 * column is `password_hash` (NOT `hashed_password`), and the owner link is
 * `User.producer_id` — there is no `Producer.owner_id`. SQLAlchemy accepts an
 * assignment to either wrong name without complaint, and the symptom surfaces
 * far away: a 401 `אסימון לא תקין` for the first, a 404 on `/producers/me`
 * (dashboard stuck on "טעינת נתונים…") for the second.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = process.env.QA_OWNER_EMAIL || "qa-owner@example.com";
const PASSWORD = process.env.QA_OWNER_PASSWORD || "QaPassw0rd!2026";
const OUT = "../qa-artifacts/MEH-2155";

const VIEWPORTS = [
  { name: "375", width: 375, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

const failures = [];
const ran = [];

function check(label, ok, detail) {
  ran.push(label);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("[data-testid='login-email']", EMAIL);
  await page.fill("[data-testid='login-password']", PASSWORD);
  await page.click("[data-testid='login-submit']");
  // Gate on the app leaving /login — never on the network going quiet
  // (MEH-215). Bounded, so a failed login ends the run instead of hanging.
  await page
    .waitForURL((u) => !new URL(u).pathname.endsWith("/login"), { timeout: 20_000 })
    .catch(() => {});
  return !page.url().endsWith("/login");
}

async function openQuestionsCard(page) {
  await page.goto(`${BASE}/producer/dashboard/edit?group=contact`, {
    waitUntil: "domcontentloaded",
  });
  const header = page.locator("[data-testid='accordion-questions']");
  await header.waitFor({ timeout: 20_000 }).catch(() => {});
  const summary = (await header.textContent().catch(() => "")) || "";
  if (await header.isVisible().catch(() => false)) await header.click();
  await page
    .getByRole("button", { name: /קבלו הכל|קבל הכל/ })
    .first()
    .click({ timeout: 2_000 })
    .catch(() => {});
  return summary;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
mkdirSync(OUT, { recursive: true });

let controlOk = false;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const label = `@${vp.name}`;
  console.log(`\n[dashboard ${label}]`);

  const signedIn = await signIn(page);
  check(`${label} — signed in as the producer owner`, signedIn, page.url());
  if (!signedIn) {
    await page.close();
    continue;
  }

  const summary = await openQuestionsCard(page);
  const list = page.locator("[data-testid='live-questions-list']");
  const items = await page.locator("[data-testid='live-question-item']").allTextContents();

  // ── THE CONTROL ──────────────────────────────────────────────────────────
  const reached = (await list.count()) > 0 && items.length > 0;
  check(
    `CONTROL ${label} — the questions card is open with a live list`,
    reached,
    `${items.length} item(s)`,
  );
  if (reached) controlOk = true;

  if (reached) {
    check(
      `${label} — the live list names a stock question the page serves`,
      items.some((t) => t.includes("אילו לחמים יש השבוע?")),
      items.map((t) => t.split("—")[0].trim()).join(" | "),
    );
    check(
      `${label} — a row is annotated as answered from her own details`,
      items.some((t) => t.includes("נענית אוטומטית מהפרטים שלך")),
    );
    check(
      `${label} — a chip row names the channel it opens`,
      items.some((t) => t.includes("וואטסאפ")),
    );
    check(
      `${label} — the misleading empty state is gone from the header`,
      !summary.includes("עוד אין שאלות מותאמות"),
      summary.replace(/\s+/g, " ").trim().slice(0, 90),
    );
    check(
      `${label} — the header counts what the page shows`,
      summary.includes("ברירת מחדל"),
    );
    check(
      `${label} — save is disabled with five blank inputs and nothing stored`,
      await page.locator("[data-testid='questions-save']").isDisabled(),
    );
    check(
      `${label} — the public-page link is present`,
      (await page.locator("[data-testid='view-on-page-questions']").count()) > 0,
    );

    // `#questions` is the accordion SECTION (EditAccordionCard.jsx:134,
    // `id={anchorId}`). The header button's parent is only the header strip —
    // the first pass shot that and produced a "card" image with no card body
    // in it, which is a screenshot of the wrong thing rather than evidence.
    const card = page.locator("#questions");
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${OUT}/dashboard-questions-${vp.name}.png`, fullPage: true });
    await card
      .screenshot({ path: `${OUT}/dashboard-questions-${vp.name}-card.png` })
      .catch(() => {});

    // Typing into one input must ENABLE save — the discriminating half of the
    // disabled rule (a button disabled unconditionally would pass the line
    // above and be a worse bug than the one this ticket fixes).
    // Target the questions card's OWN first input by its exact placeholder.
    // A `placeholder^='לדוגמה'` prefix match also hits inputs in other cards —
    // which stay mounted while collapsed (MEH-1100) — and `.first()` then
    // picks a hidden one, so the fill no-ops and this assertion fails for a
    // reason that has nothing to do with the save gate. (It did, twice.)
    const firstInput = page.getByPlaceholder("לדוגמה: מה יש במלאי השבוע?");
    await firstInput.fill("יש חלה לשבת?");
    check(
      `${label} — save enables once an input has content`,
      !(await page.locator("[data-testid='questions-save']").isDisabled()),
    );
    await page.screenshot({
      path: `${OUT}/dashboard-questions-${vp.name}-typed.png`,
      fullPage: true,
    });
  }
  await page.close();
}

await browser.close();

console.log(`\n${ran.length} assertion(s) ran, ${failures.length} failed.`);
if (!controlOk) {
  console.log(
    "\n⛔ CONTROL DID NOT PASS. The harness never proved it reached an open questions " +
      "card, so every absence reported above is void — do NOT quote them as evidence.",
  );
  process.exit(2);
}
if (failures.length) {
  console.log(`\nFAILED: ${failures.join(" · ")}`);
  process.exit(1);
}
console.log("\nAll assertions passed, control included.");
