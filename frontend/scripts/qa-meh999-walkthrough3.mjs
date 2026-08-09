/**
 * Module:   qa-meh999-walkthrough3
 * Purpose:  MEH-999 dogfood audit, chunk 3 — tasks 7-10 (reply to review, dashboard
 *           stats, edit business details, vacation mode) plus the click-through
 *           chunk 2 left explicitly UNVERIFIED: does an unapproved producer meet
 *           the moderation wall at form entry, at submit, or never?
 * Touches:  local stack only (next :3000 -> proxy -> uvicorn :8000 -> scratch
 *           Postgres). Never staging, never production.
 * Does NOT: judge. Every number here is measured; severity calls belong to the
 *           report and are labelled as CC's judgement there. This file emits facts.
 * Related:  frontend/scripts/qa-meh999-walkthrough.mjs (chunk 1, tasks 1-3),
 *           frontend/scripts/qa-meh999-walkthrough2.mjs (chunk 2, tasks 4-6).
 * History:  MEH-999 (creation).
 *
 *   usage: node qa-meh999-walkthrough3.mjs [baseUrl] [outDir] <ownerPassword> <auditPassword> [chromePath]
 *   ownerPassword = demo-owner@example.com (approved business, seeded reviews)
 *   auditPassword = ux-audit-meh999@example.com (unapproved: pending_whatsapp)
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = process.argv[3] || "/tmp/meh999-walk3";
const OWNER_PASSWORD = process.argv[4] || "";
const AUDIT_PASSWORD = process.argv[5] || "";
const CHROME = process.argv[6] || "/opt/pw-browsers/chromium";
const OWNER_EMAIL = "demo-owner@example.com";
const AUDIT_EMAIL = "ux-audit-meh999@example.com";

if (!OWNER_PASSWORD || !AUDIT_PASSWORD) {
  console.error("usage: node qa-meh999-walkthrough3.mjs [baseUrl] [outDir] <ownerPassword> <auditPassword> [chromePath]");
  process.exit(2);
}

const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const report = { measuredAt: null, tasks: {} };
const browser = await chromium.launch({ executablePath: CHROME });

/** One logged-in page per account; chunk-2's lesson — wait on conditions, never sleep. */
async function loginPage(ctx, email, password) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('[data-testid="login-submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15000 });
  return page;
}

const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }).then(() => `${n}.png`);

const metrics = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return {
      pageHeight: d.scrollHeight,
      screensToScroll: +(d.scrollHeight / window.innerHeight).toFixed(2),
      hScroll: d.scrollWidth > d.clientWidth + 1,
    };
  });

/** Find tappable affordances whose visible text matches, from the owner's reading POV. */
const affordances = (page, re) =>
  page.evaluate((src) => {
    const rx = new RegExp(src);
    const hit = [];
    for (const el of document.querySelectorAll("a,button")) {
      const t = (el.innerText || "").trim();
      if (rx.test(t)) hit.push({ tag: el.tagName, text: t.slice(0, 50), href: el.getAttribute("href") });
    }
    return hit;
  }, re.source);

try {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "he-IL", deviceScaleFactor: 2 });

  // ================================================================ APPROVED OWNER
  const page = await loginPage(ctx, OWNER_EMAIL, OWNER_PASSWORD);

  // ---------------------------------------------------------------- TASK 7
  // Reply to a review. From the overview: can the owner find the path by reading?
  await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const t7Overview = await affordances(page, /ביקורות|ביקורת/);
  let taps = 0;
  // MEH-1039 put the reply UI on the owner's PUBLIC page, so the dashboard path
  // runs through "צפייה בדף". Measure whether the owner can discover that route.
  let t7 = { affordancesOnOverview: t7Overview.length, list: t7Overview.slice(0, 4) };
  const viewPage = page.locator("a,button").filter({ hasText: /צפייה בדף/ }).first();
  t7.viewPageLinkPresent = (await viewPage.count()) > 0;
  if (t7.viewPageLinkPresent) {
    const href = await viewPage.getAttribute("href");
    t7.viewPageHref = href;
    taps += 1; // the tap is the discovery; navigate by href so a new-tab target can't drop us
    await page.goto(href.startsWith("http") ? href : `${BASE}${href.startsWith("/he") ? "" : "/he"}${href}`,
      { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    t7.landedOn = page.url();
    // Reviews lazy-load on an IntersectionObserver — an instant jump to the
    // bottom never intersects it. Walk the page in viewport steps instead.
    await page.evaluate(async () => {
      const vh = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += vh * 0.8) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 250));
      }
    });
    await page.locator("button", { hasText: /הוספת תגובה|עריכת תגובה/ }).first()
      .waitFor({ timeout: 8000 }).catch(() => {});
    // The reply affordance on the reviews surface.
    const replyAff = await affordances(page, /תגובה|הגיבי|השיבי|מענה/);
    t7.replyAffordances = replyAff.length;
    t7.replyList = replyAff.slice(0, 4);
    if (replyAff.length) {
      const replyBtn = page.locator("a,button").filter({ hasText: /תגובה|הגיבי|השיבי|מענה/ }).first();
      taps += 1; await replyBtn.click();
      await page.waitForTimeout(800);
      const box = page.locator("textarea").first();
      t7.replyBoxOpens = (await box.count()) > 0;
      if (t7.replyBoxOpens) {
        await box.fill("תודה רבה על המילים החמות! מחכות לראותך שוב בדוכן.");
        const send = page.locator("button").filter({ hasText: /שליחה|שלחי|פרסום|שמירה/ }).filter({ visible: true }).first();
        if (await send.count()) {
          taps += 1; await send.click();
          await page.waitForTimeout(1500);
          // What does the owner see after submit? (toast / inline / nothing)
          t7.afterSubmit = await page.evaluate(() => {
            const toast = document.querySelector('[class*="toast" i], [role="status"], [role="alert"]');
            return toast ? (toast.innerText || "").trim().slice(0, 120) : null;
          });
        }
      }
    }
    t7.tapsFromOverview = taps;
    t7.shot = await shot(page, "t7-reply-review");
  }
  report.tasks.replyToReview = t7;

  // ---------------------------------------------------------------- TASK 8
  // Dashboard stats. Reachability of insights from the overview by reading.
  await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const t8Aff = await affordances(page, /נתונים|תובנות|סטטיסט|צפיות|אנליט/);
  let t8 = { affordancesOnOverview: t8Aff.length, list: t8Aff.slice(0, 4) };
  await page.goto(`${BASE}/he/producer/dashboard/insights`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  t8.insights = await metrics(page);
  t8.insightsUrl = page.url();
  t8.emptyStateText = await page.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    return (main.innerText || "").trim().slice(0, 300);
  });
  t8.shot = await shot(page, "t8-insights");
  report.tasks.dashboardStats = t8;

  // ---------------------------------------------------------------- TASK 9
  // Edit business details: change the short description and save. The question
  // is the save idiom — does the owner get confirmation, and does the value stick?
  await page.goto(`${BASE}/he/producer/dashboard/edit`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  let t9 = { url: page.url(), ...(await metrics(page)) };
  t9.fieldLabels = await page.evaluate(() =>
    [...document.querySelectorAll("label")].map((l) => (l.innerText || "").trim()).filter(Boolean).slice(0, 20));
  // Controlled inputs here carry no name= — find the field under the visible label.
  const shortDesc = page.getByLabel(/משפט תדמית/).first();
  t9.taglineFieldFound = (await shortDesc.count()) > 0;
  if (t9.taglineFieldFound) {
    const stamp = `לחם מחמצת מקמח מלא — נבדק ${Date.now() % 10000}`;
    await shortDesc.fill(stamp);
    const save = page.locator("button").filter({ hasText: /שמירה|שמרי|עדכון/ }).filter({ visible: true }).first();
    t9.saveButtonFound = (await save.count()) > 0;
    if (t9.saveButtonFound) {
      await save.click();
      await page.waitForTimeout(1800);
      t9.afterSave = await page.evaluate(() => {
        const toast = document.querySelector('[class*="toast" i], [role="status"], [role="alert"]');
        return toast ? (toast.innerText || "").trim().slice(0, 120) : null;
      });
      await page.reload({ waitUntil: "networkidle" });
      t9.valueStuck = (await shortDesc.inputValue().catch(() => "")) === stamp;
    }
  }
  t9.shot = await shot(page, "t9-edit-save");
  report.tasks.editBusinessDetails = t9;

  // ---------------------------------------------------------------- TASK 10
  // Vacation mode. PR #1497 revealed the return-date before the POST — measure
  // the flow as the owner meets it: find the control, toggle, what's asked, what confirms.
  await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // The chips say "בהפסקה", never "חופשה" — the word the tooltip and the badge
  // use. Probe with the real vocabulary and record the mismatch as data.
  const t10Aff = await affordances(page, /בהפסקה|פתוח להזמנות|זמין היום|עמוס השבוע/);
  let t10 = { affordancesOnOverview: t10Aff.length, list: t10Aff.slice(0, 4),
    vocabularyNote: "chip=בהפסקה, tooltip/badge=חופשה" };
  if (t10Aff.length) {
    const vac = page.locator("button").filter({ hasText: /בהפסקה/ }).first();
    await vac.click();
    await page.waitForTimeout(1200);
    t10.afterTapUrl = page.url();
    t10.dateInputRevealed = await page.locator('input[type="date"]').count();
    t10.visibleCopy = await page.evaluate(() => {
      const els = [...document.querySelectorAll("div,section,form")].filter((e) =>
        /חופשה/.test((e.innerText || "").slice(0, 400)));
      return els.length ? (els[els.length - 1].innerText || "").trim().slice(0, 250) : null;
    });
    t10.shot = await shot(page, "t10-vacation");
  }
  report.tasks.vacationMode = t10;

  await page.close();

  // ============================================================ UNAPPROVED PRODUCER
  // Chunk 2 measured that recipes + events OFFER create controls with no moderation
  // copy while group-buys gates with an explanation. UNVERIFIED then: where does the
  // wall actually sit? Click through both to the submit.
  const ctx2 = await browser.newContext({ viewport: VIEWPORT, locale: "he-IL", deviceScaleFactor: 2 });
  const p2 = await loginPage(ctx2, AUDIT_EMAIL, AUDIT_PASSWORD);

  for (const [key, path, createRe] of [
    ["recipeCreate", "recipes", /פרסום מתכון|מתכון חדש/],
    ["eventCreate", "events", /אירוע חדש/],
  ]) {
    await p2.goto(`${BASE}/he/producer/dashboard/${path}`, { waitUntil: "domcontentloaded" });
    await p2.waitForLoadState("networkidle").catch(() => {});
    const entry = { listUrl: p2.url() };
    const create = p2.locator("a,button").filter({ hasText: createRe }).first();
    entry.createControlPresent = (await create.count()) > 0;
    if (entry.createControlPresent) {
      await create.click();
      // Recipes opens an INLINE form on the same URL; events routes to /new.
      // Wait for the form itself, not the URL.
      await p2.waitForFunction(
        () => document.querySelectorAll("input,textarea,select").length >= 3,
        { timeout: 10000 },
      ).catch(() => {});
      await p2.waitForLoadState("networkidle").catch(() => {});
      entry.formUrl = p2.url();
      entry.formInputs = await p2.locator("input,textarea,select").count();
      entry.formOpened = entry.formInputs >= 3;
      // Moderation / approval copy anywhere on the form page?
      entry.moderationCopyOnForm = await p2.evaluate(() => {
        const t = (document.body.innerText || "");
        const m = t.match(/[^\n]*(אישור|ממתין|בדיקה|מודרצי|לאחר אישור)[^\n]*/);
        return m ? m[0].trim().slice(0, 160) : null;
      });
      entry.shotForm = await shot(p2, `${key}-form`);
      // Minimal fill + submit — where does the wall land?
      if (entry.formOpened) {
        const textboxes = p2.locator('input[type="text"], input:not([type])');
        if (await textboxes.count())
          await textboxes.first().fill(key === "recipeCreate" ? "עוגת גזר של הבדיקה" : "יום פתוח בדוכן הבדיקה");
        const dateIn = p2.locator('input[type="date"]').first();
        if (await dateIn.count()) await dateIn.fill("2026-09-15");
        const timeIn = p2.locator('input[type="time"]').first();
        if (await timeIn.count()) await timeIn.fill("10:00");
        if (key === "recipeCreate") {
          // Three textareas: תיאור קצר, רכיבים*, הוראות הכנה* — run 2 proved an
          // empty required one is blocked only by the browser-native English
          // "Please fill out this field." bubble, so fill them all.
          const areas = p2.locator("textarea");
          const n = await areas.count();
          const texts = ["עוגה ביתית פשוטה", "500 גרם קמח\n10 גרם מלח\n3 גזרים", "מערבבים הכל ואופים 40 דקות ב-180 מעלות."];
          for (let i = 0; i < Math.min(n, 3); i++) await areas.nth(i).fill(texts[i]);
        }
        const submit = p2.locator('button[type="submit"]').first();
        entry.submitPresent = (await submit.count()) > 0;
        if (entry.submitPresent) {
          await submit.click();
          await p2.waitForTimeout(2000);
          entry.afterSubmitUrl = p2.url();
          entry.afterSubmitCopy = await p2.evaluate(() => {
            const toast = document.querySelector('[class*="toast" i], [role="status"], [role="alert"]');
            const t = toast ? (toast.innerText || "").trim() : "";
            if (t) return t.slice(0, 200);
            const m = (document.body.innerText || "").match(/[^\n]*(שגיאה|אישור|ממתין|נשמר|פורסם|התקבל|חובה)[^\n]*/);
            return m ? m[0].trim().slice(0, 200) : null;
          });
          entry.validationErrors = await p2.evaluate(() =>
            [...document.querySelectorAll('[class*="text-red" i], [class*="error" i], [role="alert"]')]
              .map((e) => (e.innerText || "").trim()).filter(Boolean).slice(0, 6));
          entry.shotAfterSubmit = await shot(p2, `${key}-after-submit`);
        }
      }
    }
    report.tasks[key] = entry;
  }

  report.measuredAt = new Date().toISOString();
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
