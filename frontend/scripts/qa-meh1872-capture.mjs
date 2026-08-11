/**
 * Module:   qa-meh1872-capture
 * Purpose:  Self-QA captures for the MEH-1872 name-change UI — owner card and
 *           admin queue, at 375 px and 1440 px.
 * Touches:  Nothing real. Every /api/** call is intercepted and answered from
 *           the fixtures below; no backend, no database, no Cloudinary.
 * Does NOT: prove the endpoints work. It renders the REAL components against
 *           the REAL Next build with the network stubbed — so it is evidence
 *           about layout, copy and state rendering, and evidence about nothing
 *           else. The four endpoints shipped and were tested in PR #2745.
 * Related:  app/[locale]/producer/dashboard/edit/cards.jsx (BusinessNameCard);
 *           app/[locale]/admin/name-change-requests/page.js.
 * History:  MEH-1872 — the UI chunk deferred by PR #2745.
 *
 * Usage:  node scripts/qa-meh1872-capture.mjs        (needs `next start -p 3100`)
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3100";
const OUT = "qa-artifacts/MEH-1872";
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

const PRODUCER_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "owner@example.com",
  role: "producer",
  producer_id: "22222222-2222-2222-2222-222222222222",
  city: "תל אביב-יפו",
};
const ADMIN_USER = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "admin@example.com",
  role: "admin",
  city: "תל אביב-יפו",
};

const PROFILE = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "מאפיית לחם וזמן",
  description: "",
  short_description: "",
  images: [],
  categories: [],
  category_ids: [],
  products: [],
  status: "approved",
  has_physical_location: false,
  custom_questions: [],
  order_window: {},
};

const PENDING_REQUEST = {
  id: "44444444-4444-4444-4444-444444444444",
  producer_id: PROFILE.id,
  current_name: "מאפיית לחם וזמן",
  requested_name: "לחם וזמן — מאפייה שכונתית",
  reason: "תיקון שגיאת כתיב מההרשמה",
  status: "pending",
  admin_notes: null,
  created_at: "2026-08-11T09:00:00Z",
  reviewed_at: null,
};

const ADMIN_QUEUE = [
  PENDING_REQUEST,
  {
    id: "55555555-5555-5555-5555-555555555555",
    producer_id: "66666666-6666-6666-6666-666666666666",
    current_name: "משק הראל",
    requested_name: "משק הראל — בקר מרעה",
    reason: null,
    status: "pending",
    admin_notes: null,
    created_at: "2026-08-10T14:30:00Z",
    reviewed_at: null,
  },
];

/** Answer every /api/** call from the fixtures. `nameRequests` varies per shot. */
async function stub(page, { user, nameRequests }) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    // Match on the PATH, and match /producers/me EXACTLY. Substring matching
    // here is what produced the first run's crash: `/producers/me/products`
    // contains `/producers/me`, so it was answered with the profile OBJECT and
    // the page did `products.map(...)` on it. The capture still wrote six PNGs
    // and exited 0 — it photographed an error boundary. Opening the file is the
    // only thing that caught it.
    const path = new URL(url).pathname.replace(/^\/api/, "");

    if (path === "/auth/me") return json(user);
    if (path.startsWith("/admin/name-change-requests")) return json(ADMIN_QUEUE);
    if (path === "/producers/me/name-change-requests") return json(nameRequests);
    if (path === "/producers/me/dashboard") return json({ producer: PROFILE });
    if (path === "/producers/me") return json(PROFILE);
    // Every OTHER /producers/me/* sub-resource is a list.
    return json([]);
  });
}

async function shot(browser, { path, file, user, nameRequests, vp, prep }) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await stub(page, { user, nameRequests });
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookie_consent", "accepted");
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  if (prep) await prep(page);
  await page.screenshot({ path: `${OUT}/${file}-${vp.name}.png`, fullPage: true });
  console.log(`  captured ${file}-${vp.name}.png`);
  await context.close();
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  // The sandbox ships Chromium at a fixed path and forbids `playwright install`
  // (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1). Point at it rather than fetching one.
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  });

  for (const vp of VIEWPORTS) {
    // Owner — empty state: the filing form.
    await shot(browser, {
      path: "/he/producer/dashboard/edit?group=profile",
      file: "owner-form",
      user: PRODUCER_USER,
      nameRequests: [],
      vp,
      prep: async (page) => {
        const header = page.getByRole("button", { name: /שינוי שם העסק/ });
        if (await header.count()) await header.first().click();
        await page.waitForTimeout(400);
      },
    });

    // Owner — pending state. The 5-state discipline: this is the "one pending"
    // cell, and it is a DIFFERENT render (no form at all), not a badge on the
    // same one.
    await shot(browser, {
      path: "/he/producer/dashboard/edit?group=profile",
      file: "owner-pending",
      user: PRODUCER_USER,
      nameRequests: [PENDING_REQUEST],
      vp,
      prep: async (page) => {
        const header = page.getByRole("button", { name: /שינוי שם העסק/ });
        if (await header.count()) await header.first().click();
        await page.waitForTimeout(400);
      },
    });

    // Admin — queue with two rows (the "many" cell).
    await shot(browser, {
      path: "/he/admin/name-change-requests",
      file: "admin-queue",
      user: ADMIN_USER,
      nameRequests: [],
      vp,
    });
  }

  await browser.close();
  console.log(`\ndone — ${OUT}`);
})();
