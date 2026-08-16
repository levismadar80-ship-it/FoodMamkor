/**
 * MEH-1754 self-QA — the public recipe route under a degraded backend.
 *
 * Proves the ONE thing the resolver split claims: a backend 404 and a backend
 * 500 no longer render the same page. Captures the error state at 375 + 1440.
 *
 * Run (from frontend/, against a build whose NEXT_PUBLIC_API_URL points at
 * 127.0.0.1:9999 — this script owns that port):
 *
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:9999 npm run build
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:9999 npm run start &
 *   node qa-meh1754-recipe-error-state.mjs ../qa-artifacts/MEH-1754
 *
 * WHY THE CONTROLS: a capture harness that writes PNGs, logs success and exits
 * 0 having photographed the wrong page is a documented failure in this repo
 * (#2786), and `testing.md` requires a probe whose null output would otherwise
 * read as its reassuring output to ship with a control that fails loudly. So:
 *
 *   1. Each viewport asserts TWO cues, AND-ed (heading text AND a retry
 *      button). Either alone could be true of a page that is not the boundary.
 *   2. The run asserts the 404 leg and the 500 leg render DIFFERENT headings.
 *      That is the discrimination check — if they match, the split bought
 *      nothing at the user-visible layer and every PNG here is worthless.
 *
 * A non-zero exit means the images this run produced are NOT evidence.
 */
import { chromium } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";

const OUT = process.argv[2] ?? "../qa-artifacts/MEH-1754";
const BASE = "http://127.0.0.1:3000";
const STUB_PORT = 9999;

// One stub, two behaviours, selected by the slug in the request path: any slug
// containing "outage" is the degraded backend, everything else is a clean
// not-found. That lets a single run exercise both legs against one build.
//
// `--self-test` collapses the stub to 404-for-everything, which makes the two
// legs identical on purpose. The discrimination check below must then FIRE and
// the run must exit 1 — that is how we know a green run means something.
// (Repo precedent: `.claude/scripts/audit-skills.sh --self-test`, which CI
// asserts must exit 1.)
const SELF_TEST = process.argv.includes("--self-test");

const stub = http.createServer((req, res) => {
  const status = !SELF_TEST && req.url.includes("outage") ? 500 : 404;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ detail: `stub ${status}` }));
});
await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));

const RECIPE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const LEGS = [
  { name: "500", url: `${BASE}/bakery-outage/recipes/${RECIPE}`, capture: true },
  { name: "404", url: `${BASE}/bakery-missing/recipes/${RECIPE}`, capture: false },
];
const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  // Sandbox only: the repo's Playwright pins a browser build this image does
  // not carry. CI uses the pinned one and must not take this path.
  ...(process.env.CI ? {} : { executablePath: "/opt/pw-browsers/chromium" }),
});
const failures = [];
const ran = [];

for (const leg of LEGS) {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    const resp = await page.goto(leg.url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("h1", { timeout: 15_000 }).catch(() => {});
    const heading = ((await page.locator("h1").first().textContent().catch(() => "")) || "").trim();
    const buttons = await page.getByRole("button").count();

    if (leg.capture && !SELF_TEST) {
      await page.screenshot({ path: `${OUT}/recipe-${leg.name}-${vp.name}.png` });
    }
    ran.push({ leg: leg.name, viewport: vp.name, httpStatus: resp?.status(), heading, buttons });

    if (!heading) failures.push(`${leg.name}/${vp.name}: no <h1> text — page never resolved`);
    if (buttons < 1) failures.push(`${leg.name}/${vp.name}: no button — no recovery control`);
    await page.close();
  }
}

await browser.close();
await new Promise((r) => stub.close(r));

// The discrimination control. Compare per viewport so a difference cannot be
// an artifact of one leg being sampled at a size the other was not.
for (const vp of VIEWPORTS) {
  const outage = ran.find((r) => r.leg === "500" && r.viewport === vp.name);
  const missing = ran.find((r) => r.leg === "404" && r.viewport === vp.name);
  if (outage.heading === missing.heading) {
    failures.push(
      `${vp.name}: backend-500 and backend-404 render the SAME heading ` +
        `("${outage.heading}") — the resolver split is not visible to the user`
    );
  }
}

console.log(JSON.stringify({ selfTest: SELF_TEST, ran, failures }, null, 2));
if (SELF_TEST) {
  // Inverted: in self-test the legs are identical by construction, so silence
  // would mean the discrimination check is decorative.
  const fired = failures.some((f) => f.includes("SAME heading"));
  console.log(
    fired
      ? "[SELF-TEST PASSED] the discrimination check fired on identical legs (exit 1)"
      : "[SELF-TEST FAILED] identical legs produced no finding — the check is decorative"
  );
  process.exit(fired ? 1 : 2);
}
if (failures.length) {
  console.error(
    `\n[CONTROL FAILED] ${failures.length} check(s) failed. The PNGs from this run are NOT evidence.`
  );
  process.exit(1);
}
console.log(
  `\n[CONTROL PASSED] ${ran.length} page loads; 500 and 404 render different headings at both viewports.`
);
