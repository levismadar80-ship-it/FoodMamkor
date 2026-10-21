/**
 * Module:   qa-meh2210-rejected-banner
 * Purpose:  @375 evidence for MEH-2210's last open DoD line — the rejected
 *           banner's five reason-code variants and its three resubmission
 *           states, captured from the REAL dashboard route with the REAL
 *           he.json copy.
 * Bound:    The API is STUBBED. This proves the banner renders what the
 *           payload says; it does NOT prove the backend produces that payload
 *           — tests/test_producer_resubmit.py (16 cases) owns that half, and
 *           the sandbox has no Postgres and no DATABASE_URL, so a live
 *           round-trip is not available here. Stated so the bundle is not
 *           read as a full-stack pass.
 * Control:  Every shot asserts its expected Hebrew string BEFORE capturing.
 *           A page that rendered an error boundary, or a banner that lost its
 *           copy, fails the run instead of producing a screenshot nobody
 *           re-reads. That is the MEH-1786 failure this file exists to avoid:
 *           six PNGs written, six successes logged, an error boundary
 *           photographed.
 * Run:      node qa-meh2210-rejected-banner.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3000"; // `next start` default; no env knob (rule 8)
const OUT = "../qa-artifacts/MEH-2210";
const MAX = 3;

// he.json → dashboard.producer.status.rejected.*  (asserted, not decorative)
const TITLE = "הבקשה לא אושרה — אפשר לתקן ולשלוח שוב";
const CTA = "שליחה לבדיקה חוזרת";
const CAPPED = "הגעתן למספר השליחות המקסימלי.";
const BY_CODE = {
  missing_docs: "חסרים מסמכים, או שלא ניתן לקרוא אותם",
  missing_image: "חסרה תמונה ראשית",
  incomplete_info: "פרטי העסק לא מלאים (כתובת / טלפון / תיאור)",
  not_eligible: "בית העסק לא עומד בתנאי הפלטפורמה",
};

const REASON = "הרישיון שצורף לא נקרא. אנא העלו קובץ ברור.";

const CASES = [
  { name: "01-missing_docs-count0", code: "missing_docs", count: 0, expect: [TITLE, BY_CODE.missing_docs, CTA] },
  { name: "02-missing_image-count0", code: "missing_image", count: 0, expect: [TITLE, BY_CODE.missing_image, CTA] },
  { name: "03-incomplete_info-count1", code: "incomplete_info", count: 1, expect: [TITLE, BY_CODE.incomplete_info, CTA] },
  { name: "04-not_eligible-count2", code: "not_eligible", count: 2, expect: [TITLE, BY_CODE.not_eligible, CTA] },
  { name: "05-other-count0", code: "other", count: 0, expect: [TITLE, REASON, CTA] },
  { name: "06-legacy-null-code-count0", code: null, count: 0, expect: [TITLE, REASON, CTA] },
  { name: "07-capped-count3", code: "missing_image", count: MAX, expect: [TITLE, CAPPED] },
];

const user = (code, count) => ({
  id: 4242, email: "qa-meh2210@example.com", role: "producer", full_name: "בדיקת MEH-2210",
  producer_rejection_reason: REASON,
  producer_rejection_reason_code: code,
  producer_resubmission_count: count,
});

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  // The repo pins a Playwright whose bundled revision is not the one this
  // sandbox preinstalled (it expects chromium_headless_shell-1234 and has
  // -1194), and `playwright install` is forbidden here. So probe the
  // preinstalled locations and fall through to Playwright's own bundled
  // browser when none is present — which is what CI wants.
  //
  // Deliberately NOT an env var: regression rule 8 requires new env vars to be
  // declared and confirmed, and `Env drift (.env.example)` reds a PR that
  // reads one without documenting it. A throwaway QA knob does not justify
  // widening the runtime env surface, so this auto-detects instead.
  const candidates = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
  ];
  const executablePath = candidates.find((p) => existsSync(p));
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  if (executablePath) console.log(`chromium: ${executablePath}`);
  else console.log("chromium: Playwright bundled default");
  const failures = [];
  const ran = [];

  for (const c of CASES) {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 900 },
      deviceScaleFactor: 2,
      locale: "he-IL",
    });
    await ctx.addInitScript(() => localStorage.setItem("token", "qa-meh2210-stub"));

    const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    // ORDER MATTERS: Playwright matches the LAST registered route first, so the
    // catch-all goes FIRST or it swallows every specific stub below it and the
    // page renders the access-denied state instead of the dashboard. Measured
    // — with the catch-all last, /api/auth/me returned {} and `user.role` was
    // undefined, so the layout gate (layout.js:116) denied every case.
    await ctx.route("**/api/**", (r) => r.fulfill(json({})));
    await ctx.route("**/api/auth/me", (r) => r.fulfill(json(user(c.code, c.count))));
    await ctx.route("**/api/producers/me/dashboard", (r) =>
      r.fulfill(json({ producer: { id: 7, name: "בדיקת MEH-2210", status: "rejected", availability_state: "available" }, products: [], stats: {} })));
    await ctx.route("**/api/producers/me/analytics", (r) => r.fulfill(json({})));
    await ctx.route("**/api/producers/me", (r) =>
      r.fulfill(json({ id: 7, name: "בדיקת MEH-2210", status: "rejected", rejection_reason: REASON, rejection_reason_code: c.code, resubmission_count: c.count })));

    const page = await ctx.newPage();
    await page.goto(`${BASE}/producer/dashboard`, { waitUntil: "domcontentloaded" });

    let bad = null;
    for (const s of c.expect) {
      try {
        await page.getByText(s, { exact: false }).first().waitFor({ state: "visible", timeout: 15_000 });
      } catch {
        bad = s;
        break;
      }
    }
    // The capped case must ALSO prove the CTA is gone — an assertion that only
    // adds strings cannot detect a button that should have disappeared.
    if (!bad && c.name.includes("capped")) {
      const n = await page.getByRole("button", { name: CTA }).count();
      if (n !== 0) bad = `CTA still present (${n}) at the cap`;
    }

    if (bad) {
      failures.push(`${c.name}: missing/!expected → ${bad}`);
      await page.screenshot({ path: `${OUT}/FAILED-${c.name}.png`, fullPage: true });
    } else {
      await page.screenshot({ path: `${OUT}/${c.name}.png`, fullPage: true });
      ran.push(c.name);
    }
    await ctx.close();
  }
  await browser.close();

  // Derived, never stated — a hardcoded count goes stale the moment a case is
  // added (MEH-1976).
  console.log(`captured ${ran.length}/${CASES.length}: ${ran.join(" ")}`);
  if (failures.length) {
    console.error(`FAILED ${failures.length}:`);
    for (const f of failures) console.error("  " + f);
    process.exit(1);
  }
  console.log("all cases rendered their expected copy at 375px");
};

run();
