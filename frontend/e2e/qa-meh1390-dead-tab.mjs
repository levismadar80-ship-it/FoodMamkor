/**
 * MEH-1390 — is the מוצרים / משלוח tab a dead click when its section is absent?
 *
 * Run against LIVE STAGING, which does NOT carry the fix (that is PR #2242,
 * held behind a merge-block marker). So this measures the BUG, not the fix.
 *
 * The dead-click claim has three parts and each is measured separately, because
 * "the tab is present" and "the tab does nothing" are different facts:
 *   1. the tab button exists in the tab bar
 *   2. its target `#section-*` does NOT exist in the DOM
 *   3. clicking it does not move the scroll position
 *
 * A tab that is present, targetless AND inert is a dead click. Any one of the
 * three alone is not.
 *
 * Run: node e2e/qa-meh1390-dead-tab.mjs [baseURL]
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] || "https://staging.mehamakor.online";
const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const OUT = new URL("../../qa-artifacts/MEH-1390", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  viewport: { width: 375, height: 667 },
  locale: "he",
  extraHTTPHeaders: SECRET
    ? { "x-vercel-protection-bypass": SECRET, "x-vercel-set-bypass-cookie": "true" }
    : {},
});
const page = await ctx.newPage();
await page.goto(`${BASE}/he`, { waitUntil: "domcontentloaded", timeout: 60000 });

const get = (p) =>
  page.evaluate(async (path) => {
    const r = await fetch(path, { headers: { accept: "application/json" } });
    return r.json().catch(() => null);
  }, p);

// ── pick the two producers by the SECTION conditions, not by eye ────────────
// products section  ← products.length || top_product_name || starting_price_label
// delivery section  ← offers_delivery || delivery_areas.length || pickup_points
const list = (await get("/api/producers?limit=100&offset=0")) || [];
const rows = [];
for (const p of list) {
  const d = (await get(`/api/producers/${p.id}`)) || {};
  const hasProducts =
    (d.products?.length || 0) > 0 || !!d.top_product_name || !!d.starting_price_label;
  const hasDelivery =
    d.offers_delivery === true || (d.delivery_areas?.length || 0) > 0 || d.pickup_points === true;
  rows.push({ id: p.id, name: p.name, hasProducts, hasDelivery });
}

const withBoth = rows.find((r) => r.hasProducts && r.hasDelivery);
const withNeither = rows.find((r) => !r.hasProducts && !r.hasDelivery);

console.log("candidates:");
console.log(`  WITH both    : ${withBoth ? `${withBoth.name} (#${withBoth.id})` : "NONE FOUND"}`);
console.log(`  WITH neither : ${withNeither ? `${withNeither.name} (#${withNeither.id})` : "NONE FOUND"}`);
if (!withNeither)
  console.log(
    "  ! no producer on this seed lacks BOTH sections — reporting that rather than\n" +
      "    substituting a weaker case and calling it the same test.",
  );
console.log("");

async function probe(label, producer) {
  if (!producer) return null;
  await page.goto(`${BASE}/he/producer/${producer.id}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page
    .getByRole("button", { name: /קבלו הכל|רק הכרחיים/ })
    .first()
    .click({ timeout: 4000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  const tabs = await page
    .locator('nav a[href^="#section-"], nav button, [role="tablist"] button, [role="tablist"] a')
    .evaluateAll((els) => els.map((e) => e.textContent.trim()).filter(Boolean));

  const sections = await page.evaluate(() =>
    [...document.querySelectorAll('[id^="section-"]')].map((e) => e.id),
  );

  const result = { label, name: producer.name, id: producer.id, tabs, sections, clicks: {} };

  // Is the page scrollable at all? If it is not, "the click did not scroll"
  // proves nothing — every tab would look dead. This is the alternative
  // explanation that has to be excluded before the word "dead" is used.
  result.scrollable = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );

  // The tabs are <button>s driving JS scroll (href is null), so there is no
  // declared target to read. ביקורות / אודות are therefore the CONTROL: on the
  // SAME page, a working tab must move the scroll. If the control moves and
  // מוצרים does not, the difference is the tab — not the page.
  for (const key of ["ביקורות", "אודות", "מוצרים", "משלוח"]) {
    const tab = page.getByRole("link", { name: key }).or(page.getByRole("button", { name: key })).first();
    const present = (await tab.count().catch(() => 0)) > 0;
    if (!present) {
      result.clicks[key] = { present: false };
      continue;
    }
    // READ the target instead of assuming it. The first pass guessed
    // "#section-delivery" and measured targetExists=false on a page where the
    // tab demonstrably worked — the guess, not the tab, was wrong.
    const href = await tab.getAttribute("href").catch(() => null);
    const targetId = href?.startsWith("#") ? href.slice(1) : null;
    const targetExists = targetId
      ? await page.evaluate((id) => !!document.getElementById(id), targetId)
      : null;

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    // "Did not scroll" is ambiguous when the target is already on screen, so
    // record that separately — otherwise a short page reads as a dead click.
    const targetInViewAtTop = targetId
      ? await page.evaluate((id) => {
          const el = document.getElementById(id);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.top < window.innerHeight;
        }, targetId)
      : null;

    const before = await page.evaluate(() => window.scrollY);
    await tab.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => window.scrollY);
    result.clicks[key] = {
      present: true,
      href,
      targetId,
      targetExists,
      targetInViewAtTop,
      before,
      after,
      moved: after !== before,
    };
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${label}-375.png` });
  return result;
}

const a = await probe("with-sections", withBoth);
const b = await probe("without-sections", withNeither);

for (const r of [a, b].filter(Boolean)) {
  console.log(`── ${r.label}: ${r.name} (#${r.id})`);
  console.log(`   tabs rendered : ${JSON.stringify(r.tabs)}`);
  console.log(`   sections in DOM: ${JSON.stringify(r.sections)}`);
  console.log(`   scrollable by  : ${r.scrollable}px`);
  for (const [k, v] of Object.entries(r.clicks)) {
    if (!v.present) {
      console.log(`   tab "${k}": ABSENT (correctly hidden)`);
      continue;
    }
    // Dead click = the tab is offered, its declared target does not exist, and
    // the click changes nothing. All three, or it is not a dead click.
    const dead = !v.moved;
    console.log(
      `   tab "${k}": href=${v.href} targetExists=${v.targetExists} ` +
        `inViewAtTop=${v.targetInViewAtTop} scroll ${v.before}→${v.after} moved=${v.moved}` +
        (dead ? "   ← DEAD CLICK" : ""),
    );
  }
  console.log("");
}

await ctx.close();
await browser.close();
