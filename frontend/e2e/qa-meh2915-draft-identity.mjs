/**
 * MEH-2915 — browser verification for the draft-identity change.
 *
 * WHY THIS EXISTS: the Playwright TEST RUNNER cannot launch in the CC sandbox
 * (playwright 1.62.1 wants chromium revision 1234; the image ships 1243), and
 * editing `playwright.config.ts` to point at the image's binary for a local run
 * is not a change that belongs in this PR. So the assertions of the two specs
 * this change touches are driven here through the standalone Playwright API,
 * which does launch, against a local `next start`.
 *
 * It mirrors, and does not replace:
 *   · e2e/flows/27-register-draft-banner.spec.ts  D and E
 *   · e2e/flows/22-register-personas.spec.ts      P5 (both cells)
 * and adds the on-disk scrub, which no spec covers.
 *
 * Run from frontend/:  node e2e/qa-meh2915-draft-identity.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:3100";
const DRAFT_KEY = "producer_registration_draft";

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox"],
});

const newPage = async () => {
  const ctx = await browser.newContext({ locale: "he-IL", viewport: { width: 1440, height: 900 } });
  await ctx.route("**/categories*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  return { ctx, page: await ctx.newPage() };
};

const seed = async (page, value) => {
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [DRAFT_KEY, value]);
  await page.reload({ waitUntil: "domcontentloaded" });
};

const enterWizard = async (page) => {
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-frame-account").waitFor({ timeout: 15000 });
};

// ---------------------------------------------- spec 27 D (repaired seed)
{
  const { ctx, page } = await newPage();
  await seed(page, JSON.stringify({ producer_name: "הבית של ספיר", city: "חיפה" }));
  await enterWizard(page);
  const shown = await page.getByTestId("register-draft-banner").isVisible().catch(() => false);
  await page.getByTestId("register-draft-dismiss").click();
  const goneNow = (await page.getByTestId("register-draft-banner").count()) === 0;
  await page.reload({ waitUntil: "domcontentloaded" });
  await enterWizard(page);
  const goneAfterReload = (await page.getByTestId("register-draft-banner").count()) === 0;
  check(
    "27·D — a business-field draft earns the banner, and «לא» survives a reload",
    shown && goneNow && goneAfterReload,
    `banner shown=${shown} gone after dismiss=${goneNow} gone after reload=${goneAfterReload}`,
  );
  await ctx.close();
}

// ---------------------------------------------- spec 27 E (repaired assertions)
{
  const { ctx, page } = await newPage();
  await seed(page, JSON.stringify({ producer_name: "הבית של ספיר", city: "חיפה" }));
  await enterWizard(page);
  await page.getByTestId("register-draft-continue").click();
  await page.getByTestId("register-account-name").fill("ספיר בודקת");
  await page.getByTestId("register-account-email").fill(`sapir.qa+${Date.now()}@example.com`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await page.getByTestId("register-frame-details").waitFor({ timeout: 15000 });
  const name = await page.getByTestId("register-details-name").inputValue();
  const city = await page.locator("#producer-city").inputValue();
  check(
    "27·E — «כן, המשיכו» restores the business fields on frame 02",
    name === "הבית של ספיר" && city === "חיפה",
    `producer_name=${JSON.stringify(name)} city=${JSON.stringify(city)}`,
  );
  await ctx.close();
}

// ---------------------------------------------- spec 22 P5 (repaired assertions)
{
  const { ctx, page } = await newPage();
  const email = `persona+${Date.now()}@example.com`;
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await enterWizard(page);
  await page.getByTestId("register-account-name").fill("בודקת פרסונה");
  await page.getByTestId("register-account-email").fill(email);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();
  await page.getByTestId("register-frame-details").waitFor({ timeout: 15000 });
  await page.getByTestId("register-details-name").fill("משק הפרסונה");
  await page.reload({ waitUntil: "domcontentloaded" });
  const draft = await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);
  check(
    "22·P5 — the draft survives a mid-wizard reload carrying the business, not the person",
    Boolean(draft) && draft.includes("משק הפרסונה") && !draft.includes(email),
    `has business name=${draft?.includes("משק הפרסונה")} carries the email=${draft?.includes(email)}`,
  );
  await ctx.close();
}

// ---------------------------------------------- on-disk scrub (no spec covers it)
{
  const { ctx, page } = await newPage();
  const savedAt = Date.now() - 60_000;
  const identity = {
    producer_name: "הבית של דנה",
    city: "חיפה",
    email: "dana@example.com",
    name: "דנה לוי",
    phone: "0501234567",
    address: "הרצל 1",
  };
  await seed(page, JSON.stringify({ v: 2, savedAt, step: 2, form: identity }));
  await enterWizard(page);
  await page.getByTestId("register-draft-banner").waitFor({ timeout: 15000 });
  const raw = await page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);
  const leaked = ["dana@example.com", "דנה לוי", "0501234567", "הרצל 1"].filter((v) =>
    raw.includes(v),
  );
  const stamp = JSON.parse(raw).savedAt;
  check(
    "scrub — an existing draft is rewritten on mount, at its original savedAt",
    leaked.length === 0 && raw.includes("הבית של דנה") && stamp === savedAt,
    `leaked=${JSON.stringify(leaked)} business kept=${raw.includes("הבית של דנה")} savedAt ${savedAt} -> ${stamp}`,
  );
  await ctx.close();
}

// -------- why 27·D and 27·E had to change: the OLD seed earns nothing now
{
  const { ctx, page } = await newPage();
  await seed(page, JSON.stringify({ name: "ספיר בודקת", email: "sapir.qa@example.com" }));
  await enterWizard(page);
  const count = await page.getByTestId("register-draft-banner").count();
  check(
    "the pre-MEH-2915 seed ({name, email}) earns no banner — the reason D/E were re-seeded",
    count === 0,
    `banner count with an identity-only draft: ${count} (both keys are omitted, so the ` +
      `form reads {} and hasDraftContent is false)`,
  );
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
