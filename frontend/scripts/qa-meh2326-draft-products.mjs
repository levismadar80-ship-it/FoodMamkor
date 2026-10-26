/**
 * MEH-2326 self-QA — the admin's draft catalogue panel at 375 and 1440.
 *
 * Drives the REAL build (`next start`); only /api/** is synthetic (page.route
 * fixtures + a faked admin session), same harness as qa-meh2325. Captures:
 *   - an empty draft (0 products), then after adding one (1)
 *   - a draft with several products, with a delete confirm open
 *
 * Disposable probe, not a gate. The gate is __tests__/AdminDraftProducts.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE_FLAG = "--base=";
const BASE =
  (process.argv.find((a) => a.startsWith(BASE_FLAG)) || "").slice(BASE_FLAG.length) ||
  "http://127.0.0.1:3000";
const OUT = new URL("../../qa-artifacts/MEH-2326/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const base = {
  city: "ראש פינה", status: "draft", slug: null, categories: [], images: [],
  delivery_area_cities: [], has_physical_location: true, offers_delivery: false,
};
const EMPTY = { ...base, id: "44444444-4444-4444-4444-444444444444", name: "גבינות הגליל", products: [] };
const FULL = {
  ...base,
  id: "55555555-5555-5555-5555-555555555555",
  name: "מאפיית הכפר",
  products: [
    { id: "a1", name: "לחם מחמצת כוסמין", price_min: "32.00", price_max: null },
    { id: "a2", name: "עוגיות שיבולת שועל", price_min: "20.00", price_max: "30.00" },
    { id: "a3", name: "פוקאצ'ה רוזמרין ומלח גס בתנור אבן", price_min: "28.00", price_max: null },
  ],
};

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
  const page = await ctx.newPage();
  const posted = [];
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const m = route.request().method();
    if (p === "/auth/me") return json(route, { id: "admin-1", email: "a@b.co", role: "admin", name: "מנהלת" });
    if (m === "POST" && p === `/admin/producers/${EMPTY.id}/products`) {
      const body = route.request().postDataJSON();
      posted.push(body);
      return json(route, { id: "new-1", ...body, price_min: String(body.price_min) }, 201);
    }
    if (p === `/admin/producers/${EMPTY.id}`) return json(route, EMPTY);
    if (p === `/admin/producers/${FULL.id}`) return json(route, FULL);
    return json(route, []);
  });
  return { page, posted };
}

const EXE_FLAG = "--chromium=";
const EXE = (process.argv.find((a) => a.startsWith(EXE_FLAG)) || "").slice(EXE_FLAG.length);
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
try {
  for (const [w, h] of [[375, 812], [1440, 900]]) {
    const { page, posted } = await newPage(browser, w, h);

    await page.goto(`${BASE}/he/admin/producers/${EMPTY.id}/edit`, { waitUntil: "domcontentloaded" });
    const panel = page.getByTestId("draft-products-panel");
    await panel.waitFor({ timeout: 20_000 });
    check(`${w} empty: empty line`, await page.getByTestId("draft-products-empty").isVisible());
    await panel.screenshot({ path: `${OUT}empty-${w}.png` });

    await page.getByLabel(/שם המוצר/).fill("לחם מחמצת כוסמין");
    await page.getByLabel(/מחיר מ-/).fill("32");
    await page.getByTestId("draft-product-add").click();
    await page.getByTestId("draft-product-row").first().waitFor();
    check(`${w} add: one row`, (await page.getByTestId("draft-product-row").count()) === 1);
    check(
      `${w} add: no diet flag in the body`,
      posted.length === 1 && !Object.keys(posted[0]).some((k) => k.startsWith("is_")),
      JSON.stringify(posted[0]),
    );
    await panel.screenshot({ path: `${OUT}one-${w}.png` });

    await page.goto(`${BASE}/he/admin/producers/${FULL.id}/edit`, { waitUntil: "domcontentloaded" });
    await panel.waitFor({ timeout: 20_000 });
    check(`${w} many: three rows`, (await page.getByTestId("draft-product-row").count()) === 3);
    await page.getByTestId("draft-product-delete").nth(1).click();
    check(`${w} delete: confirm opens`, await page.getByTestId("draft-product-confirm").isVisible());
    const box = await panel.boundingBox();
    check(`${w} panel inside the viewport`, box.x >= 0 && box.x + box.width <= w, `x=${box.x} w=${box.width}`);
    await panel.screenshot({ path: `${OUT}many-confirm-${w}.png` });

    await page.context().close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAIL` : "\nall PASS");
process.exit(failures.length ? 1 : 0);
