/**
 * MEH-2324 self-QA — the owner-claim page, every state, at 375 and 1440.
 *
 * Drives the REAL build (`next start`); only /api/** is synthetic (page.route
 * fixtures + a faked session), same harness as qa-meh2325/2326. Besides the
 * screenshots it checks the two things a unit test cannot see in a browser:
 *   - after the first load the address no longer holds the token, and no later
 *     request URL carries it;
 *   - nothing overflows the viewport sideways.
 *
 * Disposable probe, not a gate. The gate is __tests__/ClaimPage.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2324/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxYS1kcmFmdCJ9.qa-signature";
const BAKERY = {
  name: "מאפיית הגבעה",
  city: "קריית טבעון",
  short_description: "לחם מחמצת שנאפה כל בוקר בתנור אבן, מקמח מקומי.",
  image: null,
  category_names: ["מאפים"],
};
const FARM = { ...BAKERY, name: "משק הדרים", city: "כפר יהושע", category_names: ["ירקות"] };
const OWNER = { id: "u-1", email: "owner@example.com", name: "נועה", role: "user", producer_id: null, is_producer: false };

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// user: null = guest. preview: { status, body }. claim: { status, body }.
async function open(browser, width, { user = null, preview, claim }) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 812 : 900 }, locale: "he-IL" });
  if (user) await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  const page = await ctx.newPage();
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (p === "/auth/me") return user ? json(route, user) : json(route, { detail: "no" }, 401);
    if (p === "/producer-claim/preview") return json(route, preview.body, preview.status);
    if (p === "/producer-claim") return json(route, claim.body, claim.status);
    return json(route, []);
  });
  // The bare form is what the admin copies (no locale); MEH-2324 found it 404ing.
  await page.goto(`${BASE}/claim/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => !u.pathname.includes(TOKEN), { timeout: 20_000 });
  return { page, urls };
}

async function shot(page, width, name) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${width} ${name}: no sideways overflow`, overflow <= 0, `overflow=${overflow}`);
  await page.screenshot({ path: `${OUT}${name}-${width}.png` });
}

const ok = (body) => ({ status: 200, body });
const EXE_FLAG = "--chromium=";
const EXE = (process.argv.find((a) => a.startsWith(EXE_FLAG)) || "").slice(EXE_FLAG.length);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
try {
  for (const w of [375, 1440]) {
    // Guest, and the token contract.
    {
      const { page, urls } = await open(browser, w, { preview: ok(BAKERY) });
      await page.getByTestId("claim-logged-out").waitFor({ timeout: 20_000 });
      check(`${w} guest: address has no token`, !page.url().includes(TOKEN), page.url());
      // Control: the first request IS the link, so the probe can see a token
      // when one is there. Without this a dead listener would read as clean.
      check(`${w} guest: control — the first request carries the token`, urls[0]?.includes(TOKEN), urls[0]);
      const later = urls.slice(1).filter((u) => u.includes(TOKEN));
      check(`${w} guest: no later request URL carries the token`, later.length === 0, later.join(" "));
      const signup = await page.getByTestId("claim-email-signup").getAttribute("href");
      check(`${w} guest: sign-up returns to /claim`, signup === "/register?redirect=%2Fclaim", signup);
      await shot(page, w, "guest");
      await page.context().close();
    }
    // Eligible owner: validation, then success.
    {
      const { page } = await open(browser, w, {
        user: OWNER,
        preview: ok(BAKERY),
        claim: ok({ producer_id: "p-1", status: "draft" }),
      });
      await page.getByTestId("claim-form").waitFor({ timeout: 20_000 });
      check(`${w} eligible: no grower box for a bakery`, (await page.getByTestId("claim-farmer").count()) === 0);
      await shot(page, w, "eligible");
      await page.getByTestId("claim-submit").click();
      check(`${w} eligible: asks for the terms first`, await page.getByTestId("claim-error").isVisible());
      await shot(page, w, "eligible-validation");
      await page.getByTestId("claim-terms").check();
      await page.getByTestId("claim-declaration").check();
      await page.getByTestId("claim-submit").click();
      await page.waitForURL((u) => u.pathname.endsWith("/producer/dashboard"), { timeout: 20_000 });
      check(`${w} eligible: lands on the dashboard`, true);
      await page.context().close();
    }
    // Farm: the grower line appears.
    {
      const { page } = await open(browser, w, { user: OWNER, preview: ok(FARM) });
      await page.getByTestId("claim-form").waitFor({ timeout: 20_000 });
      check(`${w} farm: grower box shown`, await page.getByTestId("claim-farmer").isVisible());
      await shot(page, w, "eligible-farm");
      await page.context().close();
    }
    // Submit error, with the server's reason.
    {
      const { page } = await open(browser, w, {
        user: OWNER,
        preview: ok(BAKERY),
        claim: { status: 409, body: { detail: "העמוד הזה כבר שויך לחשבון." } },
      });
      await page.getByTestId("claim-form").waitFor({ timeout: 20_000 });
      await page.getByTestId("claim-terms").check();
      await page.getByTestId("claim-declaration").check();
      await page.getByTestId("claim-submit").click();
      await page.getByTestId("claim-error").waitFor();
      check(`${w} submit error: server reason shown`, (await page.getByTestId("claim-error").innerText()).includes("כבר שויך"));
      await shot(page, w, "submit-error");
      await page.context().close();
    }
    // Ineligible accounts.
    for (const [name, user, testid] of [
      ["admin", { ...OWNER, role: "admin" }, "claim-admin"],
      ["has-business", { ...OWNER, role: "producer", producer_id: "p-9", is_producer: true }, "claim-has-business"],
    ]) {
      const { page } = await open(browser, w, { user, preview: ok(BAKERY) });
      await page.getByTestId(testid).waitFor({ timeout: 20_000 });
      check(`${w} ${name}: no form`, (await page.getByTestId("claim-form").count()) === 0);
      await shot(page, w, name);
      await page.context().close();
    }
    // Dead ends from the preview.
    for (const [name, status, testid] of [
      ["invalid", 404, "claim-invalid"],
      ["claimed", 409, "claim-claimed"],
      ["load-error", 500, "claim-load-error"],
    ]) {
      const { page } = await open(browser, w, { preview: { status, body: { detail: "x" } } });
      await page.getByTestId(testid).waitFor({ timeout: 20_000 });
      check(`${w} ${name}: shown`, true);
      await shot(page, w, name);
      await page.context().close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAIL` : "\nall PASS");
process.exit(failures.length ? 1 : 0);
