/**
 * MEH-2138 chunk E self-QA — the queue counter above the admin producers table.
 *
 * vitest already proves what it counts and which row it calls oldest. What it
 * cannot show, because jsdom does no layout, is whether the line actually
 * REACHES the admin screen: the page sits behind a role guard and a real fetch,
 * and a counter that renders correctly in isolation is worth nothing if the
 * page it mounts on never gets past its loading state.
 *
 * Case 0 is a control with a known answer, run FIRST: an admin queue with NO
 * pending rows must render NO summary. Without it, "the summary is present"
 * on the populated page is satisfied by a component that renders
 * unconditionally — which is precisely the «0 ממתינים» line this refuses.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2138e-queue-sla-summary.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2138e";
const BASE = "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

// Read the copy rather than retyping it — a retyped string is a second owner
// that passes while the rendered one is wrong.
const HE = JSON.parse(fs.readFileSync("./messages/he.json", "utf8"));
const SUMMARY_TEMPLATE = HE.admin.producers.queue_summary;

let failures = 0;
const ran = [];
const check = (label, ok, detail) => {
  ran.push(label);
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

let seq = 0;
const producer = (over = {}) => {
  seq += 1;
  return {
    id: `0000000${seq}-0000-0000-0000-00000000000${seq}`,
    name: `עסק ${seq}`,
    slug: `business-${seq}`,
    status: "pending",
    city: "תל אביב",
    phone: "0501234567",
    email: `owner${seq}@example.com`,
    categories: [],
    products: [],
    images: [],
    locations: [],
    delivery_areas: [],
    business_days_waiting: 0,
    submitted_for_review_at: "2026-08-18T09:00:00Z",
    created_at: "2026-08-18T09:00:00Z",
    ...over,
  };
};

async function stub(page, rows) {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        email: "admin@mehamakor.online",
        name: "מנהלת",
        role: "admin",
      }),
    }),
  );
  // `/api/admin/producers` EXACTLY — both halves matter.
  //   * `.endsWith("/admin/producers")` alone also matches the PAGE navigation
  //     (`/he/admin/producers`), so the browser was served the JSON list as the
  //     document and rendered it as text. The harness's own diagnostic caught
  //     that: `testids: []` and a body of raw JSON.
  //   * a `**/admin/producers**` glob would swallow every subroute (/approve,
  //     /{id}, …) and answer each with the LIST, which the page then treats as
  //     an object (the chunk-A harness learned that one).
  await page.route(
    (url) => url.pathname === "/api/admin/producers",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-total-count": String(rows.length) },
        body: JSON.stringify(rows),
      }),
  );
  await page.addInitScript(() => localStorage.setItem("token", "qa-token"));
}

function readSummary(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="queue-sla-summary"]');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return {
      found: true,
      text: el.textContent.trim(),
      count: el.dataset.count,
      oldest: el.dataset.oldest,
      cls: el.className,
      // Zero-size boxes make every geometric claim vacuous.
      w: Math.round(r.width),
      h: Math.round(r.height),
      insideViewport: r.right <= window.innerWidth + 1 && r.left >= -1,
    };
  });
}

async function open(browser, width, rows) {
  const page = await browser.newPage({ viewport: { width, height: width === 375 ? 812 : 900 } });
  await stub(page, rows);
  page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE:", m.text().slice(0, 300));
  });
  await page.goto(`${BASE}/he/admin/producers`, { waitUntil: "domcontentloaded" });
  try {
    // Gate on the TABLE, not on the summary — gating on the thing under test
    // turns "it is missing" into "nothing to check", which is the guard-that-
    // consults-its-own-subject failure .claude/rules/testing.md documents.
    await page
      .locator('table, [data-testid="admin-producers-empty"]')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 });
  } catch (err) {
    const seen = await page.evaluate(() => ({
      url: location.href,
      testids: [...document.querySelectorAll("[data-testid]")].map((n) => n.dataset.testid).slice(0, 40),
      text: document.body.innerText.slice(0, 500),
    }));
    console.error("DIAGNOSTIC — what the page actually rendered:", JSON.stringify(seen, null, 1));
    throw err;
  }
  await page.waitForTimeout(400);
  return page;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });

  // ── case 0: CONTROL — an admin queue with nothing pending shows no line ────
  const ctlRows = [
    producer({ status: "approved", business_days_waiting: 30 }),
    producer({ status: "draft", business_days_waiting: 40 }),
  ];
  const ctlPage = await open(browser, 1440, ctlRows);
  const ctl = await readSummary(ctlPage);
  check(
    "0. CONTROL: no pending rows → no summary line at all",
    ctl.found === false,
    ctl.found
      ? `rendered «${ctl.text}» — ⛔ CONTROL FAILED: the component renders unconditionally, so "the summary is present" below proves nothing`
      : "absent, as required",
  );
  await ctlPage.close();

  const rows = [
    producer({ business_days_waiting: 1 }),
    producer({ business_days_waiting: 5 }), // the oldest, deliberately not first
    producer({ business_days_waiting: 2 }),
    producer({ status: "approved", business_days_waiting: 99 }), // must be excluded
  ];

  for (const width of [375, 1440]) {
    const page = await open(browser, width, rows);
    const r = await readSummary(page);

    check(`${width}: the summary renders`, r.found, r.found ? `«${r.text}»` : "NOT FOUND");
    if (r.found) {
      check(`${width}: it counts 3 pending, excluding the approved row`, r.count === "3", `count=${r.count}`);
      check(`${width}: it names 5 business days as the oldest`, r.oldest === "5", `oldest=${r.oldest}`);
      check(
        `${width}: the rendered text carries BOTH numbers — no unsubstituted placeholder`,
        r.text.includes("3") && r.text.includes("5") && !r.text.includes("{"),
        `text=«${r.text}» (template=«${SUMMARY_TEMPLATE}»)`,
      );
      check(`${width}: 5 days is a breach → red tone`, r.cls.includes("bg-red-100"), r.cls);
      check(`${width}: the box is real and inside the viewport`, r.w > 0 && r.h > 0 && r.insideViewport,
        `${r.w}x${r.h}, inside=${r.insideViewport}`);
    }

    await page.screenshot({ path: `${OUT}/queue-sla-summary-${width}.png`, fullPage: false });
    console.log(`  → ${OUT}/queue-sla-summary-${width}.png`);
    await page.close();
  }

  await browser.close();
  // Derived, never stated — a literal goes stale the moment a case is added.
  console.log(`\n${failures ? "FAIL" : "PASS"} — ${ran.length - failures}/${ran.length} assertions`);
  process.exit(failures ? 1 : 0);
}

main();
