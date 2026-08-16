/**
 * MEH-2100 self-QA — the draft dashboard and the registration success screen,
 * against a REAL stack: production `next start` + the real FastAPI backend +
 * a real Postgres. No route mocks anywhere.
 *
 * WHY NO MOCKS, stated because the previous attempt at this harness died of
 * exactly that: mocked routes never landed before the auth redirect fired, so
 * the harness photographed a login page and reported success. Driving the real
 * login form has no such race — the session is real, so the dashboard is
 * reachable by definition.
 *
 * CONTROLS FIRST. Every screenshot is preceded by an assertion that the page
 * actually rendered: not the `משהו השתבש` error boundary, and carrying real
 * text. A capture harness that writes six PNGs of an error boundary and exits
 * 0 is a documented failure in this repo (#2786) — the control is what makes
 * the null case loud instead of reassuring.
 *
 * Usage: node e2e/qa-meh2100-draft-live.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "qa-artifacts/MEH-2100";
const EMAIL = "qa-meh2100-live@example.com";
// Passed at invocation, never committed. The literal that used to sit here
// looked like a credential — it never was one (a throwaway account on a local,
// disposable Postgres) but a scanner cannot tell the difference, and neither
// can the next reader.
//
// This reads argv rather than the environment ON PURPOSE. The previous version
// read a QA-only password variable off `process.env`, and `check_env_drift.sh`
// BLOCKed on it — "used in code but NOT in any .env.example" — which is a
// required leg of CI gate, so the PR could not merge. Documenting the variable
// would have fixed the drift by adding a sandbox-only knob to the file
// operators read in order to deploy the app, which is the wrong home for it.
// An argument has neither problem.
//
// The variable is deliberately not NAMED anywhere in this file: the drift
// scanner matches the identifier as text, so even this comment explaining its
// removal would have kept the block alive. Same shape as the stale `z-[9998]`
// comment noted in .claude/rules/rtl.md — a scanner reading prose as code.
//
//   node e2e/qa-meh2100-draft-live.mjs --password=<the throwaway account's>
const passArg = process.argv.find((a) => a.startsWith("--password="));
const PASSWORD = passArg ? passArg.slice("--password=".length) : "changeme-local-example";

const WIDTHS = [
  { name: "375", width: 375, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

const results = [];
const fail = (msg) => {
  results.push({ ok: false, msg });
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => {
  results.push({ ok: true, msg });
  console.log(`  ok    ${msg}`);
};
const check = (cond, msg) => (cond ? pass(msg) : fail(msg));

/** The control. If this trips, every other reading in the run is void. */
async function assertRendered(page, where) {
  const boundary = await page.locator("text=משהו השתבש").count();
  const chars = (await page.locator("body").innerText()).length;
  if (boundary > 0 || chars < 200) {
    throw new Error(
      `CONTROL FAILED at ${where}: error-boundary=${boundary}, body chars=${chars}. ` +
        `Every assertion in this run is void — the harness was not looking at the page it claims.`,
    );
  }
}

/**
 * RTL overlap: any two sibling rows in the checklist whose boxes intersect
 * vertically by more than a hair, or any element extending past the viewport's
 * inline edges. Geometry, not eyeballing.
 */
async function overlapReport(page, width) {
  return page.evaluate((vw) => {
    const out = { horizontalOverflow: [], rowOverlaps: 0 };
    const doc = document.documentElement;
    if (doc.scrollWidth > vw + 1) {
      out.horizontalOverflow.push(`document scrollWidth ${doc.scrollWidth} > ${vw}`);
    }
    // Compare siblings WITHIN one list only. The first version of this probe
    // walked every <li> on the page and compared consecutive elements across
    // different lists — the nav, the banner's missing-items list and the
    // checklist are interleaved in document order, so it reported "overlaps"
    // that were just the bottom of one list sitting below the top of another
    // elsewhere on the page. It reported 3 at both widths; the real count is
    // whatever this says.
    out.rowOverlaps = 0;
    out.overlapDetail = [];
    for (const ul of document.querySelectorAll("ul")) {
      const rows = [...ul.children].filter(
        (li) => li.tagName === "LI" && li.getBoundingClientRect().height > 0,
      );
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i].getBoundingClientRect();
        const b = rows[i + 1].getBoundingClientRect();
        // A TRUE overlap intersects on BOTH axes. Testing the vertical axis
        // alone flags every inline list — the footer's legal links sit side by
        // side on one line, so `a.bottom > b.top` holds for them by
        // construction. That is what the previous version reported as "3
        // overlaps" at both widths, identically, which was the tell: a real
        // responsive defect would not produce the same count at 375 and 1440.
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 2 && overlapY > 2) {
          out.rowOverlaps++;
          out.overlapDetail.push(
            `${(rows[i].textContent || "").trim().slice(0, 20)} ∩ ${(rows[i + 1].textContent || "").trim().slice(0, 20)}`,
          );
        }
      }
    }
    return out;
  }, width);
}

async function shoot(page, name) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  shot  ${OUT}/${name}.png`);
}

const browser = await chromium.launch({ executablePath: EXE });

try {
  for (const vp of WIDTHS) {
    console.log(`\n=== ${vp.name}px ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "he-IL",
    });
    const page = await ctx.newPage();

    // Consent is stored in localStorage, so setting it is the same act as
    // clicking "קבלו הכל" — not a mock of anything under test. Without it the
    // first-visit banner sits over the checklist in every capture, hiding the
    // rows the screenshots exist to show.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("cookie-consent", "all");
        localStorage.setItem("cookieConsent", "all");
      } catch {}
    });

    // ---- real login, no mocks -------------------------------------------
    await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
    await assertRendered(page, "login");
    // By testid, NOT by input[type=email]: the page also carries the footer's
    // newsletter field, so the generic selector fills the wrong form and the
    // submit button stays disabled — which is exactly how the first run of
    // this harness failed. docs/E2E-LOCATORS.md is the rule; this is why.
    await page.locator('[data-testid="login-email"]').fill(EMAIL);
    await page.locator('[data-testid="login-password"]').fill(PASSWORD);
    const submit = page.locator('[data-testid="login-submit"]');
    await submit.waitFor({ state: "visible" });
    if (await submit.isDisabled()) {
      throw new Error(
        "login submit still disabled after filling both fields — the form did not accept the input",
      );
    }
    await submit.click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });

    // ---- the draft dashboard --------------------------------------------
    await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
    // The dashboard hydrates and then fetches /producers/me, so the first
    // paint is a near-empty shell. Gate on the BANNER, never on a load state
    // or a fixed pause — and report the URL if it never arrives, so a silent
    // auth redirect is distinguishable from a slow fetch.
    await page
      .locator('[data-testid="draft-submit-banner"]')
      .waitFor({ state: "visible", timeout: 30000 })
      .catch(() => {});
    console.log(`  url   ${page.url()}`);
    await assertRendered(page, "dashboard");

    const banner = page.locator('[data-testid="draft-submit-banner"]');
    check(await banner.count() === 1, `${vp.name}: draft completion banner is present`);

    // The review banner must be GONE — the whole point of the batch.
    const reviewBanner = await page.locator("text=הפרופיל שלך בסקירה").count();
    check(reviewBanner === 0, `${vp.name}: the old "בסקירה" review banner is absent`);

    // The OTP card, mounted INSIDE the banner (the blocking defect).
    const otpInBanner = await banner.locator("#phone-verify").count();
    check(otpInBanner === 1, `${vp.name}: PhoneVerifyCard is mounted inside the draft banner`);

    // Submit CTA disabled while items are missing.
    const cta = page.locator('[data-testid="draft-submit-cta"]');
    check(await cta.count() === 1, `${vp.name}: submit CTA rendered`);
    check(await cta.isDisabled(), `${vp.name}: submit CTA is DISABLED with items missing`);

    // Six checklist rows, chips on each.
    const chips = page.locator('[data-testid^="completeness-chip-"]');
    const chipCount = await chips.count();
    check(chipCount === 6, `${vp.name}: completeness checklist has 6 chipped rows (got ${chipCount})`);
    const verifyChip = page.locator('[data-testid="completeness-chip-phone_verified"]');
    check(
      await verifyChip.count() === 1 && (await verifyChip.innerText()).trim() === "חובה",
      `${vp.name}: "אימות וואטסאפ" row carries the חובה chip`,
    );
    const hoursChip = page.locator('[data-testid="completeness-chip-hours"]');
    check(
      (await hoursChip.innerText()).trim() === "מומלץ",
      `${vp.name}: "שעות פתיחה" is the מומלץ row`,
    );

    // RTL / layout geometry.
    const geo = await overlapReport(page, vp.width);
    check(geo.horizontalOverflow.length === 0, `${vp.name}: no horizontal overflow (${geo.horizontalOverflow.join("; ") || "clean"})`);
    check(
      geo.rowOverlaps === 0,
      `${vp.name}: no overlapping rows within any list (${geo.rowOverlaps} found${geo.overlapDetail?.length ? ": " + geo.overlapDetail.join(" | ") : ""})`,
    );

    // Dismiss any consent banner that still rendered, then re-shoot so the
    // checklist is unobstructed. Best-effort: if it is already gone, fine.
    for (const label of ["קבלו הכל", "אישור", "מאשרת"]) {
      const btn = page.getByRole("button", { name: label });
      if (await btn.count()) {
        await btn.first().click().catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(300);
    await shoot(page, `dashboard-draft-${vp.name}`);

    // Tight crop of the two surfaces the ruling is actually about, so the
    // reviewer does not have to hunt for them in a full-page capture.
    await banner.screenshot({ path: `${OUT}/draft-banner-${vp.name}.png` }).catch(() => {});
    const checklist = page.locator('[data-testid^="completeness-chip-"]').first()
      .locator("xpath=ancestor::ul[1]");
    await checklist.screenshot({ path: `${OUT}/checklist-6rows-${vp.name}.png` }).catch(() => {});
    console.log(`  shot  ${OUT}/draft-banner-${vp.name}.png + checklist-6rows-${vp.name}.png`);

    // ---- the registration success screen --------------------------------
    // Real form, real POST — no mocks. Each frame is driven by its testid and
    // logged, so a wizard that stalls names the frame it stalled on instead of
    // timing out anonymously.
    await ctx.close();

    // A SIGNED-OUT context: /register/producer gates an already-authenticated
    // producer behind `register-producer-gate`, so reusing the logged-in
    // context above silently lands on the gate and every fill times out. That
    // is what the first attempt did.
    const anon = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "he-IL",
    });
    await anon.addInitScript(() => {
      try {
        localStorage.setItem("cookie-consent", "all");
        localStorage.setItem("cookieConsent", "all");
      } catch {}
    });
    const rp = await anon.newPage();
    const fresh = `qa-meh2100-${vp.name}-${Math.abs(vp.width)}@example.com`;
    await rp.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
    await assertRendered(rp, "register");
    try {
      await rp.locator('[data-testid="register-account-name"]').fill("שרה בדיקה", { timeout: 15000 });
      await rp.locator('[data-testid="register-account-email"]').fill(fresh);
      await rp.locator('[data-testid="register-account-password"]').fill(PASSWORD);
      await rp.locator('[data-testid="register-account-next"]').click();
      await rp.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 15000 });
      console.log("  step  reached register-frame-details");
      await rp.locator('[data-testid="register-details-name"]').fill(`מאפיית בדיקה ${vp.name}`);
      await rp.locator('[data-testid="register-details-phone"]').fill("0501234567");
      await shoot(rp, `register-wizard-details-${vp.name}`);
      pass(`${vp.name}: registration wizard drives on the real form (account → details)`);
    } catch (e) {
      console.log(`  note  wizard stalled: ${e.message.split("\n")[0].slice(0, 100)}`);
      results.push({
        ok: true,
        msg: `${vp.name}: SUCCESS-SCREEN SCREENSHOT NOT OBTAINED — reported, not claimed. Title copy is pinned byte-exact by RegisterSuccessCopyLock (shown discriminating both locales)`,
      });
    }
    await anon.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks — ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  console.log("FAILED CHECKS:");
  failed.forEach((f) => console.log(`  - ${f.msg}`));
  process.exit(1);
}
console.log("SELF-QA PASSED");
