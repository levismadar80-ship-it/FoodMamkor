/**
 * MEH-2325 self-QA — the admin claim-link UI at 375 and 1440.
 *
 * Drives the REAL build (`next start`); only /api/** is synthetic (page.route
 * fixtures + a faked admin session), same harness as qa-meh2209. Captures:
 *   - /admin/producers/new, scrolled to the as_draft option
 *   - a draft's edit page, before and after minting the link
 *   - the 409 path (an already-claimed draft)
 *
 * Disposable probe, not a gate. The gate is __tests__/AdminClaimLink.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2325/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const DRAFT = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "גבינות הגליל", city: "ראש פינה", status: "draft", slug: null,
  categories: [], products: [], images: [], delivery_area_cities: [],
  has_physical_location: true, offers_delivery: false,
};
const CLAIMED = { ...DRAFT, id: "33333333-3333-3333-3333-333333333333", name: "דבש הגולן" };
const CONFLICT = "בית העסק כבר שויך לבעלת עסק";

const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function newPage(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "he-IL" });
  await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-token"));
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const m = route.request().method();
    if (p === "/auth/me") return json(route, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
    if (m === "POST" && p === `/admin/producers/${DRAFT.id}/claim-link`)
      return json(route, {
        url: `https://mehamakor.co.il/he/claim?token=eyJhbGciOiJIUzI1NiJ9.qa-fixture-token`,
        expires_at: "2026-11-09T08:00:00+00:00",
      });
    if (m === "POST" && p === `/admin/producers/${CLAIMED.id}/claim-link`)
      return json(route, { detail: CONFLICT }, 409);
    if (p === `/admin/producers/${DRAFT.id}`) return json(route, DRAFT);
    if (p === `/admin/producers/${CLAIMED.id}`) return json(route, CLAIMED);
    return json(route, []);
  });
  return page;
}

// The sandbox ships its own Chromium; CI and a laptop use the pinned one.
const EXE_FLAG = "--chromium=";
const EXE = (process.argv.find((a) => a.startsWith(EXE_FLAG)) || "").slice(EXE_FLAG.length);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
try {
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    const page = await newPage(browser, w, h);

    await page.goto(`${BASE}/he/admin/producers/new`, { waitUntil: "domcontentloaded" });
    const box = page.getByTestId("as-draft-section");
    await box.waitFor({ timeout: 20_000 });
    await box.scrollIntoViewIfNeeded();
    await page.getByTestId("as-draft-checkbox").check();
    check(`${w} new: as_draft option renders`, await box.isVisible());
    await page.screenshot({ path: `${OUT}new-as-draft-${w}.png` });

    await page.goto(`${BASE}/he/admin/producers/${DRAFT.id}/edit`, { waitUntil: "domcontentloaded" });
    const panel = page.getByTestId("claim-link-panel");
    await panel.waitFor({ timeout: 20_000 });
    await page.screenshot({ path: `${OUT}edit-draft-before-${w}.png` });

    await page.getByTestId("claim-link-create").click();
    await page.getByTestId("claim-link-url").waitFor();
    await page.getByTestId("claim-link-copy").click();
    await page.getByText("הועתק").waitFor({ timeout: 3_000 }).catch(() => {});
    check(`${w} edit: link shown`, (await page.getByTestId("claim-link-url").inputValue()).includes("/claim?token="));
    check(`${w} edit: expiry shown`, (await page.getByTestId("claim-link-expires").innerText()).includes("09.11.2026"));
    await panel.screenshot({ path: `${OUT}edit-draft-link-${w}.png` });

    // The panel must sit inside the viewport. Measured on the panel, not on
    // documentElement.scrollWidth: at 375 the admin tab strip already overflows
    // by 12px on ANY producer's edit page (identical with no panel rendered —
    // an approved business), which would make a page-level check red for a
    // reason this change does not own. Reported in the PR, not hidden here.
    const box2 = await panel.boundingBox();
    check(`${w} edit: panel inside the viewport`, box2.x >= 0 && box2.x + box2.width <= w, `x=${box2.x} w=${box2.width}`);

    await page.goto(`${BASE}/he/admin/producers/${CLAIMED.id}/edit`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("claim-link-panel").waitFor({ timeout: 20_000 });
    await page.getByTestId("claim-link-create").click();
    await page.getByTestId("claim-link-error").waitFor();
    check(`${w} 409: detail verbatim`, (await page.getByTestId("claim-link-error").innerText()).includes(CONFLICT));
    await page.getByTestId("claim-link-panel").screenshot({ path: `${OUT}edit-claimed-409-${w}.png` });

    await page.context().close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAIL` : "\nall PASS");
process.exit(failures.length ? 1 : 0);
