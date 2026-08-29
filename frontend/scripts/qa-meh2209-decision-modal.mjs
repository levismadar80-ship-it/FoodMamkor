/**
 * MEH-2209 self-QA — the admin producer decision modal, driven in a real
 * browser at 375 and 1440.
 *
 * Drives the REAL component (a local `next start` build), never a copy: every
 * /api/** call is fulfilled by page.route with fixtures, and an admin session
 * is faked by seeding localStorage + mocking /auth/me. That is the only part
 * that is synthetic — the modal, its radios, its routing and its wire bodies
 * are the shipped code.
 *
 * Disposable probe, not a gate. The gate is __tests__/ProducerDecisionModal.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync, readdirSync, existsSync } from "node:fs";

// CLI flag, not an env var. `scripts/check_env_drift.sh` BLOCKS any
// `process.env` name absent from a `.env.example`, and documenting a
// throwaway test knob as application configuration would be false (and
// regression rule 8 forbids adding env vars unasked). Same resolution the
// sibling about-page harness reached.
const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2209/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const PRESETS = [
  { key: "missing_docs", label: "מסמכים חסרים / לא קריאים" },
  { key: "missing_image", label: "תמונה ראשית חסרה" },
  { key: "incomplete_info", label: "מידע עסקי לא מלא (כתובת / טלפון / תיאור)" },
  { key: "not_eligible", label: "עסק לא עומד בתנאי הפלטפורמה" },
  { key: "other", label: "אחר (פירוט חופשי)" },
];
const PRODUCER = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "מאפיית הבוקר", city: "רעננה", status: "pending", slug: null,
  ambassador: false, categories: [], requested_changes: null,
};

const posts = [];
const failures = [];
const check = (name, ok, detail = "") => {
  (ok ? console.log : (m) => { console.log(m); failures.push(name); })(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function newPage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL" });
  await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api/, "");
    if (route.request().method() === "POST") {
      posts.push({ path: p, body: JSON.parse(route.request().postData() || "{}") });
      return json(route, { detail: "ok" });
    }
    if (p === "/auth/me") return json(route, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
    if (p === "/admin/producers") return json(route, [PRODUCER]);
    if (p === "/admin/producers/rejection-presets") return json(route, PRESETS);
    if (p === "/admin/checklist-items") return json(route, []);
    return json(route, []);
  });
  return page;
}

// Two real entry points, both of which must land on the same modal.
//
// The kebab is used at 1440 only. At 375 a real pointer click on it is
// swallowed — `aria-expanded` stays "false" and no [role=menu] enters the DOM,
// while a synthetic `element.click()` opens it — and that reproduces
// IDENTICALLY on an unmodified staging build, so it is a pre-existing kebab
// bug and not MEH-2209's. Reported, not worked around silently: the mobile
// pass uses the row's own "בקשת השלמה" button, which is a first-class entry
// point to this same modal and is what a mobile admin actually reaches for.
async function openModal(page, via) {
  await page.goto(`${BASE}/he/admin/producers`, { waitUntil: "domcontentloaded" });
  await page.getByText("מאפיית הבוקר").first().waitFor({ timeout: 20_000 });
  if (via === "kebab") {
    await page.getByRole("button", { name: "פעולות נוספות" }).first().click();
    await page.getByRole("menuitem", { name: "דחייה" }).click();
  } else {
    await page.getByRole("button", { name: "בקשת השלמה" }).first().click();
  }
  const dialog = page.getByTestId("decision-modal");
  await dialog.locator('input[value="changes:missing_docs"]').waitFor({ timeout: 10_000 });
  return dialog;
}

async function run(browser, viewport, tag, via) {
  const page = await newPage(browser, viewport.width, viewport.height);
  const dialog = await openModal(page, via);
  const submit = dialog.getByTestId("decision-submit");

  // CONTROL — the probe must be able to SEE the modal at all. If this fails,
  // every reassuring result below is void.
  check(`[${tag}] control: modal rendered with both fieldsets`,
    (await dialog.locator("fieldset").count()) === 2,
    `fieldsets=${await dialog.locator("fieldset").count()}`);

  check(`[${tag}] submit disabled with nothing chosen`, await submit.isDisabled());
  await page.screenshot({ path: `${OUT}decision-open-${tag}.png`, fullPage: false });

  // fixable → primary, exact label
  await dialog.locator('input[value="changes:missing_image"]').check();
  const fixableText = (await submit.textContent()).trim();
  const fixableClass = await submit.getAttribute("class");
  check(`[${tag}] fixable → "שליחת בקשת השלמה"`, fixableText === "שליחת בקשת השלמה", fixableText);
  check(`[${tag}] fixable → primary (not danger)`,
    fixableClass.includes("bg-primary") && !fixableClass.includes("bg-red-600"));
  await page.screenshot({ path: `${OUT}decision-fixable-${tag}.png`, fullPage: false });

  // terminal → danger, exact label
  await dialog.locator('input[value="reject:not_eligible"]').check();
  const termText = (await submit.textContent()).trim();
  const termClass = await submit.getAttribute("class");
  check(`[${tag}] terminal → "דחייה ושליחת מייל"`, termText === "דחייה ושליחת מייל", termText);
  check(`[${tag}] terminal → danger`, termClass.includes("bg-red-600"));
  await page.screenshot({ path: `${OUT}decision-terminal-${tag}.png`, fullPage: false });

  // "אחר" locked until text
  await dialog.locator('input[value="changes:other"]').check();
  check(`[${tag}] אחר locked with no text`, await submit.isDisabled());
  await dialog.locator("#decision-free-text").fill("   ");
  check(`[${tag}] אחר still locked on whitespace`, await submit.isDisabled());
  await dialog.locator("#decision-free-text").fill("חסר תיאור העסק");
  check(`[${tag}] אחר unlocks once detailed`, await submit.isEnabled());
  await page.screenshot({ path: `${OUT}decision-other-unlocked-${tag}.png`, fullPage: false });

  // keyboard: Tab reaches the group, arrows move WITHIN it
  await dialog.locator('input[value="changes:missing_docs"]').focus();
  await page.keyboard.press("ArrowDown");
  const afterArrow = await page.evaluate(() => document.activeElement.value);
  check(`[${tag}] ArrowDown moves within group 1`,
    afterArrow === "changes:missing_image", afterArrow);
  await page.keyboard.press("Tab");
  const afterTab = await page.evaluate(() => document.activeElement.value || document.activeElement.id);
  check(`[${tag}] Tab leaves the group (does not walk the radios)`,
    !String(afterTab).startsWith("changes:"), String(afterTab));

  // the send itself, end to end through the real handler
  const before = posts.length;
  await dialog.locator('input[value="changes:missing_image"]').check();
  await dialog.locator("#decision-free-text").fill("התמונה מטושטשת");
  await submit.click();
  await page.waitForTimeout(1200);
  const sent = posts[before];
  check(`[${tag}] fixable submit hits /request-changes with the composed feedback`,
    sent && sent.path.endsWith("/request-changes") &&
    sent.body.feedback === "תמונה ראשית חסרה: התמונה מטושטשת",
    JSON.stringify(sent));

  await page.context().close();
}

// The sandbox ships a pinned Chromium whose build id may not match the one
// this Playwright expects, and `playwright install` is disabled here — so
// point at the installed binary instead of downloading one.
const PW_ROOT = "/opt/pw-browsers";
const chromeDir = existsSync(PW_ROOT)
  ? readdirSync(PW_ROOT).find((d) => /^chromium-\d+$/.test(d))
  : null;
const executablePath = chromeDir ? `${PW_ROOT}/${chromeDir}/chrome-linux/chrome` : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
await run(browser, { width: 375, height: 812 }, "375", "row-button");
await run(browser, { width: 1440, height: 900 }, "1440", "kebab");
await browser.close();

console.log(`\n${failures.length ? `FAILURES (${failures.length}): ${failures.join(", ")}` : "all checks passed"}`);
process.exit(failures.length ? 1 : 0);
