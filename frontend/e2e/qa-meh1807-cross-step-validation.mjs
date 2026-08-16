/**
 * MEH-1807 self-QA — cross-step validation in the producer register wizard.
 *
 * Proves the three behaviours the ticket asks for, in a real browser, at both
 * mobile 390px and desktop 1440px:
 *
 *   A — "הבא" on DETAILS with an empty business name: no advance, the error is
 *       inline ON the field (aria-invalid + aria-describedby), focus lands there.
 *   B — final submit with an earlier field blanked: the wizard NAVIGATES back to
 *       the step that owns it, focuses it, and explains the bounce at the top of
 *       the card. No request is sent.
 *   C — correcting the field clears the message immediately (Baymard), and the
 *       submit then completes.
 *
 * No backend is needed. RegisterProducerClient.jsx boots straight to
 * STEP.DETAILS when a `token` is present in localStorage, and /categories +
 * /auth/register/producer are intercepted, so the run is deterministic and
 * offline. Scenario B reaches its state through the draft banner — the same
 * shared-localStorage path a second open tab produces in production.
 *
 * Run from frontend/ with `next start` on :3000:
 *   node e2e/qa-meh1807-cross-step-validation.mjs [outdir]
 * Exits non-zero if any check fails.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(
  process.argv[2] || "/home/user/FoodMamkor/qa-artifacts/MEH-1807",
);
const URL = "http://127.0.0.1:3000/register/producer";
const DRAFT_KEY = "producer_registration_draft";

const failures = [];
function check(name, cond, detail = "") {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name} ${detail}`);
    failures.push(name);
  }
}

async function newPage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  // Seed a token so the wizard opens on DETAILS, and a draft with one non-empty
  // value so hasDraftContent() raises the resume banner (scenario B needs it).
  await ctx.addInitScript(
    ([draftKey]) => {
      try {
        localStorage.setItem("token", "qa-token");
        localStorage.setItem(draftKey, JSON.stringify({ city: "חיפה" }));
      } catch {}
    },
    [DRAFT_KEY],
  );
  const page = await ctx.newPage();
  // auth-context.js validates the seeded token against GET /auth/me and clears
  // it on failure, which would drop the wizard back to STEP.ACCOUNT. Serve a
  // consumer who does not yet own a producer (role "user" → no MEH-1489 gate).
  await page.route("**/auth/me", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 4242,
        email: "qa-meh1807@example.com",
        name: "QA",
        role: "user",
        is_producer: false,
        producer_id: null,
      }),
    }),
  );
  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      // POPULAR (renders at rest, no search needed), not license-required, not
      // agricultural — so neither the MEH-952 license gate nor the MEH-759
      // grower declaration interferes with what this harness is measuring.
      body: JSON.stringify([{ id: 1, name: "סבונים טבעיים" }]),
    }),
  );
  // Anti-enumeration ack (no access_token) — the non-upgrade CONFIRM branch.
  await page.route("**/auth/register/producer", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  return { ctx, page };
}

async function activeTestId(page) {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") || null,
  );
}

async function describedText(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    const ref = el?.getAttribute("aria-describedby");
    return ref ? document.getElementById(ref)?.textContent?.trim() || null : null;
  }, testId);
}

async function run(browser, label, width, height) {
  console.log(`\n=== ${label} (${width}x${height}) ===`);
  const { ctx, page } = await newPage(browser, width, height);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-frame-details").waitFor();

  // ---- A: per-step gate on DETAILS ------------------------------------
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-next").click();

  check(
    `${label} A1 did not advance past DETAILS`,
    await page.getByTestId("register-frame-details").isVisible(),
  );
  check(
    `${label} A2 CATEGORY frame not mounted`,
    (await page.getByTestId("register-frame-category").count()) === 0,
  );
  check(
    `${label} A3 name field marked aria-invalid`,
    (await page.getByTestId("register-details-name").getAttribute("aria-invalid")) ===
      "true",
  );
  const aText = await describedText(page, "register-details-name");
  check(
    `${label} A4 inline message is the business-name required string`,
    aText === "יש למלא שם עסק",
    `got: ${JSON.stringify(aText)}`,
  );
  check(
    `${label} A5 focus landed on the offending field`,
    (await activeTestId(page)) === "register-details-name",
    `active: ${await activeTestId(page)}`,
  );
  await page.screenshot({
    path: path.join(OUT, `${label}-A-step-gate.png`),
    fullPage: true,
  });

  // ---- C (first half): on-change clear --------------------------------
  await page.getByTestId("register-details-name").fill("הבית של רותי");
  check(
    `${label} C1 aria-invalid cleared as soon as the field was corrected`,
    (await page.getByTestId("register-details-name").getAttribute("aria-invalid")) ===
      null,
  );

  // Walk on to STORY.
  await page.getByTestId("register-details-next").click();
  await page.getByTestId("register-frame-category").waitFor();
  // CATEGORY per-step gate: advancing with nothing selected must be blocked.
  await page.getByTestId("register-category-next").click();
  check(
    `${label} A6 CATEGORY advance blocked with zero categories`,
    (await page.getByTestId("register-frame-story").count()) === 0,
  );
  check(
    `${label} A7 category error rendered at the selector`,
    (await page.getByTestId("register-category-error").textContent()).includes(
      "יש לבחור",
    ),
  );
  await page.getByTestId("category-chip-1").click();
  check(
    `${label} A8 category error cleared on selection`,
    (await page.getByTestId("register-category-error").count()) === 0,
  );
  await page.getByTestId("register-category-next").click();
  await page.getByTestId("register-frame-story").waitFor();

  // ---- B: final-submit bounce -----------------------------------------
  // A second tab of the same origin rewrites the shared draft key; this tab's
  // resume banner is still on screen, so "המשך מילוי קודם" merges a form the
  // seller never typed — the one path the per-step gates cannot cover.
  await page.evaluate(
    ([key]) =>
      localStorage.setItem(
        key,
        JSON.stringify({ producer_name: "", city: "חיפה" }),
      ),
    [DRAFT_KEY],
  );
  await page.getByTestId("register-draft-continue").click();
  await page.getByTestId("register-referral-source").selectOption("instagram");
  const boxes = page.locator('#main-content input[type="checkbox"], input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if (await b.isVisible()) await b.check();
  }

  let posted = false;
  page.on("request", (r) => {
    if (r.url().includes("/auth/register/producer")) posted = true;
  });
  await page.getByTestId("register-story-submit").click();
  await page.getByTestId("register-frame-details").waitFor();

  check(`${label} B1 navigated back to the DETAILS step`, true);
  check(
    `${label} B2 STORY frame unmounted`,
    (await page.getByTestId("register-frame-story").count()) === 0,
  );
  check(`${label} B3 no register request was sent`, posted === false);
  check(
    `${label} B4 name field marked aria-invalid after the bounce`,
    (await page.getByTestId("register-details-name").getAttribute("aria-invalid")) ===
      "true",
  );
  check(
    `${label} B5 focus landed on the offending field`,
    (await activeTestId(page)) === "register-details-name",
    `active: ${await activeTestId(page)}`,
  );
  const notice = await page
    .getByTestId("register-submit-gate-notice")
    .textContent()
    .catch(() => null);
  check(
    `${label} B6 bounce explained at the top of the card`,
    (notice || "").includes("חסרים פרטים"),
    `got: ${JSON.stringify(notice)}`,
  );
  await page.screenshot({
    path: path.join(OUT, `${label}-B-submit-bounce.png`),
    fullPage: true,
  });

  // ---- C (second half): fix → notice retires → submit succeeds ---------
  await page.getByTestId("register-details-name").fill("הבית של רותי");
  check(
    `${label} C2 bounce notice retired once the field was fixed`,
    (await page.getByTestId("register-submit-gate-notice").count()) === 0,
  );
  await page.getByTestId("register-details-next").click();
  await page.getByTestId("register-frame-category").waitFor();
  await page.getByTestId("register-category-next").click();
  await page.getByTestId("register-frame-story").waitFor();
  await page.getByTestId("register-story-submit").click();
  await page.getByTestId("register-frame-confirm").waitFor({ timeout: 10_000 });
  check(`${label} C3 submit completed after the fix`, true);
  await page.screenshot({
    path: path.join(OUT, `${label}-C-submitted.png`),
    fullPage: true,
  });

  await ctx.close();
}

fs.mkdirSync(OUT, { recursive: true });
// Sandbox pins a Chromium older than the one @playwright/test wants to fetch
// (downloads disabled) — same executablePath pin playwright.local.config.ts uses.
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
await run(browser, "mobile", 390, 844);
await run(browser, "desktop", 1440, 900);
await browser.close();

console.log(
  `\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILED: ${failures.join(", ")}`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
