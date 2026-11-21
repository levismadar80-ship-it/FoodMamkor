/**
 * MEH-1836 — the discriminating proof behind the screenshots.
 *
 * The screenshots show WHICH businesses the משלוח chip returns. They cannot
 * show whether the OLD predicate could have returned them — and that is the
 * whole claim. So this replays both predicates against live staging data:
 *
 *   old: delivery_areas.any()                      (what shipped before)
 *   new: delivery_areas.any() OR delivery_nationwide
 *
 * Any business in the chip's result with delivery_nationwide=true and ZERO
 * delivery_areas rows is one the old code could NOT have returned. That set
 * being non-empty is the proof; being empty would mean the fix is correct but
 * unobservable on this seed, which would need saying plainly rather than
 * dressing a green screenshot up as evidence.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2] || "https://staging.mehamakor.online";
const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({
  locale: "he",
  extraHTTPHeaders: SECRET
    ? { "x-vercel-protection-bypass": SECRET, "x-vercel-set-bypass-cookie": "true" }
    : {},
});
const page = await ctx.newPage();
await page.goto(`${BASE}/he`, { waitUntil: "domcontentloaded", timeout: 60000 });

/** Fetch through the page so it rides the Vercel /api proxy + bypass cookie. */
const get = (path) =>
  page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { accept: "application/json" } });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, path);

const chip = await get("/api/producers?has_delivery=true&limit=100&offset=0");
console.log(`GET /api/producers?has_delivery=true → ${chip.status}, ${chip.body?.length ?? 0} rows\n`);

const rows = Array.isArray(chip.body) ? chip.body : [];
const detail = [];
for (const p of rows) {
  const d = await get(`/api/producers/${p.id}`);
  const b = d.body || {};
  detail.push({
    name: p.name,
    id: p.id,
    nationwide: b.delivery_nationwide === true,
    areas: Array.isArray(b.delivery_areas) ? b.delivery_areas.length : 0,
    excluded: Array.isArray(b.delivery_excluded_cities) ? b.delivery_excluded_cities.length : 0,
  });
}

const oldWouldReturn = detail.filter((d) => d.areas > 0);
const newlyVisible = detail.filter((d) => d.nationwide && d.areas === 0);

console.log("business                                    nationwide  areas  excluded  old-predicate");
console.log("─".repeat(96));
for (const d of detail) {
  console.log(
    `${d.name.padEnd(42).slice(0, 42)}  ${String(d.nationwide).padEnd(10)}  ${String(d.areas).padEnd(5)}  ${String(d.excluded).padEnd(8)}  ${d.areas > 0 ? "returned" : "MISSED"}`,
  );
}

console.log(`\nchip returns now .......... ${detail.length}`);
console.log(`old predicate would return  ${oldWouldReturn.length}`);
console.log(`NEWLY VISIBLE (the fix) ... ${newlyVisible.length}  ${JSON.stringify(newlyVisible.map((d) => d.name))}`);

await ctx.close();
await browser.close();
