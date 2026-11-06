/**
 * MEH-2766 self-QA — «איך נרשמים?» in the owner's forms + the on-site sign-up
 * list on the manage pages, at 375 and 1440. Real `next start` build; only
 * /api/** is synthetic (faked producer session). Disposable probe, not a gate —
 * the gates are __tests__/RegistrationMethodField.test.jsx and
 * __tests__/RegistrationsList.test.jsx.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = new URL("../../qa-artifacts/MEH-2766/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const USER = {
  id: "11111111-1111-1111-1111-111111111111", email: "owner@example.com", name: "דנה",
  role: "producer", producer_id: "22222222-2222-2222-2222-222222222222",
  phone_verified: true, email_verified: true,
};
const LANDLINE = { id: USER.producer_id, name: "גבינות הגליל", status: "approved", phone: "04-6543210" };
const MOBILE = { ...LANDLINE, phone: "050-1234567" };

const future = "2026-12-20";
const EXPERIENCES = [
  { id: "e1", title: "סדנת לחם מחמצת", status: "approved", is_active: true, event_date: future, city: "בנימינה",
    max_participants: 10, participants_count: 2, registered_count: 3, registration_method: "site_form" },
  { id: "e2", title: "סיור בחווה", status: "approved", is_active: true, event_date: future, city: "פרדס חנה",
    max_participants: 12, participants_count: 4, registered_count: 0, registration_method: "whatsapp" },
];
const EVENTS = [
  { id: "v1", title: "יום פתוח במחלבה", is_active: true, event_date: future, city: "זכרון יעקב",
    registered_count: 0, registration_method: "site_form" },
];
const REGS = [
  { id: "r1", name: "נועה כהן", phone: "050-1112233", email: "noa@example.com", status: "registered", created_at: "2026-11-06T10:00:00Z" },
  { id: "r2", name: "מיכל לוי", phone: "052-4445566", email: "michal.levi.long.address@example.com", status: "cancelled", created_at: "2026-11-06T11:00:00Z" },
  { id: "r3", name: "יעל אברהם", phone: "054-7778899", email: "yael@example.com", status: "registered", created_at: "2026-11-06T12:00:00Z" },
  { id: "r4", name: "שירה מזרחי", phone: "053-1231231", email: "shira@example.com", status: "registered", created_at: "2026-11-06T13:00:00Z" },
];

const failures = [];
const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) failures.push(n); };

async function ctxFor(browser, w, profile) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 }, locale: "he-IL" });
  await ctx.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookieConsent", "essential");
  });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/auth/me") return json(USER);
    if (p === "/producers/me") return json(profile);
    if (p === "/producers/me/dashboard") return json({ producer: profile });
    if (p === "/experiences/mine") return json(EXPERIENCES);
    if (p === "/events/mine") return json(EVENTS);
    if (p === "/experiences/e1/registrations") return json(REGS);
    if (p === "/events/v1/registrations") return json([]);
    return json([]);
  });
  return { ctx, page };
}

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const w of [375, 1440]) {
    // 1. New workshop form, landline business: WhatsApp disabled + reason.
    {
      const { ctx, page } = await ctxFor(browser, w, LANDLINE);
      await page.goto(`${BASE}/producer/dashboard/experiences/new`, { waitUntil: "domcontentloaded" });
      const field = page.getByTestId("registration-method");
      await field.waitFor({ timeout: 20_000 });
      await page.waitForFunction(() => document.getElementById("registration_method_whatsapp")?.disabled, null, { timeout: 10_000 }).catch(() => {});
      check(`${w} form: site_form checked by default`, await page.locator("#registration_method_site_form").isChecked());
      check(`${w} form: whatsapp disabled for landline`, await page.locator("#registration_method_whatsapp").isDisabled());
      check(`${w} form: no URL box yet`, (await page.locator("#registration_url").count()) === 0);
      await field.scrollIntoViewIfNeeded();
      await field.screenshot({ path: `${OUT}form-landline-${w}.png` });
      await page.locator("label[for=registration_method_external_url]").click();
      check(`${w} form: URL box after external`, await page.locator("#registration_url").isVisible());
      check(`${w} form: no horizontal scroll`, await noHScroll(page));
      await field.screenshot({ path: `${OUT}form-external-${w}.png` });
      await ctx.close();
    }
    // 2. New event form, mobile business: everything enabled.
    {
      const { ctx, page } = await ctxFor(browser, w, MOBILE);
      await page.goto(`${BASE}/producer/dashboard/events/new`, { waitUntil: "domcontentloaded" });
      const field = page.getByTestId("registration-method");
      await field.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      check(`${w} event form: whatsapp enabled for mobile`, !(await page.locator("#registration_method_whatsapp").isDisabled()));
      await field.scrollIntoViewIfNeeded();
      await field.screenshot({ path: `${OUT}event-form-mobile-${w}.png` });
      await ctx.close();
    }
    // 3. Workshops manage list: closed, then open (many, one cancelled).
    {
      const { ctx, page } = await ctxFor(browser, w, MOBILE);
      await page.goto(`${BASE}/producer/dashboard/experiences`, { waitUntil: "domcontentloaded" });
      const list = page.getByTestId("registrations-list");
      await list.first().waitFor({ timeout: 20_000 });
      check(`${w} manage: only the site_form workshop has a list`, (await list.count()) === 1);
      const labels = await page.getByTestId("experience-signup-count").allInnerTexts();
      check(`${w} manage: site_form count relabelled`, labels[0]?.includes("נרשמו מחוץ לאתר"), labels[0]);
      check(`${w} manage: whatsapp count keeps old label`, labels[1]?.includes("כמה כבר נרשמו"), labels[1]);
      await page.screenshot({ path: `${OUT}manage-experiences-closed-${w}.png`, fullPage: true });
      await list.locator("summary").click();
      await page.getByTestId("registration-row").first().waitFor({ timeout: 10_000 });
      check(`${w} manage: 4 rows`, (await page.getByTestId("registration-row").count()) === 4);
      check(`${w} manage: no horizontal scroll`, await noHScroll(page));
      await page.waitForTimeout(400); // caret rotation settles
      await page.screenshot({ path: `${OUT}manage-experiences-open-${w}.png`, fullPage: true });
      await ctx.close();
    }
    // 4. Events manage list: open × 0.
    {
      const { ctx, page } = await ctxFor(browser, w, MOBILE);
      await page.goto(`${BASE}/producer/dashboard/events`, { waitUntil: "domcontentloaded" });
      const list = page.getByTestId("registrations-list");
      await list.waitFor({ timeout: 20_000 });
      await list.locator("summary").click();
      await page.getByTestId("registrations-empty").waitFor({ timeout: 10_000 });
      check(`${w} events: empty line`, true);
      await page.waitForTimeout(400); // caret rotation settles
      await page.screenshot({ path: `${OUT}manage-events-open-empty-${w}.png`, fullPage: true });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
