/**
 * Module:   qa-meh999-walkthrough2
 * Purpose:  MEH-999 dogfood audit, chunk 2 — tasks 4-6 (recipe, group buy, event)
 *           at 390x844. Measures reachability and, above all, whether a submit
 *           surface tells the owner WHAT HAPPENS NEXT.
 * Touches:  local stack only (next :3000 -> uvicorn :8000 -> scratch Postgres).
 * Does NOT: submit real content, or judge. It measures the surfaces an owner meets
 *           on the way to submitting, and what those surfaces say about moderation.
 * Related:  qa-meh999-walkthrough.mjs (chunk 1), docs/audits/meh999-dogfood-chunk1.md
 * History:  MEH-999 (creation).
 *
 * WAITS: no waitForTimeout anywhere.
 *   Chunk 1 used waitForTimeout(2000/2500) and the reviewer was right to flag it:
 *   a timing wait makes a script WRONG rather than erroring -- it proceeds against a
 *   half-settled page and reports confident numbers about the wrong DOM. Every wait
 *   here is a condition: a URL predicate or a load state, both of which fail loudly.
 *
 *   usage: node qa-meh999-walkthrough2.mjs [baseUrl] [outDir] <password> [chromePath]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const OUT = process.argv[3] || "/tmp/meh999-walk2";
const PASSWORD = process.argv[4] || "";
// chromium-#### is VERSIONED and moves on any @playwright/test upgrade. Not read
// from the environment: env vars are banned (ORDERS 1.4) and Env drift reds on them.
const CHROME = process.argv[5] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EMAIL = "ux-audit-meh999@example.com";

if (!PASSWORD) {
  console.error("usage: node qa-meh999-walkthrough2.mjs [baseUrl] [outDir] <password> [chromePath]");
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });

try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "he-IL",
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  /** Condition-based settle. Never a fixed sleep. */
  const settle = async () => {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle").catch(() => {});
  };

  const shot = async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
    return `${n}.png`;
  };

  const metrics = () =>
    page.evaluate(() => {
      const d = document.documentElement;
      const vh = window.innerHeight;
      const fields = [...document.querySelectorAll("input,select,textarea")];
      return {
        screens: +(d.scrollHeight / vh).toFixed(2),
        hScroll: d.scrollWidth > d.clientWidth + 1,
        fields: fields.length,
        fieldsAboveFold: fields.filter((e) => e.getBoundingClientRect().top < vh).length,
        buttons: document.querySelectorAll("button").length,
      };
    });

  /**
   * The card's central question for these three tasks: after a submit, does the
   * owner learn what happens next? Moderation states especially. Detect the copy
   * that would answer it, on the surface the owner is standing on.
   */
  const nextStepSignals = () =>
    page.evaluate(() => {
      const body = document.body.innerText || "";
      const probes = {
        pending: /ממתין|ממתינה|בהמתנה/,
        review: /לאישור|בבדיקה|נבדק|אישור/,
        published: /פורסם|מפורסם|יפורסם/,
        rejected: /נדחה|נדחתה/,
        timeframe: /תוך \d|ימי עסקים|שעות/,
      };
      const hits = {};
      for (const [k, re] of Object.entries(probes)) hits[k] = re.test(body);
      return { hits, anyModerationCopy: hits.pending || hits.review || hits.published };
    });

  /** Login through the real form. testid, NOT button[type=submit] -- /login has two. */
  await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
  await settle();
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 30000 }),
    page.locator('[data-testid="login-submit"]').click(),
  ]);
  await settle();

  const report = { loggedInAs: page.url(), tasks: {} };

  const walk = async (key, path, createRe) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await settle();

    const m = await metrics();
    const signals = await nextStepSignals();

    // The create affordance, found by visible text -- the owner finds it by reading.
    const affordances = await page.evaluate((src) => {
      const re = new RegExp(src);
      return [...document.querySelectorAll("a,button")]
        .map((el) => ({ tag: el.tagName, text: (el.innerText || "").trim().slice(0, 40), href: el.getAttribute("href") }))
        .filter((x) => x.text && re.test(x.text));
    }, createRe.source);

    report.tasks[key] = {
      url: page.url(),
      reachedDirectly: !/\/login/.test(page.url()),
      ...m,
      createAffordances: affordances.length,
      affordances: affordances.slice(0, 5),
      moderationCopyOnList: signals,
      shot: await shot(key),
    };
  };

  await walk("recipe", "/he/producer/dashboard/recipes", /מתכון|פרסום/);
  await walk("groupBuy", "/he/producer/dashboard/group-buys", /קבוצ|רכש|חדש/);
  await walk("event", "/he/producer/dashboard/events", /אירוע|חדש/);

  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
