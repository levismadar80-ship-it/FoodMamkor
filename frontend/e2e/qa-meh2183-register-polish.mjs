/**
 * MEH-2183 self-QA — the four locked copy lines + the referral optional hint,
 * captured at 375px against the REAL built wizard (npx next start).
 *
 * Not a spec: a one-off capture harness, run by hand. Locators are the
 * data-testids added in this PR (docs/E2E-LOCATORS.md).
 *
 * CONTROL (read this first): every shot is preceded by an assertion that the
 * expected string is actually IN the DOM. A screenshot proves a pixel was
 * painted, not that the right text was in it — and a harness that photographs
 * an error boundary logs six happy successes (MEH-1976 / #2786). If the
 * control line below prints FAIL, every image in this run is void.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "../qa-artifacts/MEH-2183";
const BASE = "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

const EXPECT = {
  "register-account-duration-hint": "כ־3 דקות. אפשר לעצור ולהמשיך מאוחר יותר.",
  "register-details-free-hint": "ההרשמה והעמוד — בחינם. בלי עמלות, לתמיד.",
  "register-story-photo-hint":
    "אחרי האישור נבקש תמונה אחת טובה של העסק — היא מה שהופך את העמוד.",
  "register-submit-next-hint":
    "נבדוק את הפרטים ונחזור אלייך ב־WhatsApp עד 3 ימי עסקים.",
};
const REFERRAL_HINT = "אפשר לדלג — התשובה רק עוזרת לנו להכיר אותך.";

let failures = 0;
const checks = [];
function check(name, ok, detail = "") {
  checks.push(name);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// Playwright's npm pin wants a Chromium build the sandbox does not have, and
// the download host is proxy-denied, so point at the pre-installed binary.
// Overridable: on a machine where `npx playwright install` has run, export
// QA_CHROMIUM= (empty) and Playwright resolves its own browser as usual.
const QA_CHROMIUM =
  process.env.QA_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  QA_CHROMIUM ? { executablePath: QA_CHROMIUM } : {},
);
const ctx = await browser.newContext({
  viewport: { width: 375, height: 900 },
  deviceScaleFactor: 2,
  locale: "he-IL",
});
const page = await ctx.newPage();

await page.route("**/categories", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      // MEH-2139: CategorySelector keys the POPULAR grid by `slug`, not by the
      // Hebrew name — a slug-less stub renders no chip at all.
      { id: 1, name: "חלב וגבינות", slug: "dairy" },
      { id: 2, name: "לחמים ואפייה", slug: "bread" },
    ]),
  }),
);
await page.route("**/auth/register/producer", (r) =>
  r.request().method() === "POST"
    ? r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ whatsapp_sent: true }),
      })
    : r.continue(),
);

async function shot(name, testid) {
  const el = page.getByTestId(testid);
  await el.waitFor({ state: "visible", timeout: 10_000 });
  const text = (await el.textContent())?.trim();
  check(`${testid} carries the locked string`, text === EXPECT[testid], `got: "${text}"`);
  await page.screenshot({ path: `${OUT}/${name}` });
}

await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
await page.getByTestId("register-preflight-start").click();

// ── ACCOUNT — copy line 1 ──
await shot("01-account-375.png", "register-account-duration-hint");

await page.getByTestId("register-account-name").fill("טסט בדיקה");
await page.getByTestId("register-account-email").fill(`qa2183+${Date.now()}@mehamakor.online`);
await page.getByTestId("register-account-password").fill("Abcdefgh1234");
await page.getByTestId("register-account-next").click();

// ── DETAILS — copy line 2 ──
await shot("02-details-375.png", "register-details-free-hint");

await page.getByTestId("register-details-name").fill("העסק שלי");
await page.getByTestId("register-details-phone").fill("0501234567");
await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
await page.getByTestId("register-details-next").click();

await page.getByTestId("category-chip-1").click();
const lic = page.getByTestId("register-category-license");
if (await lic.isVisible().catch(() => false)) await lic.fill("1234567");
await page.getByTestId("register-category-next").click();

// ── STORY — copy line 3, the referral hint, and copy line 4 ──
await shot("03-story-top-375.png", "register-story-photo-hint");

const refBlock = page.getByTestId("register-referral-source-block");
await refBlock.scrollIntoViewIfNeeded();
const refText = (await refBlock.textContent()) ?? "";
check("referral block shows the optional hint", refText.includes(REFERRAL_HINT));
check(
  "referral <select> is no longer `required`",
  (await page.getByTestId("register-referral-source").getAttribute("required")) === null,
);
await page.screenshot({ path: `${OUT}/04-story-referral-hint-375.png` });

await page.getByTestId("register-submit-next-hint").scrollIntoViewIfNeeded();
await shot("05-story-submit-hint-375.png", "register-submit-next-hint");

// ── The behaviour change: submit with the dropdown UNTOUCHED ──
await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
check(
  "attribution dropdown is still empty at submit time",
  (await page.getByTestId("register-referral-source").inputValue()) === "",
);
for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
  await cb.check();
}
await page.getByTestId("register-story-submit").click();
const reached = await page
  .getByTestId("register-frame-confirm")
  .waitFor({ state: "visible", timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
check("empty attribution SUBMITS — CONFIRM frame reached", reached);
await page.screenshot({ path: `${OUT}/06-confirm-after-empty-referral-375.png` });

await browser.close();
console.log(`\n${checks.length} assertions, ${failures} failed.`);
if (failures) {
  console.log("!! Screenshots in this run are VOID — the control failed.");
  process.exit(1);
}
