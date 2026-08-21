/**
 * MEH-2136 self-QA — the register success screen's button hierarchy.
 *
 * Drives the REAL /register/producer wizard to its didUpgrade CONFIRM step in
 * Chromium against a `next start` server, at 375 and 1440, and captures both
 * frames. Every /api/** call is fulfilled locally; the CC sandbox has no
 * backend (CLAUDE.md "Known Bug Patterns"). Stub shape mirrors
 * e2e/flows/28-register-success-state.spec.ts, which proves the same route set
 * reaches this screen.
 *
 * Case 0 is a self-test with a known answer: it measures the WhatsApp share
 * link, whose background is transparent by design, and requires the probe to
 * report it as NOT solid. A probe that answered "solid" for everything — the
 * reassuring answer for case 1 — cannot survive it.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2136-register-success-cta.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2136";
const BASE = "http://localhost:3100";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const failures = [];
const ran = [];
function check(name, cond, detail) {
  ran.push(name);
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

/** Computed background-color, not the class attribute. */
const bg = (page, sel) =>
  page.$eval(sel, (el) => getComputedStyle(el).backgroundColor);

async function stub(page) {
  await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
  await page.route("**/auth/me", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: 1, email: "seller@mehamakor.online", name: "בעלת עסק", role: "user" }),
    }),
  );
  await page.route("**/favorites**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: 1, name: "חלב וגבינות" }, { id: 2, name: "לחמים ואפייה" }]),
    }),
  );
  await page.route("**/auth/register/producer", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access_token: "tok-123", whatsapp_sent: true }),
    }),
  );
  await page.route("**res.cloudinary.com**", (r) =>
    r.fulfill({ status: 200, contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg'/>" }),
  );
}

/** Walks the wizard to the CONFIRM step. Throws if any frame fails to appear. */
async function reachSuccess(page) {
  await page.goto(`${BASE}/register/producer`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();

  // Upgrade path skips ACCOUNT — the seeded token puts step at DETAILS.
  await page.getByTestId("register-frame-details").waitFor({ timeout: 15_000 });
  await page.getByTestId("register-details-name").fill("העסק שלי");
  await page.getByTestId("register-details-phone").fill("0501234567");
  await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
  await page.getByTestId("register-details-address").fill("הרצל 1");
  await page.getByTestId("register-details-next").click();

  await page.getByTestId("register-frame-category").waitFor({ timeout: 15_000 });
  await page.getByTestId("category-chip-1").click();
  await page.getByTestId("register-category-license").fill("1234567");
  await page.getByTestId("register-category-next").click();

  await page.getByTestId("register-frame-story").waitFor({ timeout: 15_000 });
  await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
  await page.getByTestId("register-referral-source").selectOption("instagram");
  for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) {
    await cb.check();
  }
  await page.getByTestId("register-story-submit").click();
  await page.getByTestId("register-success-pending").waitFor({ timeout: 15_000 });
}

const browser = await chromium.launch({ executablePath: CHROME });
fs.mkdirSync(OUT, { recursive: true });

for (const width of [375, 1440]) {
  console.log(`\n=== ${width}px ===`);
  const ctx = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 900 } });
  const page = await ctx.newPage();
  await stub(page);
  await reachSuccess(page);

  const CTA = '[data-testid="register-success-dashboard-cta"]';
  const SHARE = "a.btn-whatsapp-outline";

  // Case 0 — self-test. The share link is transparent by design; a probe that
  // reports every element as solid dies here, before case 1 is believed.
  const shareBg = await bg(page, SHARE);
  check(
    `${width}/case0 self-test: share link reads NOT solid`,
    /rgba\(0, 0, 0, 0\)|transparent/.test(shareBg),
    `computed background-color = ${shareBg}`,
  );

  // Case 1 — the CTA is solid, i.e. a real painted background.
  const ctaBg = await bg(page, CTA);
  check(
    `${width}/case1 CTA is solid`,
    !/rgba\(0, 0, 0, 0\)|transparent/.test(ctaBg),
    `computed background-color = ${ctaBg}`,
  );

  // Case 2 — geometry: the CTA sits BELOW the green next box and ABOVE the share.
  const boxes = await page.evaluate((sel) => {
    const y = (el) => (el ? el.getBoundingClientRect().top : null);
    return {
      next: y(document.querySelector(".bg-green-50")),
      cta: y(document.querySelector(sel)),
      share: y(document.querySelector("a.btn-whatsapp-outline")),
      sig: y([...document.querySelectorAll("p")].find((p) => p.className.includes("font-headline-md"))),
    };
  }, CTA);
  check(
    `${width}/case2 order green-box < CTA < share < signature`,
    boxes.next < boxes.cta && boxes.cta < boxes.share && boxes.share < boxes.sig,
    JSON.stringify(boxes),
  );

  // Case 3 — full-width on mobile only.
  const w = await page.$eval(CTA, (el) => el.getBoundingClientRect().width);
  const containerW = await page.$eval(CTA, (el) => el.parentElement.getBoundingClientRect().width);
  check(
    `${width}/case3 ${width === 375 ? "full-width on mobile" : "auto width on desktop"}`,
    width === 375 ? Math.abs(w - containerW) < 2 : w < containerW - 10,
    `cta=${w.toFixed(1)} container=${containerW.toFixed(1)}`,
  );

  await page.screenshot({ path: `${OUT}/success-${width}.png`, fullPage: true });
  console.log(`  wrote ${OUT}/success-${width}.png`);
  await ctx.close();
}

await browser.close();
console.log(`\n${ran.length} assertions ran, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
