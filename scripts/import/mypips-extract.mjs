#!/usr/bin/env node
/**
 * Module:   mypips-extract
 * Purpose:  Read a mypips store's PUBLIC pages, the way a visitor sees them,
 *           and print the catalog as JSON rows for the admin import
 *           (POST /admin/producers/{id}/product-import, MEH-2312).
 * Touches:  Network: GET https://mypips.app/<handle> and its public category
 *           pages, in a headless browser. Nothing is written anywhere.
 * Does NOT: Call mypips' backend / Firestore API, log in, or download images
 *           (the first image URL is passed through as source_image_url and
 *           is stored only — MEH-1184).
 * History:  MEH-2312 (creation).
 *
 * Usage:    node scripts/import/mypips-extract.mjs sandraperot > rows.json
 *           (needs Playwright + Chromium; run from frontend/ so it resolves)
 */

import { createRequire } from "node:module";

// CommonJS resolution, so the script runs from any directory where a global
// or frontend-local Playwright is installed.
const { chromium } = createRequire(import.meta.url)("playwright");

const handle = process.argv[2];
if (!handle || !/^[A-Za-z0-9_.-]+$/.test(handle)) {
  console.error("usage: mypips-extract.mjs <store-handle>");
  process.exit(2);
}
const BASE = `https://mypips.app/${handle}`;

function readCards() {
  // Runs in the page.
  const out = [];
  for (const card of document.querySelectorAll(".bordered-card")) {
    const img = card.querySelector("img.product-card-image");
    const content = card.querySelector(".pips-card-content");
    if (!img || !content) continue;
    const name = (img.getAttribute("alt") || "").trim();
    const lines = content.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const priceIdx = lines.findIndex((l) => /^₪\s?[\d.,]+$/.test(l));
    const price = priceIdx >= 0 ? lines[priceIdx].replace(/[^\d.]/g, "") : null;
    const unit = priceIdx >= 0 ? lines[priceIdx + 1] || null : null;
    const nameIdx = lines.indexOf(name);
    const descLines = lines
      .slice(nameIdx >= 0 ? nameIdx + 1 : 0, priceIdx >= 0 ? priceIdx : undefined)
      .filter((l) => l !== "הצג עוד" && !l.endsWith("..."));
    out.push({
      name,
      description: descLines.join(" ").trim() || null,
      price,
      unit,
      source_image_url: img.getAttribute("src") || null,
    });
  }
  return out;
}

const browser = await chromium.launch({ args: ["--ssl-version-max=tls1.2"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  const categories = await page.evaluate(async () => {
    const s = window.__STORE_DATA__;
    const v = s && s.promise ? await s.promise : s;
    return (v && v.categories) || [];
  });
  const byName = new Map();
  // The products page is ONE long list in category sections, and it is
  // VIRTUALISED: only the cards near the viewport exist in the DOM. So the
  // cards are read at every scroll step, not once at the end.
  await page.goto(`${BASE}/products`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  for (const label of ["אישור", "הכרחיים בלבד"]) {
    const btn = page.getByText(label, { exact: true });
    if (await btn.count()) await btn.first().click({ timeout: 3000 }).catch(() => {});
  }
  await page.keyboard.press("Escape");
  // One category at a time: its chip at the top switches the grid, and the
  // grid is virtualised, so each category is read at every scroll step.
  const readWhileScrolling = async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    // The page scrolls inside an inner container (window.scrollY never
    // moves), so "the end" is measured by content: 40 steps with no new
    // product.
    let idle = 0;
    for (let step = 0; step < 3000 && idle < 40; step += 1) {
      const size = byName.size;
      for (const row of await page.evaluate(readCards)) {
        if (row.name && !byName.has(row.name)) byName.set(row.name, row);
      }
      idle = byName.size === size ? idle + 1 : 0;
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(200);
    }
  };
  for (const cat of categories) {
    const chip = page.getByText(cat, { exact: true });
    if (!(await chip.count())) {
      console.error(`${cat}: no chip (empty or hidden category)`);
      continue;
    }
    const size = byName.size;
    await chip.first().click({ force: true });
    await page.waitForTimeout(2500);
    await readWhileScrolling();
    console.error(`${cat}: +${byName.size - size} (total ${byName.size})`);
  }
  console.error(`done: ${byName.size} products (${categories.length} categories in the store)`);
  process.stdout.write(`${JSON.stringify([...byName.values()], null, 1)}\n`);
} finally {
  await browser.close();
}
