/**
 * MEH-2324 end-to-end — real backend + real DB, no route fixtures.
 *
 * Preconditions (set up by hand, see the PR body): uvicorn on :8000 against a
 * scratch database, `next start` on :3000 proxying /api there, a verified
 * owner account, and a claim link an admin minted for a draft tagged ירקות.
 *   node scripts/qa-meh2324-claim-e2e.mjs --link=<url> --email=<owner> --password=<pw>
 *
 * Walks guest → login → back on /claim → tick → claim → dashboard, then opens
 * the same link in a fresh browser and expects "already claimed".
 * Disposable probe, not a gate.
 */
import { chromium } from "playwright";

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").slice(k.length + 3);
const LINK = arg("link").replace("127.0.0.1", "localhost");
const TOKEN = LINK.split("/claim/")[1];
const OUT = new URL("../../qa-artifacts/MEH-2324/", import.meta.url).pathname;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch(arg("chromium") ? { executablePath: arg("chromium") } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "he-IL" });
  const page = await ctx.newPage();
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));

  await page.goto(LINK, { waitUntil: "domcontentloaded" });
  await page.getByTestId("claim-logged-out").waitFor({ timeout: 30_000 });
  check("guest: real preview rendered", (await page.locator("body").innerText()).includes("משק הדרים"));
  check("guest: address swapped to /claim", new URL(page.url()).pathname.endsWith("/claim"), page.url());

  await page.getByTestId("claim-login").click();
  await page.waitForURL((u) => u.pathname.endsWith("/login"), { timeout: 20_000 });
  check("login: redirect param is /claim", new URL(page.url()).searchParams.get("redirect") === "/claim", page.url());
  await page.getByTestId("login-email").fill(arg("email"));
  await page.getByTestId("login-password").fill(arg("password"));
  await page.getByTestId("login-submit").click();
  await page.waitForURL((u) => u.pathname.endsWith("/claim"), { timeout: 30_000 });
  await page.getByTestId("claim-form").waitFor({ timeout: 30_000 });
  check("back on /claim signed in: form shown", true);
  check("vegetables: grower box shown", await page.getByTestId("claim-farmer").isVisible());
  await page.screenshot({ path: `${OUT}e2e-signed-in-375.png` });

  await page.getByTestId("claim-terms").check();
  await page.getByTestId("claim-declaration").check();
  await page.getByTestId("claim-submit").click();
  check("grower box is required", (await page.getByTestId("claim-error").innerText()).length > 0);
  await page.getByTestId("claim-farmer").check();
  await page.getByTestId("claim-submit").click();
  await page.waitForURL((u) => u.pathname.endsWith("/producer/dashboard"), { timeout: 30_000 });
  await page.waitForTimeout(3000);
  check("claimed: lands on the dashboard", true, page.url());
  check("dashboard shows the business", (await page.locator("body").innerText()).includes("משק הדרים"));
  await page.screenshot({ path: `${OUT}e2e-dashboard-375.png` });
  const leaked = urls.slice(1).filter((u) => u.includes(TOKEN));
  check("no request after the first carried the token", leaked.length === 0, leaked.join(" "));
  await ctx.close();

  // Same link again, fresh browser: already claimed.
  const ctx2 = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "he-IL" });
  const page2 = await ctx2.newPage();
  await page2.goto(LINK, { waitUntil: "domcontentloaded" });
  await page2.getByTestId("claim-claimed").waitFor({ timeout: 30_000 });
  check("second use: already-claimed page", true);
  await page2.screenshot({ path: `${OUT}e2e-second-use-375.png` });
  await ctx2.close();
} catch (e) {
  check("run finished", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAIL` : "\nall PASS");
process.exit(failures.length ? 1 : 0);
