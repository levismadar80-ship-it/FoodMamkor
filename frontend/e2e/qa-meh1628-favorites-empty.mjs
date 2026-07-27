/**
 * MEH-1628 self-QA capture — favorites empty state at 375px + 1440px.
 *
 * Drives the REAL FavoritesClient in a real Chromium against `next start`.
 * The page is auth-gated and the CC sandbox cannot reach the Railway backend
 * (see CLAUDE.md "Known Bug Patterns"), so the two calls the page makes are
 * route-intercepted at the network layer — the component, its i18n messages and
 * its CSS are all the shipped ones. Nothing about the render is stubbed.
 *
 * Usage: node e2e/qa-meh1628-favorites-empty.mjs [baseURL] [chromiumPath]
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3111";
const CHROMIUM = process.argv[3] || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "qa-artifacts/MEH-1628";
const USER = { id: "u1", email: "qa@mehamakor.test", name: "QA", role: "user", city: "תל אביב" };

const PRODUCER = {
  id: "p1",
  name: "משק הדגמה",
  city: "תל אביב",
  description: "עסק לצורכי צילום QA",
  categories: [],
};

const shots = [
  { name: "favorites-empty-375", width: 375, height: 780, mobile: true },
  { name: "favorites-empty-1440", width: 1440, height: 900, mobile: false },
  // F3: the alerts-hint row only mounts with a non-empty list. Captured at 375
  // because that is where the inline icon's line-wrapping is at risk — the row
  // used to be a flex container, which would have made the two text runs on
  // either side of the bell unbreakable siblings.
  {
    name: "favorites-hint-row-375",
    width: 375,
    height: 780,
    mobile: true,
    favorites: [{ producer_id: "p1", producer: PRODUCER }],
    target: "p[dir='rtl']",
  },
];

mkdirSync(OUT, { recursive: true });

// The sandbox ships Chromium 1194; @playwright/test here wants 1228 and
// `playwright install` is disabled in this environment, so point at the
// pre-installed binary. CI runners use their own bundled browser — unaffected.
// Overridable by argv, deliberately NOT by an env var: a new env var read in
// code has to be documented in .env.example or the Env-drift gate blocks the
// PR (MEH-491), and regression rule 8 puts new env vars behind explicit
// approval. A local QA convenience does not warrant either.
const browser = await chromium.launch({ executablePath: CHROMIUM });
let failures = 0;

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 2,
    isMobile: shot.mobile,
    hasTouch: shot.mobile,
    locale: "he-IL",
  });

  // Auth bootstrap: auth-context reads localStorage.token, then GETs /auth/me.
  await context.addInitScript(() => {
    localStorage.setItem("token", "qa-token");
    localStorage.setItem("cookie_consent", "all");
  });

  // ORDER MATTERS: Playwright tries routes in REVERSE registration order, so the
  // catch-all is registered FIRST and the specific handlers after it. Registering
  // the catch-all last silently shadows them — which is exactly what made the
  // hint-row capture render an empty list on the first run of this script.
  await context.route("**/api/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await context.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USER) }),
  );
  // The subject under test: a genuinely EMPTY favorites list — or, for the hint
  // capture, a populated one so the t.rich bell row mounts.
  await context.route("**/api/users/me/favorites*", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(shot.favorites || []),
    }),
  );

  const page = await context.newPage();
  const selector = shot.target || "div.text-center.py-20";
  await page.goto(`${BASE}/he/favorites`, { waitUntil: "networkidle" });
  await page.waitForSelector(selector, { timeout: 15_000 });
  await page.waitForTimeout(600); // settle icon font / transitions

  const region = page.locator(selector).first();

  // Assert what the screenshot is supposed to prove, so a blank or wrong-state
  // capture cannot be filed as evidence. Equalities, never lower bounds.
  const svgCount = await region.locator("svg").count();
  const paraCount = await region.locator("p").count();
  const bodyText = (await region.innerText()).replace(/\s+/g, " ").trim();

  // Empty state: one glyph (HeartStraight) + one helper paragraph.
  // Hint row: one glyph (Bell) interpolated inside the sentence; the row IS the
  // <p>, so it contains no nested <p>.
  const expectP = shot.target ? 0 : 1;
  const ok = svgCount === 1 && paraCount === expectP;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${shot.name}: svg=${svgCount} (expect 1) · p=${paraCount} (expect ${expectP})`,
  );
  console.log(`     copy: ${bodyText}`);

  await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: false });
  await context.close();
}

await browser.close();
process.exit(failures === 0 ? 0 : 1);
