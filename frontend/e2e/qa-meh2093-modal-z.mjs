/**
 * MEH-2093 chunk B self-QA — do the `fixed inset-0 z-50` dialogs paint under the
 * global header and the mobile BottomNav?
 *
 * Drives the REAL pages in Chromium against a `next start` server with every
 * /api/** call fulfilled from fixtures (the CC sandbox has no backend and cannot
 * reach Railway — CLAUDE.md "Known Bug Patterns").
 * REUSES: e2e/qa-meh1566-admin-settings.mjs (auth fixture + route shape).
 *
 * ── The instrument, and why it is not the obvious one ────────────────────────
 * The obvious probe is `document.elementFromPoint()` over the header strip. It
 * is WRONG here and was tried first: `Header.jsx:321` and `BottomNav.jsx:359`
 * both carry `pointer-events-none` (MEH-1251), so hit-testing can never return
 * either of them — the probe would answer "the modal is on top" whether or not
 * that is true. A probe that cannot express the bug is not evidence for its
 * absence.
 *
 * What this uses instead is PIXEL BRIGHTNESS, sampled off the captured PNG:
 * the overlay is `bg-black/40`, so anything painting UNDER it darkens by a
 * measurable amount, and anything painting OVER it does not change at all.
 * That is a direct read of paint order from the rendered artifact.
 *
 * CONTROL (read it first): the page-centre pixel MUST darken when the dialog
 * opens. The centre is unambiguously under the overlay, so if it does not
 * darken, the overlay never rendered / the sampler is broken, and every other
 * reading in the run is void — including the reassuring ones.
 *
 * Not part of the Playwright suite (testMatch covers e2e/flows + e2e/visual);
 * run manually:  node e2e/qa-meh2093-modal-z.mjs
 */
import { chromium } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs";

const OUT = "../qa-artifacts/MEH-2093";
const BASE = "http://localhost:3000";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const OWNER = { id: 1, email: "owner@example.com", role: "producer", name: "ספיר" };
const ADMIN = { id: 2, email: "admin@example.com", role: "admin", name: "ספיר" };

const PRODUCTS = [
  { id: 11, name: "לחם מחמצת", price: 32, unit: "יחידה", description: "", image_url: "", available: true, diets: [] },
];

const PRODUCER_ME = {
  id: 1, producer_name: "מאפיית ספיר", slug: "sapir", city: "זכרון יעקב", status: "approved",
  description: "לחם מחמצת בתנור אבן", phone: "0500000000", email: "owner@example.com",
  categories: [], products: PRODUCTS, delivery_areas: [], custom_questions: [],
  locations: [], images: [], lat: 32.5, lng: 34.9,
};

const ADMIN_USERS = [
  { id: 3, email: "dana@example.com", name: "דנה", role: "user", is_blocked: false, created_at: "2026-01-01T00:00:00Z" },
];

const ADMIN_PRODUCERS = [
  { id: 1, producer_name: "מאפיית ספיר", slug: "sapir", city: "זכרון יעקב", status: "pending",
    email: "owner@example.com", phone: "0500000000", created_at: "2026-08-01T10:00:00Z",
    categories: [], products: [], description: "", images: [], verified: false },
];

const REPORTS = [
  { id: 5, producer_id: 1, producer_name: "מאפיית ספיר", reason: "פרטים שגויים",
    reporter_email: "a@example.com", created_at: "2026-08-01T10:00:00Z", status: "open" },
];

/** Unknown paths default to [] — a `{}` where a list is expected crashes the page
 *  into the error boundary, which is how the first run of this harness failed. */
function fixtureFor(path, user) {
  if (path === "/auth/me") return user;
  if (path === "/producers/me") return PRODUCER_ME;
  if (path === "/producers/me/products") return PRODUCTS;
  if (path === "/admin/reports") return REPORTS;
  if (path === "/admin/producers") return ADMIN_PRODUCERS;
  if (path === "/admin/users") return { items: ADMIN_USERS, total: 2, page: 1, pages: 1 };
  if (path === "/experiences/count") return { count: 0 };
  if (path === "/admin/dashboard") return { stats: { pending_moderation_count: 0, pending_kashrut_requests: 0 } };
  return [];
}

const SURFACES = [
  {
    key: "owner-product-delete",
    kind: "non-admin",
    user: OWNER,
    url: "/producer/dashboard/edit",
    file: "components/ProductsSection.jsx:724",
    // The delete button is present in the DOM from first paint but lives inside a
    // COLLAPSED accordion, so it is not visible and .click() times out. Expanding
    // "מוצרים" first is required — this cost one failed run to find.
    open: async (page) => {
      // Three levels, all collapsed by default: top card -> "מוצרים" sub-accordion
      // -> the row's delete button. The delete button is in the DOM from first
      // paint at every level, so a naive locator finds it and then times out on
      // visibility. Cost two failed runs to establish.
      await page.locator("main button").filter({ hasText: /הפרופיל שלך/ }).first().click({ timeout: 15_000 });
      await page.waitForTimeout(500);
      await page.locator("main button").filter({ hasText: /^מוצרים/ }).first().click({ timeout: 15_000 });
      await page.waitForTimeout(500);
      const del = page.locator('button[aria-label="מחקו לחם מחמצת"]').first();
      await del.scrollIntoViewIfNeeded({ timeout: 10_000 });
      await del.click({ timeout: 15_000 });
    },
  },
  {
    key: "admin-producer-delete",
    kind: "admin",
    user: ADMIN,
    url: "/admin/producers",
    file: "app/[locale]/admin/producers/page.js:103 (ApproveConfirmDialog)",
    // Deliberately NOT the delete dialog: its trigger lives inside AdminRowMenu,
    // which is portaled, so driving it adds a second failure surface that has
    // nothing to do with what is being measured. "אשר" with an unticked
    // checklist (0/7) opens ApproveConfirmDialog directly — same file, same
    // `fixed inset-0` overlay, same tier change.
    open: async (page) => {
      const btn = page.locator("main button").filter({ hasText: /אשר/ }).first();
      await btn.scrollIntoViewIfNeeded({ timeout: 10_000 });
      await btn.click({ timeout: 15_000 });
    },
  },
];

/** Mean luminance of a small patch of the PNG, so one stray antialiased pixel
 *  cannot swing the reading. */
async function patchLuma(png, cx, cy, r = 6) {
  const img = sharp(png);
  const { width, height } = await img.metadata();
  const left = Math.max(0, Math.min(width - 2 * r, cx - r));
  const top = Math.max(0, Math.min(height - 2 * r, cy - r));
  const { data, info } = await img
    .extract({ left, top, width: Math.min(2 * r, width), height: Math.min(2 * r, height) })
    .raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return sum / n;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const rows = [];

  for (const [label, width, height] of [["375", 375, 812], ["1440", 1440, 1000]]) {
    for (const s of SURFACES) {
      const ctx = await browser.newContext({
        viewport: { width, height }, locale: "he-IL",
        timezoneId: "Asia/Jerusalem", reducedMotion: "reduce",
      });
      await ctx.route("**/*", async (route) => {
        const u = route.request().url();
        if (!u.includes("/api/")) return route.continue();
        const path = new URL(u).pathname.replace(/^\/api/, "");
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify(fixtureFor(path, s.user)),
        });
      });

      const page = await ctx.newPage();
      await page.addInitScript(() => localStorage.setItem("token", "qa-fixture-token"));
      const row = { key: s.key, kind: s.kind, label, file: s.file };
      try {
        await page.goto(`${BASE}${s.url}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForTimeout(1800);

        const boundary = await page.locator("text=משהו השתבש").count();
        if (boundary > 0) throw new Error("page rendered the error boundary — fixtures insufficient");

        const closed = `${OUT}/${s.key}-${label}-closed.png`;
        await page.screenshot({ path: closed });

        await s.open(page);
        await page.waitForTimeout(700);
        const dialogs = await page.locator('[role=dialog]').count();
        if (dialogs === 0) throw new Error("no [role=dialog] after the trigger click");
        const open = `${OUT}/${s.key}-${label}-open.png`;
        await page.screenshot({ path: open });

        const pts = {
          header: [Math.round(width / 2), 30],
          // NOT the page centre: the dialog CARD is centred there, so that point
          // is white on both captures and the control reads as "no darkening"
          // even when the overlay is working. Cost one failed run. 22% down the
          // viewport is below the header and above the card on both viewports.
          centre: [Math.round(width / 2), Math.round(height * 0.22)],
          bottomNav: [Math.round(width / 2), height - 30],
        };
        for (const [name, [x, y]] of Object.entries(pts)) {
          row[name] = {
            closed: await patchLuma(closed, x, y),
            open: await patchLuma(open, x, y),
          };
        }
        row.ok = true;
      } catch (e) {
        row.error = String(e).split("\n")[0];
        try {
          row.buttons = await page.evaluate(() =>
            [...document.querySelectorAll("main button")]
              .map((b, i) => `${i}:"${(b.innerText || "").trim().slice(0, 26)}"`)
              .slice(0, 30));
        } catch { /* page gone */ }
      }
      rows.push(row);
      await ctx.close();
    }
  }
  await browser.close();

  // ── control first ──────────────────────────────────────────────────────────
  const good = rows.filter((r) => r.ok);
  const controlOk = good.length > 0 && good.every((r) => r.centre.closed - r.centre.open > 8);
  console.log("\n================ CONTROL ================");
  if (!controlOk) {
    console.log("FAIL — the page-centre pixel did not darken when the dialog opened.");
    console.log("The overlay did not render, or the sampler is broken.");
    console.log("EVERY reading below is VOID, including any that look reassuring.");
  } else {
    console.log(`PASS — centre darkens on all ${good.length} captures (overlay renders, sampler reads it).`);
  }

  console.log("\n================ PAINT ORDER ================");
  console.log("A surface that DARKENS is under the overlay. One that does NOT is painting over the modal.\n");
  for (const r of rows) {
    if (!r.ok) {
      console.log(`${r.key} @${r.label}: ERROR — ${r.error}`);
      if (r.buttons) console.log("   buttons: " + r.buttons.join(" "));
      continue;
    }
    console.log(`--- ${r.key} (${r.kind}, ${r.file}) @ ${r.label}px ---`);
    for (const name of ["centre", "header", "bottomNav"]) {
      const d = r[name].closed - r[name].open;
      const under = d > 8;
      const tag = name === "centre" ? "[control]" : under ? "under overlay  OK" : "OVER THE MODAL  <-- bug";
      console.log(
        `  ${name.padEnd(10)} luma ${r[name].closed.toFixed(1).padStart(6)} -> ${r[name].open.toFixed(1).padStart(6)}` +
        `  (Δ ${d.toFixed(1).padStart(6)})  ${tag}`,
      );
    }
    console.log("");
  }
  console.log("Note: at 1440px the BottomNav is `md:hidden`, so its sample is page background, not the nav.");
}

main();
