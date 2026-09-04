/**
 * MEH-2185 evidence capture — the register surface after the copy ruling.
 *
 * CONTROL: every shot is preceded by an assertion on the DOM text. A
 * screenshot proves a pixel was painted, not that the right string was in it —
 * a harness that photographs an error boundary logs happy successes (#2786).
 * If any control below prints FAIL, every image in this run is void.
 *
 * Run by hand against `npx next start`:
 *   node e2e/qa-meh2185-shots.mjs
 * then compress before committing (MEH-1156, 2 MB per-PR cap):
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/MEH-2185/
 * and delete the .png sources — the helper writes .webp beside them.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const OUT = "../qa-artifacts/MEH-2185";
mkdirSync(OUT, { recursive: true });

let failures = 0;
const ran = [];
function check(name, ok, detail = "") {
  ran.push(name);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch(
  existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
);

for (const [label, width] of [
  ["375", 375],
  ["1440", 1440],
]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  const page = await ctx.newPage();
  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, name: "חלב וגבינות", slug: "dairy" }]),
    }),
  );

  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").waitFor({ state: "visible", timeout: 15_000 });

  // RENDERED text, not textContent(). `body.textContent()` concatenates
  // <script> bodies too, and Next's RSC flight payload
  // (`self.__next_f.push([...])`) carries every string on the route — including
  // `meta.join.og_description`, which still says «בערך 10 דקות» and is a meta
  // tag nobody reads on screen. The first version of this check used
  // textContent() and reported FAIL on all four "no 10 דקות" cases against a
  // page that renders none; the offender was located by walking text nodes and
  // printing their parent tag, which came back SCRIPT. innerText is what a
  // reader sees, which is what the ruling is about.
  const preflightText = await page.locator("body").innerText();
  check(`${label}: subtitle reads «כ־3 דקות»`, preflightText.includes("כ־3 דקות. בלי עמלות."));
  check(`${label}: preflight reads «כל התהליך לוקח כ־3 דקות»`, preflightText.includes("כל התהליך לוקח כ־3 דקות"));
  check(`${label}: no «10 דקות» anywhere on the preflight screen`, !preflightText.includes("10 דקות"));
  await page.screenshot({ path: `${OUT}/preflight-${label}.png` });

  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-account-name").waitFor({ state: "visible", timeout: 15_000 });
  const accountText = await page.locator("body").innerText();
  // The whole point of the ruling: ONE duration on the ACCOUNT screen.
  check(`${label}: ACCOUNT still carries «כ־3 דקות»`, accountText.includes("כ־3 דקות"));
  check(`${label}: ACCOUNT shows no «10 דקות»`, !accountText.includes("10 דקות"));
  await page.screenshot({ path: `${OUT}/account-${label}.png` });

  await ctx.close();
}

// STORY — the deleted hint must be gone, and photo_disclosure must survive.
const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 2, locale: "he-IL" });
const page = await ctx.newPage();
await page.route("**/categories", (r) =>
  r.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ id: 1, name: "חלב וגבינות", slug: "dairy" }]),
  }),
);
await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
await page.getByTestId("register-preflight-start").click();
await page.getByTestId("register-account-name").fill("טסט בדיקה");
await page.getByTestId("register-account-email").fill(`qa2185+${Date.now()}@mehamakor.online`);
await page.getByTestId("register-account-password").fill("Abcdefgh1234");
await page.getByTestId("register-account-next").click();
await page.getByTestId("register-details-name").fill("העסק שלי");
await page.getByTestId("register-details-phone").fill("0501234567");
await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
await page.getByTestId("register-details-next").click();
await page.getByTestId("category-chip-1").click();
const lic = page.getByTestId("register-category-license");
if (await lic.isVisible().catch(() => false)) await lic.fill("1234567");
await page.getByTestId("register-category-next").click();
await page.getByTestId("register-frame-story").waitFor({ state: "visible", timeout: 15_000 });

check(
  "STORY: photo_next_hint element is gone",
  (await page.getByTestId("register-story-photo-hint").count()) === 0,
);
const storyText = await page.getByTestId("register-frame-story").innerText();
check(
  "STORY: photo_disclosure survives byte-unchanged",
  storyText.includes("כדי שהדף יעלה לאוויר צריך לפחות תמונה אחת — אפשר להעלות מהדשבורד אחרי האישור."),
);
await page.screenshot({ path: `${OUT}/story-375.png`, fullPage: true });
await ctx.close();
await browser.close();

// Derived, not stated — adding a check moves this number on its own.
console.log(`\n  ${ran.length} checks ran, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
