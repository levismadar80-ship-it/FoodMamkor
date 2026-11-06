/**
 * MEH-2768 self-QA — the public sign-up CTA by «איך נרשמים?» method, the
 * on-site form (closed / open / sent), and the cancel page, at 375 and 1440.
 * Real `next start` build (run with NEXT_PUBLIC_API_URL=http://127.0.0.1:8000);
 * this script plays that backend on :8000 with fixtures, so SSR and the
 * browser both read the same data. Disposable probe, not a gate — the gates
 * are __tests__/RegistrationCta.test.jsx and __tests__/CancelRegistration.test.jsx.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = new URL("../../qa-artifacts/MEH-2768/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const future = "2026-12-20";
const host = (phone) => ({
  id: "u1", name: "נועה", producer_id: "22222222-2222-2222-2222-222222222222",
  producer_slug: "chavat-noa", producer_name: "חוות נועה", producer_phone: phone,
});
const EX = (id, extra) => ({
  id, title: "סדנת לחם מחמצת", description: "סדנה של בוקר שלם: מכינים מחמצת, לשים, ואופים כיכר אחת הביתה.",
  event_date: future, event_time: "10:00:00", duration_minutes: 180, city: "בנימינה", location_type: "public",
  address: "הנדיב 5", status: "approved", is_active: true, max_participants: 10, participants_count: 2,
  registered_count: 3, spots_left: 5, price_per_person: 180, category: "workshop", host: host("050-1234567"),
  registration_method: "site_form", ...extra,
});
const EXPERIENCES = {
  "11111111-0000-0000-0000-000000000001": EX("11111111-0000-0000-0000-000000000001", {}),
  "11111111-0000-0000-0000-000000000002": EX("11111111-0000-0000-0000-000000000002", { registration_method: "whatsapp", host: host("04-6543210") }),
  "11111111-0000-0000-0000-000000000003": EX("11111111-0000-0000-0000-000000000003", { spots_left: 0, registered_count: 8 }),
};
const EVENT = {
  id: "33333333-0000-0000-0000-000000000001", producer_id: "22222222-2222-2222-2222-222222222222",
  producer_name: "מחלבת הגליל", owner_kind: "producer", owner_slug: "machlava", producer_phone: "04-6543210",
  title: "יום פתוח במחלבה", description: "טעימות, סיור במחלבה ומפגש עם העיזים.", event_date: future,
  event_time: "11:00:00", location: "רחוב הגפן 3", city: "זכרון יעקב", category: "שוק", price: 0,
  max_participants: 40, registered_count: 12, spots_left: 28, is_active: true, registration_method: "site_form",
};
const TOKEN = "tok_qa_abcdefghijklmnop";
let cancelled = false;

const api = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname.replace(/^\/api/, "");
  const json = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  let m;
  if ((m = path.match(/^\/experiences\/([\w-]+)$/))) return EXPERIENCES[m[1]] ? json(200, EXPERIENCES[m[1]]) : json(404, {});
  if (path === `/events/${EVENT.id}`) return json(200, EVENT);
  if (/\/registrations$/.test(path) && req.method === "POST") return json(201, { status: "registered" });
  if (path === `/registrations/${TOKEN}`) return json(200, { kind: "experience", item_id: "11111111-0000-0000-0000-000000000001", title: "סדנת לחם מחמצת", event_date: future, status: cancelled ? "cancelled" : "registered" });
  if (path === `/registrations/${TOKEN}/cancel`) { cancelled = true; return json(200, { kind: "experience", item_id: "11111111-0000-0000-0000-000000000001", title: "סדנת לחם מחמצת", event_date: future, status: "cancelled" }); }
  if (path === "/auth/me") return json(401, {});
  return json(200, []);
});
await new Promise((r) => api.listen(8000, "127.0.0.1", r));

const failures = [];
const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`); if (!ok) failures.push(n); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const w of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 900 }, locale: "he-IL" });
    await ctx.addInitScript(() => localStorage.setItem("cookieConsent", "essential"));
    const page = await ctx.newPage();
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const shot = async (name, testId) => {
      const el = page.getByTestId(testId);
      await el.scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}${name}-${w}.png`, fullPage: false });
    };

    // 1. Workshop, on-site form: closed → open → sent.
    await page.goto(`${BASE}/experiences/11111111-0000-0000-0000-000000000001`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("registration-open").waitFor({ timeout: 20_000 });
    check(`${w} workshop: «הרשמה לסדנה»`, (await page.getByTestId("registration-open").innerText()) === "הרשמה לסדנה");
    check(`${w} workshop: question link`, await page.getByTestId("registration-question").isVisible());
    await shot("workshop-site-form-closed", "registration-site-form");
    await page.getByTestId("registration-open").click();
    await page.getByTestId("registration-form").waitFor();
    check(`${w} workshop: focus on name`, await page.evaluate(() => document.activeElement?.id === "signup-name"));
    check(`${w} workshop: no horizontal scroll (form open)`, await noHScroll());
    await shot("workshop-site-form-open", "registration-form");
    await page.getByTestId("registration-submit").click();
    check(`${w} workshop: empty submit → 3 errors`, (await page.getByText("צריך למלא את השדה הזה").count()) === 3);
    await shot("workshop-site-form-errors", "registration-form");
    await page.fill("#signup-name", "נועה כהן");
    await page.fill("#signup-phone", "050-1112233");
    await page.fill("#signup-email", "noa@example.com");
    await page.getByTestId("registration-submit").click();
    await page.getByTestId("registration-success").waitFor({ timeout: 10_000 });
    check(`${w} workshop: success line`, true);
    await shot("workshop-site-form-sent", "registration-success");

    // 2. Workshop, WhatsApp chosen but a landline → a call, no wa.me.
    await page.goto(`${BASE}/experiences/11111111-0000-0000-0000-000000000002`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("registration-phone").waitFor({ timeout: 20_000 });
    check(`${w} landline: no wa.me link`, (await page.locator('a[href*="wa.me"]').count()) === 0);
    await shot("workshop-whatsapp-landline", "registration-phone");

    // 3. Full workshop → the WhatsApp waitlist.
    await page.goto(`${BASE}/experiences/11111111-0000-0000-0000-000000000003`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("registration-waitlist").waitFor({ timeout: 20_000 });
    check(`${w} full: waitlist, no form button`, (await page.getByTestId("registration-open").count()) === 0);
    await shot("workshop-full", "registration-waitlist");

    // 4. Event, on-site form; landline → question link dials.
    await page.goto(`${BASE}/events/${EVENT.id}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("registration-open").waitFor({ timeout: 20_000 });
    check(`${w} event: «הרשמה לאירוע»`, (await page.getByTestId("registration-open").innerText()) === "הרשמה לאירוע");
    check(`${w} event: question dials`, (await page.getByTestId("registration-question").getAttribute("href")) === "tel:046543210");
    await page.getByTestId("registration-open").click();
    await page.getByTestId("registration-form").waitFor();
    check(`${w} event: no horizontal scroll`, await noHScroll());
    await shot("event-site-form-open", "registration-form");

    // 5. Cancel page: before → after.
    cancelled = false;
    await page.goto(`${BASE}/registration/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("registration-cancel-confirm").waitFor({ timeout: 20_000 });
    await shot("cancel-before", "registration-cancel");
    await page.getByTestId("registration-cancel-confirm").click();
    await page.getByTestId("registration-cancel-done").waitFor({ timeout: 10_000 });
    check(`${w} cancel: «ההרשמה בוטלה.»`, (await page.getByTestId("registration-cancel-done").innerText()) === "ההרשמה בוטלה.");
    await shot("cancel-after", "registration-cancel");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    check(`${w} cancel: noindex`, /noindex/.test(robots || ""), robots);
    await ctx.close();
  }
} finally {
  await browser.close();
  api.close();
}
console.log(failures.length ? `\n${failures.length} FAILED` : "\nALL PASS");
process.exit(failures.length ? 1 : 0);
