/**
 * MEH-1627 self-QA — drives a real Chromium against a real local stack
 * (next start :3000 -> uvicorn :8000 -> Postgres). Nothing is route-mocked:
 * the 401s come from the actual backend and the actual axios interceptor
 * decides what to do with them.
 *
 * Scenario A: logged-in user, access token tampered to an expired one,
 *             navigates to an approved producer page -> page must render
 *             (the interceptor refreshes off the HttpOnly cookie and retries).
 * Scenario B: logged-in consumer completes /he/register/producer, token is
 *             tampered to expired immediately before submit -> submit must
 *             SUCCEED via refresh+retry, never the 422
 *             "אימייל, שם וסיסמה הם שדות חובה".
 *
 * PREREQUISITES
 *   1. A local stack: `alembic upgrade head` on a dev DB, uvicorn on :8000,
 *      `next start` on :3000 (next.config.js proxies /api -> :8000 by default).
 *   2. A seeded consumer (qa-consumer@example.com) and an approved producer.
 *   3. /tmp/qa_fixture.json holding {expired_token, producer_id, user_id} —
 *      an access token signed with the SAME secret the backend runs with, but
 *      with a past `exp`.
 *   4. The consumer must NOT already own a producer. Scenario B upgrades them,
 *      so before EVERY re-run clear all three fields — `producer_id`, `role`,
 *      and `is_producer` (the durable flag; clearing only producer_id leaves
 *      the 409 guard at routers/auth.py:483 armed).
 *   5. register_producer is rate-limited 3/hour per IP. Repeated runs 429;
 *      restart uvicorn to reset the in-memory slowapi counters.
 *
 * Run from frontend/: node e2e/qa-meh1627-optional-auth.mjs [outdir]
 * Exits non-zero if any check fails.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "/home/user/FoodMamkor/qa-artifacts/MEH-1627");
const BASE = "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FIX = JSON.parse(fs.readFileSync("/tmp/qa_fixture.json", "utf8"));

const EMAIL = "qa-consumer@example.com";
const PASSWORD = "Zx7Yp9Mq2Lr4";
const BAD_422 = "אימייל, שם וסיסמה הם שדות חובה";

fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(page) {
  await page.goto(`${BASE}/he/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/login") && r.status() === 200,
      { timeout: 20000 }
    ),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => !!localStorage.getItem("token"), { timeout: 20000 });
}

async function tamper(page) {
  await page.evaluate((t) => localStorage.setItem("token", t), FIX.expired_token);
}

/** The cookie banner is fixed to the bottom and eats clicks on the wizard's
 *  "next" button at 375px. Dismiss it before driving the form. */
async function dismissCookies(page) {
  const accept = page.getByRole("button", { name: /קבלו הכל/ });
  if (await accept.count()) {
    await accept.first().click();
    await page.waitForTimeout(500);
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

// ---------------------------------------------------------------- Scenario A
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "he-IL" });
  const page = await ctx.newPage();
  const calls = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/")) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });

  await login(page);
  await tamper(page);
  const tokenBefore = await page.evaluate(() => localStorage.getItem("token"));

  await page.goto(`${BASE}/he/producer/${FIX.producer_id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // innerText, NOT textContent: textContent also returns the text nodes of
  // <script> elements, and Next embeds the whole i18n/RSC payload there — so
  // every Hebrew string in the bundle, including "בית עסק לא נמצא", matches
  // regardless of what is on screen. innerText is what the user can read.
  const body = await page.evaluate(() => document.body.innerText);
  const rendered = body.includes("חוות הבדיקה QA");
  const tokenAfter = await page.evaluate(() => localStorage.getItem("token"));

  check("A1 producer page renders with an expired token", rendered);
  check("A2 no 404 / error copy visible", !body.includes("בית עסק לא נמצא"));
  check(
    "A2b the producer fetch itself returned 200 (not the enumeration 404)",
    calls.some((c) => c.startsWith("200 GET") && c.includes(`/api/producers/${FIX.producer_id}`))
  );
  check("A3 token was healed by the silent refresh", tokenAfter !== tokenBefore && !!tokenAfter);
  check("A4 backend actually issued a 401 (contract exercised, not bypassed)",
    calls.some((c) => c.startsWith("401")), calls.filter((c) => c.startsWith("401"))[0] || "none seen");
  check("A5 a refresh call was made", calls.some((c) => c.includes("/api/auth/refresh")));

  fs.writeFileSync(path.join(OUT, "scenarioA-network.txt"), calls.join("\n"));
  await page.screenshot({ path: path.join(OUT, "A-producer-page-375.png"), fullPage: false });
  await ctx.close();
}

// ---------------------------------------------------------------- Scenario B
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "he-IL" });
  const page = await ctx.newPage();
  const calls = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/")) calls.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")}`);
  });

  await login(page);
  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await dismissCookies(page);

  // Pre-flight chrome, then the wizard opens at DETAILS for a logged-in user.
  const start = page.locator('[data-testid="register-preflight-start"]');
  if (await start.count()) await start.click();
  await page.waitForSelector('[data-testid="register-frame-details"]', { timeout: 20000 });

  await page.fill('[data-testid="register-details-name"]', `חוות השדרוג QA ${Date.now().toString().slice(-6)}`);
  await page.fill('[data-testid="register-details-phone"]', "0501234567");
  const cityInput = page.locator('[data-testid="register-details-city"] input').first();
  if (await cityInput.count()) {
    await cityInput.fill("תל אביב");
    await page.waitForTimeout(900);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }
  await page.screenshot({ path: path.join(OUT, "B1-details-375.png") });
  await page.click('[data-testid="register-details-next"]');

  await page.waitForSelector('[data-testid="register-frame-category"]', { timeout: 20000 });
  // Categories are chip buttons (CategorySelector.jsx:212), not checkboxes.
  // Pick a category that is NOT in LICENSE_REQUIRED_CATEGORIES
  // (backend/app/constants.py:26) — a licensed one blocks the step behind a
  // mandatory "מספר רישיון יצרן" field, which has nothing to do with MEH-1627.
  const cat = page.locator('[data-testid^="category-chip-"]', { hasText: "סבונים טבעיים" }).first();
  await cat.waitFor({ timeout: 20000 });
  await cat.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "B2-category-375.png") });
  await page.click('[data-testid="register-category-next"]');

  await page.waitForSelector('[data-testid="register-frame-story"]', { timeout: 20000 });
  const tagline = page.locator('[data-testid="register-story-tagline"]');
  if (await tagline.count()) await tagline.fill("תוצרת טרייה מהחווה");
  const referral = page.locator('[data-testid="register-referral-source"]');
  if (await referral.count()) {
    const opts = await referral.locator("option").all();
    for (const o of opts) {
      const v = await o.getAttribute("value");
      if (v && v !== "" && v !== "other") { await referral.selectOption(v); break; }
    }
  }

  // The story step gates submit behind a description plus two affirmative
  // consents — ToS/privacy and the MEH-759 binding licensing declaration.
  const story = page.locator('[data-testid="register-frame-story"] textarea').last();
  if (await story.count()) {
    await story.fill(
      "התחלנו בסבונים טבעיים במטבח הביתי לפני שש שנים, אחרי שחיפשנו מוצר עדין לעור רגיש ולא מצאנו. " +
      "היום אנחנו מייצרים בעבודת יד סדרות קטנות משמן זית מקומי ומצמחי מרפא שאנחנו מגדלים בעצמנו. " +
      "כל סבון נחתך ומיובש בנפרד, וכל סדרה מקבלת את הזמן שהיא צריכה."
    );
  }
  const boxes = page.locator('[data-testid="register-frame-story"] input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i++) {
    const b = boxes.nth(i);
    if (!(await b.isChecked())) await b.check();
  }
  await page.waitForTimeout(300);

  // ---- the moment under test: expire the token immediately before submit ----
  await tamper(page);
  await page.screenshot({ path: path.join(OUT, "B3-story-before-submit-375.png") });

  await page.click('[data-testid="register-story-submit"]');
  await page.waitForTimeout(6000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const body = await page.evaluate(() => document.body.innerText);
  const reached422 = body.includes(BAD_422);
  // Two shapes count as success. A *new* registration lands on the CONFIRM
  // frame; an *upgrade* (this scenario) calls refreshUser() first, so by the
  // time the wizard re-renders the user already owns a producer and the
  // component shows its "your business page exists -> dashboard" gate
  // (RegisterProducerClient.jsx:424). Both mean the POST went through.
  const confirmed =
    (await page.locator('[data-testid="register-frame-confirm"]').count()) > 0 ||
    (await page.locator('[data-testid="photo-disclosure-success"]').count()) > 0 ||
    (await page.locator('[data-testid="register-producer-gate"]').count()) > 0 ||
    body.includes("כבר יש לך עמוד עסק");

  const regCalls = calls.filter((c) => c.includes("/api/auth/register/producer"));
  check("B1 submit did NOT hit the 422 dead end", !reached422);
  check("B2 CONFIRM step reached (submit succeeded)", confirmed);
  check("B3 the upgrade POST 401'd first (contract exercised)",
    regCalls.some((c) => c.startsWith("401")), regCalls.join(" | ") || "none");
  check("B4 a refresh call was made", calls.some((c) => c.includes("/api/auth/refresh")));
  check("B5 the POST was replayed and succeeded",
    regCalls.some((c) => c.startsWith("200")), regCalls.join(" | ") || "none");

  fs.writeFileSync(path.join(OUT, "scenarioB-network.txt"), calls.join("\n"));
  await page.screenshot({ path: path.join(OUT, "B4-confirm-375.png"), fullPage: false });
  await ctx.close();
}

await browser.close();

fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
