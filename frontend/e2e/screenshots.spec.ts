/**
 * Visual smoke test for מהמקור.
 * Loads every key page, screenshots it, and reports console errors / failed
 * network requests / missing UI elements.
 *
 * Run:
 *   npx playwright test --headed
 * (or headless: npx playwright test)
 *
 * Screenshots land in tests/screenshots/<project>/.
 */
import { test, expect, Page, ConsoleMessage, Request } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SHOT_DIR = path.resolve(__dirname, "..", "..", "tests", "screenshots");
const REPORT_FILE = path.join(SHOT_DIR, "report.json");

type Issue = { page: string; project: string; kind: string; detail: string };
const issues: Issue[] = [];

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
});

test.afterAll(() => {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(issues, null, 2));
  console.log(`\n=== ${issues.length} issues recorded → ${REPORT_FILE} ===`);
});

async function attachWatchers(page: Page, label: string, project: string) {
  // Block external fonts (sandbox can't reach fonts.googleapis.com → screenshot hangs)
  await page.route("**/fonts.googleapis.com/**", (r) => r.abort());
  await page.route("**/fonts.gstatic.com/**", (r) => r.abort());
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      issues.push({ page: label, project, kind: "console.error", detail: msg.text().slice(0, 400) });
    }
  });
  page.on("pageerror", (err) => {
    issues.push({ page: label, project, kind: "pageerror", detail: String(err).slice(0, 400) });
  });
  page.on("requestfailed", (req: Request) => {
    const f = req.failure();
    issues.push({
      page: label,
      project,
      kind: "requestfailed",
      detail: `${req.method()} ${req.url()} — ${f?.errorText ?? "?"}`,
    });
  });
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      issues.push({
        page: label,
        project,
        kind: `http_${resp.status()}`,
        detail: `${resp.request().method()} ${resp.url()}`,
      });
    }
  });
}

async function shoot(page: Page, label: string, project: string) {
  const name = `${project}__${label.replace(/[^\w-]+/g, "_")}.png`;
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });
}

test.describe("Visual smoke", () => {
  test("home page", async ({ page }, info) => {
    const project = info.project.name;
    await attachWatchers(page, "home", project);
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    await shoot(page, "home", project);

    // Hard checks
    const hasHero = await page.locator("h1, h2").first().isVisible().catch(() => false);
    if (!hasHero) issues.push({ page: "home", project, kind: "missing_element", detail: "no h1/h2 visible" });

    const cards = await page.locator("a[href^='/producer'], a[href^='/'][class*='card'], article").count();
    if (cards === 0) issues.push({ page: "home", project, kind: "missing_element", detail: "no producer cards / links rendered" });
  });

  test("map page", async ({ page }, info) => {
    const project = info.project.name;
    await attachWatchers(page, "map", project);
    await page.goto("/map", { waitUntil: "commit" });
    // Wait for Leaflet to mount
    try {
      await page.waitForSelector(".leaflet-container", { timeout: 15_000 });
    } catch {
      issues.push({ page: "map", project, kind: "missing_element", detail: ".leaflet-container did not mount within 15s" });
    }
    await page.waitForTimeout(2500); // tiles + markers
    await shoot(page, "map", project);

    const markers = await page.locator(".leaflet-marker-icon").count();
    if (markers === 0) {
      issues.push({ page: "map", project, kind: "missing_element", detail: "no .leaflet-marker-icon rendered" });
    } else {
      console.log(`map: ${markers} markers visible`);
    }
  });

  test("producer detail page", async ({ page, request }, info) => {
    const project = info.project.name;
    await attachWatchers(page, "producer", project);
    // Pull a real producer slug from the API
    const resp = await request.get("http://localhost:8000/producers");
    const list = await resp.json();
    if (!Array.isArray(list) || list.length === 0) {
      issues.push({ page: "producer", project, kind: "fixture", detail: "GET /producers returned empty" });
      return;
    }
    const target = list.find((p: any) => p.slug) || list[0];
    const url = target.slug ? `/${target.slug}` : `/producer/${target.id}`;
    await page.goto(url, { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    await shoot(page, "producer", project);

    const heading = await page.locator("h1").first().textContent().catch(() => null);
    if (!heading || heading.trim().length === 0) {
      issues.push({ page: "producer", project, kind: "missing_element", detail: "no <h1> producer name on detail page" });
    }
    const bodyText = await page.locator("body").innerText();
    if (!bodyText.includes(target.name)) {
      issues.push({ page: "producer", project, kind: "content_mismatch", detail: `producer name "${target.name}" not visible on page` });
    }
  });

  test("about page", async ({ page }, info) => {
    const project = info.project.name;
    await attachWatchers(page, "about", project);
    await page.goto("/about", { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    await shoot(page, "about", project);
  });

  test("login page renders", async ({ page }, info) => {
    const project = info.project.name;
    await attachWatchers(page, "login", project);
    await page.goto("/login", { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    await shoot(page, "login", project);

    const email = page.locator("input[type='email']").first();
    const pwd = page.locator("input[type='password']").first();
    if (!(await email.isVisible().catch(() => false))) {
      issues.push({ page: "login", project, kind: "missing_element", detail: "no email input" });
    }
    if (!(await pwd.isVisible().catch(() => false))) {
      issues.push({ page: "login", project, kind: "missing_element", detail: "no password input" });
    }
  });

  test("admin login flow + dashboard", async ({ page }, info) => {
    const project = info.project.name;
    await attachWatchers(page, "admin", project);

    // Step 1: try /admin while unauthenticated — should redirect to /login
    await page.goto("/admin", { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    await shoot(page, "admin_unauth", project);

    // Step 2: log in via the form
    await page.goto("/login", { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    const email = page.locator("input[type='email']").first();
    const pwd = page.locator("input[type='password']").first();
    if (!(await email.isVisible().catch(() => false))) {
      issues.push({ page: "admin_login", project, kind: "missing_element", detail: "login form not found" });
      return;
    }
    await email.fill("sapir000s@gmail.com");
    await pwd.fill("Zaq123edcv");
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.locator("button[type='submit']").first().click(),
    ]);
    await page.waitForTimeout(1500);
    await shoot(page, "after_login", project);

    // Step 3: navigate to /admin
    await page.goto("/admin", { waitUntil: "commit" });
    await page.waitForTimeout(2500);
    await page.waitForTimeout(1500);
    await shoot(page, "admin_dashboard", project);

    const url = page.url();
    if (!url.includes("/admin")) {
      issues.push({ page: "admin", project, kind: "redirect", detail: `expected /admin, got ${url}` });
    }
    const headings = await page.locator("h1, h2").allTextContents();
    if (!headings.some((t) => t.includes("לוח") || t.toLowerCase().includes("dashboard"))) {
      issues.push({
        page: "admin",
        project,
        kind: "missing_element",
        detail: `dashboard heading not found. headings=${JSON.stringify(headings).slice(0, 200)}`,
      });
    }

    // Visit each admin sub-page
    for (const sub of ["producers", "users", "content", "reports", "analytics", "settings"]) {
      await page.goto(`/admin/${sub}`, { waitUntil: "commit" });
      await page.waitForTimeout(2500);
      await page.waitForTimeout(800);
      await shoot(page, `admin_${sub}`, project);
    }
  });
});
