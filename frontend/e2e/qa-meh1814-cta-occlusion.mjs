// MEH-1814 self-QA probe: is the "ללוח הבקרה" CTA genuinely occluded by the
// sticky header, or is the overlap only an artifact of fullPage capture with a
// position:sticky element? Playwright's toBeVisible() does NOT test occlusion,
// so the E2E green cannot answer this. elementFromPoint at the button's centre
// can: it returns whatever the user would actually click.
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, locale: "he-IL" });

let role = "consumer";
await page.addInitScript(() => localStorage.setItem("token", "e2e-token"));
await page.route("**/auth/me", (r) =>
  r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ id: 1, email: "s@mehamakor.online", name: "בעלת עסק", role }) }));
await page.route("**/favorites**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
await page.route("**/categories", (r) =>
  r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: 1, name: "חלב וגבינות" }, { id: 2, name: "לחמים ואפייה" }]) }));
await page.route("**/auth/register/producer", (r) => {
  if (r.request().method() !== "POST") return r.continue();
  role = "producer";
  return r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ access_token: "t", whatsapp_sent: true }) });
});

await page.goto(`${BASE}/register/producer`);
await page.getByTestId("register-preflight-start").click();
await page.getByTestId("register-details-name").fill("העסק שלי");
await page.getByTestId("register-details-phone").fill("0501234567");
await page.getByTestId("register-details-city").getByRole("combobox").fill("תל אביב");
await page.getByTestId("register-details-address").fill("הרצל 1");
await page.getByTestId("register-details-next").click();
await page.getByTestId("category-chip-1").click();
await page.getByTestId("register-category-license").fill("1234567");
await page.getByTestId("register-category-next").click();
await page.getByTestId("register-story-tagline").fill("הכי טרי שיש");
await page.getByTestId("register-referral-source").selectOption("instagram");
for (const cb of await page.getByTestId("register-frame-story").getByRole("checkbox").all()) await cb.check();
await page.getByTestId("register-story-submit").click();

const cta = page.getByTestId("register-success-dashboard-cta");
await cta.waitFor({ state: "visible", timeout: 10_000 });
await cta.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);

const result = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="register-success-dashboard-cta"]');
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return {
    rect: { top: Math.round(r.top), height: Math.round(r.height) },
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    hitIsCtaOrChild: !!hit && (hit === el || el.contains(hit)),
    hitTag: hit ? `${hit.tagName}.${hit.className}`.slice(0, 80) : null,
  };
});

// The real click, through the real hit-testing path. Playwright refuses to
// click an element another node covers, so a pass here IS the occlusion answer.
let clickOk = true;
let clickErr = null;
try {
  await cta.click({ timeout: 5_000, trial: true });
} catch (e) {
  clickOk = false;
  clickErr = String(e).split("\n")[0];
}

console.log(JSON.stringify({ ...result, clickOk, clickErr }, null, 2));
await page.screenshot({ path: "qa-artifacts/MEH-1814/success-cta-inviewport-375.png" });
await browser.close();
