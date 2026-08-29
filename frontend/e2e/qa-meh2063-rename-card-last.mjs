/**
 * MEH-2063 QA harness — "שינוי שם העסק" card moved to the END of the
 * profile group's order, driven against a real `next start` build at 375
 * and 1440.
 *
 * WHY IT ROUTES THE API: same reasoning as the sibling qa-meh*.mjs scripts —
 * intercepting /api/** exercises the real page/component tree with real CSS,
 * with no backend, no database.
 *
 * CONTROL: every check compares against a value the run itself cannot
 * fabricate, and the script exits 1 with the reason on any miss.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const OUT = "qa-artifacts/MEH-2063";
const failures = [];
let checks = 0;

function check(name, ok, detail = "", measured = "") {
  checks += 1;
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  const suffix = ok ? (measured ? ` — ${measured}` : "") : detail ? ` — ${detail}` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

const USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "owner@example.com",
  role: "producer",
  producer_id: "22222222-2222-2222-2222-222222222222",
  city: "תל אביב-יפו",
};

const PROFILE = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "מאפיית לחם וזמן",
  description: "תיאור עסק לבדיקת MEH-2063.",
  short_description: "",
  images: [],
  categories: [],
  category_ids: [],
  products: [],
  products_count: 0,
  status: "approved",
  has_physical_location: true,
  city: "תל אביב-יפו",
  custom_questions: [],
  kashrut_badges: [],
  phone: "0501234567",
  primary_contact_method: "whatsapp",
  order_window: {},
  top_product_name: "לחם מחמצת",
  price_range: "מ-₪20",
};

async function stub(page) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    const json = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    const path = new URL(url).pathname.replace(/^\/api/, "");
    if (path === "/auth/me") return json(USER);
    if (path === "/producers/me") return json(PROFILE);
    return json([]);
  });
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-fixture-token");
    localStorage.setItem("cookie_consent", "accepted");
  });
}

async function run(width, height, label) {
  const sandboxChromium = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch(
    existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  );
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await stub(page);

  // ---- (1) card order inside the profile group -----------------------
  await page.goto(`${BASE}/he/producer/dashboard/edit?group=profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='group-profile']", { timeout: 20_000 });

  const order = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="group-profile"] [data-testid^="accordion-"]')).map(
      (el) => el.getAttribute("data-testid"),
    ),
  );
  const expected = [
    "accordion-images",
    "accordion-categories",
    "accordion-bio",
    "accordion-products",
    "accordion-pricing",
    "accordion-owner-story",
    "accordion-business-name",
  ];
  check(`[${label}] group order matches images→categories→bio→products→pricing→…→business-name`, JSON.stringify(order) === JSON.stringify(expected), `got ${JSON.stringify(order)}`, JSON.stringify(order));

  await page.screenshot({ path: `${OUT}/group-order-${label}.png`, fullPage: true });

  // ---- (2) completeness-meter deep-link still lands on the right card ----
  await page.goto(`${BASE}/he/producer/dashboard/edit?group=profile#business-name`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='accordion-business-name']", { timeout: 20_000 });
  await page.waitForFunction(
    () => document.querySelector("[data-testid='accordion-business-name']")?.getAttribute("aria-expanded") === "true",
    { timeout: 5_000 },
  );
  const expanded = await page.getAttribute("[data-testid='accordion-business-name']", "aria-expanded");
  check(`[${label}] #business-name deep link opens the (now-last) card`, expanded === "true", `aria-expanded=${expanded}`, `aria-expanded=${expanded}`);

  // ---- (3) a different card's deep-link still lands correctly too --------
  await page.goto(`${BASE}/he/producer/dashboard/edit?group=profile#products`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='accordion-products']", { timeout: 20_000 });
  await page.waitForFunction(
    () => document.querySelector("[data-testid='accordion-products']")?.getAttribute("aria-expanded") === "true",
    { timeout: 5_000 },
  );
  const expandedProducts = await page.getAttribute("[data-testid='accordion-products']", "aria-expanded");
  check(`[${label}] #products deep link still lands on the products card`, expandedProducts === "true", `aria-expanded=${expandedProducts}`, `aria-expanded=${expandedProducts}`);

  await browser.close();
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  await run(375, 900, "375px");
  await run(1440, 900, "1440px");

  console.log(`\n${checks} checks, ${failures.length} failures.`);
  if (failures.length) {
    console.log("FAILURES:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("QA harness crashed:", err);
  process.exit(1);
});
