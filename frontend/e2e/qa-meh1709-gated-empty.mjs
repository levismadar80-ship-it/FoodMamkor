// MEH-1709 self-QA: real-browser capture of the group-buys dashboard in both
// gated states. The dashboard is auth-gated and backend-backed, and the CC
// sandbox cannot reach Railway — so the backend is stubbed at the network
// layer (baseURL is same-origin "/api") and a token is seeded pre-hydration.
// Everything below the API boundary is the real built page.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3111";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const USER = { id: "u1", email: "owner@example.com", role: "producer", producer_id: "p1", is_email_verified: true };

const STATES = [
  { name: "unapproved-empty", status: "pending", groups: [] },
  { name: "approved-empty", status: "approved", groups: [] },
];
const WIDTHS = [375, 1440];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--ssl-version-max=tls1.2"] });

for (const state of STATES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 900 },
      deviceScaleFactor: 2,
      locale: "he-IL",
    });
    await ctx.addInitScript(() => localStorage.setItem("token", "stub.jwt.token"));

    await ctx.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      const p = url.pathname.replace(/^\/api/, "");
      const json = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      if (p === "/auth/me") return json(USER);
      if (p === "/producers/me/dashboard")
        return json({ producer: { id: "p1", city: "תל אביב", status: state.status } });
      if (p === "/group-buys")
        return json(url.searchParams.get("status") === "open" ? state.groups : []);
      return json([]);
    });

    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/he/producer/dashboard/group-buys`, { waitUntil: "networkidle" });
    // Wait for the empty state to settle (loading copy gone).
    await page.waitForSelector("h3", { timeout: 15000 });

    const body = await page.locator("body").innerText();
    const probe = {
      state: state.name,
      width,
      headerCreateButton: await page.getByRole("button", { name: "+ קבוצת רכש חדשה" }).count(),
      emptyStateCta: await page.getByRole("button", { name: "+ צרו קבוצה ראשונה" }).count(),
      disabledButtons: await page.locator("button[disabled]").count(),
      standaloneHint: await page.locator('[data-testid="group-buy-approval-hint"]').count(),
      gateStringOccurrences: (body.match(/פתיחת קבוצת רכש תתאפשר לאחר אישור העסק/g) || []).length,
      whatsThis: await page.locator('[data-testid="whats-this-group-buy"]').count(),
      pageErrors: errors,
    };
    console.log(JSON.stringify(probe));

    await page.screenshot({ path: `${OUT}/${state.name}-${width}.png`, fullPage: true });
    await ctx.close();
  }
}

await browser.close();
