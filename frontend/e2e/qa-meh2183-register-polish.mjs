/**
 * MEH-2183 self-QA — the four locked copy lines + the referral optional hint,
 * captured at 375px against the REAL built wizard (npx next start).
 *
 * Not a spec: a one-off capture harness, run by hand. Locators are the
 * data-testids added in this PR (docs/E2E-LOCATORS.md).
 *
 * BEFORE COMMITTING: this writes raw PNGs (~1.3 MB). Run
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/MEH-2183/
 * and then DELETE the .png files — the helper writes .webp beside them, it
 * does not remove the source. Committing both duplicates ~1.3 MB against the
 * 2 MB per-PR cap. Every re-run of this script re-creates them, so the
 * compress+delete is per-run, not once.
 *
 * CONTROL (read this first): every shot is preceded by an assertion that the
 * expected string is actually IN the DOM. A screenshot proves a pixel was
 * painted, not that the right text was in it — and a harness that photographs
 * an error boundary logs six happy successes (MEH-1976 / #2786). If the
 * control line below prints FAIL, every image in this run is void.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

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

// Playwright's npm pin wants a Chromium build this sandbox does not have, and
// the download host is proxy-denied, so fall back to the pre-installed binary
// when it is there. Probed on the filesystem rather than read from an env var:
// scripts/check_env_drift.sh BLOCKS on any process.env name absent from
// .env.example, and a throwaway QA harness is not a reason to add one.
// Where `npx playwright install` has run, the path is absent and Playwright
// resolves its own browser as usual.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
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
// The hint carries its own testid as of the reviewer's MINOR finding; assert
// the element, not an attribute a <p> could never have.
check(
  "optional hint is reachable by its own testid",
  (await page.getByTestId("register-referral-optional-hint").count()) === 1,
);
// fullPage, deliberately. The previous version relied on
// scrollIntoViewIfNeeded() to reframe — but that is a NO-OP when the target
// already fits the viewport, so this shot came out a byte-identical blob to
// shot 03 and evidenced nothing the earlier shot had not. Caught by the CI
// reviewer, not by me: I noticed the two files had suspiciously equal sizes
// and talked myself out of it instead of hashing them.
await page.screenshot({ path: `${OUT}/04-story-referral-hint-375.png`, fullPage: true });

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

// CONTROL — distinctness. A duplicate capture is indistinguishable from real
// coverage by filename alone, which is how the first version of this harness
// shipped shot 04 as a copy of shot 03.
const shots = [
  "01-account-375.png",
  "02-details-375.png",
  "03-story-top-375.png",
  "04-story-referral-hint-375.png",
  "05-story-submit-hint-375.png",
  "06-confirm-after-empty-referral-375.png",
];
const digests = new Map();
for (const f of shots) {
  const d = createHash("sha256").update(readFileSync(`${OUT}/${f}`)).digest("hex");
  digests.set(f, d);
}
const dupes = [...digests.entries()].filter(
  ([f, d]) => [...digests.values()].filter((x) => x === d).length > 1 && f,
);
check(
  `all ${shots.length} captures are distinct images`,
  dupes.length === 0,
  dupes.length ? `duplicates: ${dupes.map(([f]) => f).join(", ")}` : "",
);

console.log(`\n${checks.length} assertions, ${failures} failed.`);
if (failures) {
  console.log("!! Screenshots in this run are VOID — the control failed.");
  process.exit(1);
}
