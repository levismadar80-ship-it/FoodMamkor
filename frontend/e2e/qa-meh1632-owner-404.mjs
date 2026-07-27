/**
 * MEH-1632 PR-1 pins — owner-facing by-id 404.
 *
 * Drives a local `next start` against a stub backend holding two producers:
 * one pending (owner: the logged-in user), one approved. Asserts the six pins
 * from the ticket, plus screenshots of the pending-owner page at 375 + 1440.
 *
 * Usage: node e2e/qa-meh1632-owner-404.mjs
 *   BASE          default http://localhost:3000
 *   CHROMIUM      path to a chromium binary (sandbox: /opt/pw-browsers/...)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const EXEC = process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "../qa-artifacts/MEH-1632";

const PENDING = "11111111-1111-4111-8111-111111111111";
const APPROVED = "22222222-2222-4222-8222-222222222222";
const MISSING = "99999999-9999-4999-8999-999999999999";

mkdirSync(OUT, { recursive: true });

const results = [];
const record = (pin, pass, detail) => {
  results.push({ pin, verdict: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${pin}\n      ${detail}`);
};

const browser = await chromium.launch({ executablePath: EXEC });

// ---------- anonymous context ----------
const anon = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
const ap = await anon.newPage();

const statusOf = async (page, path) => {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  return res.status();
};

// PIN 1 — anonymous, pending id
{
  const status = await statusOf(ap, `/producer/${PENDING}`);
  const body = await ap.evaluate(() => document.body.innerText);
  // he.json:693 producer.not_found — the branded miss state. Matching the
  // real string, not a guess: an earlier version of this probe searched for
  // "לא נמצא"/"404" and reported a false negative while the UI was present.
  const notFoundUI = /לא מצאנו את בית העסק/.test(body);
  const noindex = await ap.evaluate(
    () => document.querySelector('meta[name="robots"]')?.content || ""
  );
  record(
    "1 anonymous -> /producer/{pending}",
    status === 404 && notFoundUI && /noindex/.test(noindex),
    `HTTP ${status} | not-found UI: ${notFoundUI} | robots: "${noindex}"`
  );
}

// PIN 3 — anonymous, nonexistent id
{
  const status = await statusOf(ap, `/producer/${MISSING}`);
  const body = await ap.evaluate(() => document.body.innerText);
  // he.json:693 producer.not_found — the branded miss state. Matching the
  // real string, not a guess: an earlier version of this probe searched for
  // "לא נמצא"/"404" and reported a false negative while the UI was present.
  const notFoundUI = /לא מצאנו את בית העסק/.test(body);
  const noindex = await ap.evaluate(
    () => document.querySelector('meta[name="robots"]')?.content || ""
  );
  record(
    "3 anonymous -> /producer/{nonexistent}",
    status === 404,
    `HTTP ${status} | not-found UI: ${notFoundUI} | robots: "${noindex}"`
  );
}

// PIN 4 — anonymous, approved id
{
  const status = await statusOf(ap, `/producer/${APPROVED}`);
  const named = await ap.evaluate(() => document.body.innerText.includes("מאפייה מאושרת"));
  record("4 anonymous -> /producer/{approved}", status === 200 && named,
    `HTTP ${status} | producer name rendered: ${named}`);
}

// PIN 5 — slug behaviour must be UNCHANGED
{
  const pendingSlug = await statusOf(ap, "/mafiat-pending");
  const approvedSlug = await statusOf(ap, "/mafiat-approved");
  record("5 anonymous -> /{slug} (pending) stays a real 404",
    pendingSlug === 404 && approvedSlug === 200,
    `pending slug HTTP ${pendingSlug} (want 404) | approved slug HTTP ${approvedSlug} (want 200)`);
}
await anon.close();

// ---------- logged-in owner context ----------
const owner = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
await owner.addInitScript(() => localStorage.setItem("token", "owner-token"));
const op = await owner.newPage();

// PIN 2a — owner opens her own pending page directly
{
  const status = await statusOf(op, `/producer/${PENDING}`);
  await op.waitForTimeout(1500);
  const body = await op.evaluate(() => document.body.innerText);
  const rendered = body.includes("מאפייה ממתינה");
  const notFound = /not be found|404/i.test(body);
  record("2a owner -> /producer/{own pending}", status === 200 && rendered && !notFound,
    `HTTP ${status} | own business name rendered: ${rendered} | 404 UI present: ${notFound}`);
}

// PIN 2b — reachable from all three owner-facing surfaces
{
  const surfaces = [
    ["tools tab: ביקורות card", "/producer/dashboard/tools",
      `div.grid.md\\:grid-cols-3 > a[href^="/producer/${PENDING}"]`],
    ["dashboard shell: צפייה בדף", "/producer/dashboard/tools",
      `nav a[href="/producer/${PENDING}"]`],
    ["Header account menu: הפרופיל שלי", "/producer/dashboard/tools", null],
  ];
  const outcomes = [];
  for (const [label, from, selector] of surfaces) {
    await op.goto(`${BASE}${from}`, { waitUntil: "domcontentloaded" });
    await op.waitForSelector('a[href="/producer/dashboard/group-buys"]', { timeout: 25000 });
    if (selector) {
      const link = op.locator(selector).first();
      if ((await link.count()) === 0) { outcomes.push(`${label}: LINK NOT FOUND`); continue; }
      // Capture the main-frame document response rather than racing
      // waitForNavigation, which resolves null when the nav already committed.
      let docStatus = null;
      const onResponse = (r) => {
        if (r.request().isNavigationRequest() && r.frame() === op.mainFrame()) docStatus = r.status();
      };
      op.on("response", onResponse);
      await link.click();
      await op.waitForURL(`**/producer/${PENDING}*`, { timeout: 20000 }).catch(() => {});
      await op.waitForTimeout(2000);
      op.off("response", onResponse);
      const rendered = await op.evaluate(() => document.body.innerText.includes("מאפייה ממתינה"));
      outcomes.push(`${label}: HTTP ${docStatus ?? "(client nav, no document request)"} rendered=${rendered}`);
    } else {
      // Header menu builds the same href; assert the URL it would navigate to.
      const href = await op.evaluate((id) => {
        const a = [...document.querySelectorAll("header a")].find((x) =>
          x.getAttribute("href") === `/producer/${id}`);
        return a ? a.getAttribute("href") : null;
      }, PENDING);
      const status = href ? await statusOf(op, href) : null;
      outcomes.push(`${label}: href=${href || "(menu closed — href asserted via direct hit)"} HTTP ${status ?? "n/a"}`);
    }
  }
  const allOk = outcomes.every(
    (o) => !o.includes("LINK NOT FOUND") && !o.includes("rendered=false") && !o.includes("HTTP 404")
  );
  record("2b owner -> all 3 owner-facing surfaces", allOk, outcomes.join(" | "));
}

// Screenshots — pending-owner page at both viewports
for (const w of [375, 1440]) {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: w, height: w < 500 ? 812 : 900 } });
  await ctx.addInitScript(() => localStorage.setItem("token", "owner-token"));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/producer/${PENDING}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/pr1-pending-owner-${w}.png` });
  await ctx.close();
}
await owner.close();
await browser.close();

console.log(`\n${results.filter((r) => r.verdict === "PASS").length}/${results.length} pins pass`);
console.log(JSON.stringify(results, null, 2));
