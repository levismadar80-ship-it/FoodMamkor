/**
 * MEH-1768 self-QA — the multi-location helper is visible with the checkbox
 * UNCHECKED, at 375 and 1440, against the REAL built wizard (npx next start).
 *
 * Not a spec: a one-off capture harness, run by hand. Flow and stubs mirror
 * qa-meh2183-register-polish.mjs.
 *
 * CONTROL, read before believing any image below. A screenshot proves a pixel
 * was painted, never that the right text was in it — a harness photographing an
 * error boundary logs happy successes (#2786). So each viewport asserts, in the
 * DOM and BEFORE the shot:
 *
 *   C1  the checkbox exists and is NOT checked        <- the state under test
 *   C2  the helper carries the locked string verbatim <- not a key, not a stub
 *   C3  it appears EXACTLY ONCE                       <- "never twice" (the AC)
 *   C4  the retired copy is absent from the whole page
 *
 * C1 is the one that makes the rest mean something: the helper being present is
 * only a finding while the box is unticked. Photographed after a tick, this
 * harness would have passed against the OLD code too.
 *
 * BEFORE COMMITTING: this writes raw PNGs. Run
 *   node scripts/compress-qa-screenshots.mjs ../qa-artifacts/MEH-1768/
 * then DELETE the .png files — the helper writes .webp beside them and does not
 * remove the source (2 MB per-PR cap).
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const OUT = "../qa-artifacts/MEH-1768";
const BASE = "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

const LOCKED_HELPER = "אפשר להוסיף את כל הנקודות בלוח הבקרה אחרי ההרשמה.";
const LOCKED_QUESTION = "יש לך יותר מנקודת מכירה או איסוף אחת?";
const RETIRED = "מצוין — תוכלי להוסיף";

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

async function capture(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  const page = await ctx.newPage();
  await page.route("**/categories", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { id: 1, name: "חלב וגבינות", slug: "dairy" },
        { id: 2, name: "לחמים ואפייה", slug: "bread" },
      ]),
    }),
  );

  console.log(`\n──────── register DETAILS @ ${width}x${height} ────────`);
  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("register-preflight-start").click();
  await page.getByTestId("register-account-name").fill("טסט בדיקה");
  await page.getByTestId("register-account-email").fill(`qa1768+${Date.now()}@mehamakor.online`);
  await page.getByTestId("register-account-password").fill("Abcdefgh1234");
  await page.getByTestId("register-account-next").click();

  const toggle = page.getByTestId("register-multi-location-toggle");
  await toggle.waitFor({ state: "visible", timeout: 15_000 });

  // C1 — the state under test. Everything below is only evidence while this holds.
  check(`${width}: checkbox present and UNCHECKED`, (await toggle.isChecked()) === false);

  const helper = page.getByTestId("register-multi-location-copy");
  const visible = await helper.isVisible().catch(() => false);
  const text = ((await helper.textContent().catch(() => "")) ?? "").trim();

  // C2 — the locked string, verbatim.
  check(`${width}: helper visible while unchecked`, visible);
  check(`${width}: helper carries the locked copy`, text === LOCKED_HELPER, `got: "${text}"`);

  // C3 — exactly once. A presence assertion cannot see a duplicate.
  // Read ONCE: two awaits would be two round-trips, and the verdict could then
  // disagree with the number printed beside it if the page moved between them.
  const copyCount = await helper.count();
  check(`${width}: helper appears exactly once`, copyCount === 1, `count=${copyCount}`);

  // C4 — the question is unchanged, and the retired line is gone page-wide.
  const body = (await page.locator("body").textContent()) ?? "";
  check(`${width}: question text unchanged`, body.includes(LOCKED_QUESTION));
  check(`${width}: retired conditional copy absent`, !body.includes(RETIRED));

  await helper.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/helper-unchecked-${width}.png`, fullPage: true });
  await ctx.close();
}

await capture(375, 812);
await capture(1440, 900);
await browser.close();

// CONTROL — distinctness. Two identical blobs are indistinguishable from real
// two-viewport coverage by filename alone.
const digests = ["helper-unchecked-375.png", "helper-unchecked-1440.png"].map((f) =>
  createHash("sha256").update(readFileSync(`${OUT}/${f}`)).digest("hex").slice(0, 12),
);
check("the two viewport captures are distinct blobs", digests[0] !== digests[1], digests.join(" vs "));

// Derived, never stated — a literal goes stale the moment a check is added.
console.log(`\n${ran.length} assertions, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
