// MEH-2200 self-QA: capture the Amendment-13 collection notice at 375px.
// The script READS THE DOM in the same run and refuses to write the PNG if the
// notice is missing or its rich-text tags failed to resolve — a screenshot
// proves pixels, not semantics (HANDOFF 26/08, #3129).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

// argv/hard-coded, never an env read: the MEH-491 env-drift gate counts every
// `process` `.env.NAME` in the repo as an undeclared var, and a one-off QA
// harness has no business adding a line to .env.example. Same convention the
// qa-meh1390 / qa-meh1539 siblings already follow.
//   usage: node e2e/qa-meh2200-collection-notice.mjs [baseUrl] [chromiumPath]
const BASE = process.argv[2] || "http://localhost:3300";
const OUT = "qa-artifacts/MEH-2200";
mkdirSync(OUT, { recursive: true });

const CATEGORIES = [
  { id: 1, name: "שמנים" },        // NOT license-required → no license gate
  { id: 2, name: "ירקות ופירות" },
];

// The sandbox ships chromium-1194; this playwright build looks for a newer
// headless-shell revision that is not present, so point at the real binary.
const browser = await chromium.launch({
  executablePath: process.argv[3] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/api/categories*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATEGORIES) }),
);

await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });

await page.getByTestId("register-preflight-start").click();

// ACCOUNT
await page.locator("#producer-account-name").fill("רותי לוי");
await page.locator("#producer-account-email").fill("qa-meh2200@example.com");
await page.locator("#producer-account-password").fill("Abcdefgh1234");
await page.getByTestId("register-account-next").click();
await page.getByTestId("register-frame-details").waitFor();

// DETAILS — producer_name / phone / city are the CROSS_STEP_REQUIRED trio,
// and the MEH-1838 delivery axis needs at least one channel ticked.
await page.locator("#producer-business-name").fill("הבית של רותי");
await page.locator("#producer-phone").fill("0501234567");
await page.locator("#producer-city").fill("תל אביב");
await page.getByTestId("register-has-physical-location").check();
await page.getByTestId("register-details-next").click();

// CATEGORY
await page.getByTestId("register-frame-category").waitFor();
// The mocked categories are not in the "פופולריות" set, so they sit behind the
// collapsed "עוד קטגוריות" disclosure.
await page.getByText(/עוד קטגוריות/).first().click();
await page.getByText("שמנים", { exact: true }).first().click();
await page.getByTestId("register-category-next").click();

// STORY — the submitting frame that carries the notice
await page.getByTestId("register-frame-story").waitFor();

const notice = page.getByTestId("register-collection-notice");
const count = await notice.count();
if (count !== 1) {
  throw new Error(`REFUSING TO CAPTURE: expected exactly 1 notice, found ${count}`);
}

const probe = await notice.first().evaluate((el) => ({
  text: el.textContent.trim(),
  privacyHref: el.querySelector('a[href="/privacy"]')?.getAttribute("href") ?? null,
  mailto: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")).find((h) => h?.startsWith("mailto:")) ?? null,
  box: el.getBoundingClientRect().toJSON(),
}));

const submitBox = await page.getByTestId("register-story-submit").evaluate((el) => el.getBoundingClientRect().toJSON());

const fail = [];
if (!probe.privacyHref) fail.push("no /privacy link inside the notice");
if (!probe.mailto) fail.push("no mailto: link inside the notice");
// Generic on purpose — naming the two current tags would pass on a tag
// RENAMED in he.json, which is the case worth catching (same fix as the
// vitest assertion in RegisterCollectionNotice.test.jsx).
if (/<\/?[a-zA-Z][\w-]*>/.test(probe.text)) fail.push("raw rich-text markup leaked into the notice");
if (!/אינה חובה על פי חוק/.test(probe.text)) fail.push("volition clause missing");
if (!/לא נוכל להשלים את ההרשמה/.test(probe.text)) fail.push("consequence-of-refusal clause missing");
if (probe.box.top >= submitBox.top) fail.push("notice does not render ABOVE the submit button");
if (probe.box.width > 375) fail.push(`notice overflows viewport: ${probe.box.width}px`);
if (fail.length) throw new Error("REFUSING TO CAPTURE:\n  - " + fail.join("\n  - "));

// Occlusion hit-test BEFORE capturing. A fullPage screenshot paints fixed
// elements (sticky header, cookie banner z-1100) at their viewport offset, so
// it SHOWS an overlap that exists in no real viewport — measured, not assumed:
// all 6 samples below must paint the notice itself. fullPage is therefore
// deliberately NOT the evidence here.
await notice.first().scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const hits = await notice.first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  const out = [];
  for (let i = 1; i <= 6; i++) {
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + (r.height * i) / 7);
    out.push(el.contains(hit));
  }
  return out;
});
if (hits.some((inside) => !inside)) {
  throw new Error(`REFUSING TO CAPTURE: notice occluded at ${hits.filter((h) => !h).length}/6 sample points`);
}

await page.screenshot({ path: `${OUT}/notice-inviewport-375.png` });
await notice.first().screenshot({ path: `${OUT}/notice-closeup-375.png` });

console.log(JSON.stringify({
  ok: true,
  noticeCount: count,
  privacyHref: probe.privacyHref,
  mailto: probe.mailto,
  noticeTop: Math.round(probe.box.top),
  submitTop: Math.round(submitBox.top),
  noticeWidth: Math.round(probe.box.width),
  occlusionSamplesInsideNotice: `${hits.filter(Boolean).length}/6`,
  pageErrors: errors,
  text: probe.text,
}, null, 2));

await browser.close();
