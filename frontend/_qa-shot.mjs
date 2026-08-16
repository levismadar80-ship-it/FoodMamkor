// MEH-1599 self-QA screenshots. Throwaway — NOT a committed spec.
// The CC sandbox can't reach the Railway staging backend (MEH-360), so the
// only way to render an authenticated-but-unauthorized session locally is to
// stub GET /auth/me. e2e/CLAUDE.md's no-mocks rule governs flows/ specs; this
// is artifact generation.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const CONSUMER = { id: 42, name: "דמו לקוחה", email: "demo-consumer@example.com", role: "consumer" };
const PRODUCER = { id: 43, name: "דמו בעלת עסק", email: "demo-owner@example.com", role: "producer" };

const CASES = [
  { name: "dashboard-denied", path: "/producer/dashboard", me: CONSUMER },
  { name: "admin-denied", path: "/admin", me: CONSUMER },
  { name: "admin-denied-as-producer", path: "/admin", me: PRODUCER },
];
const VIEWPORTS = [
  { label: "375", width: 375, height: 812 },
  { label: "1440", width: 1440, height: 900 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const vp of VIEWPORTS) {
  for (const c of CASES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    await ctx.addInitScript(() => localStorage.setItem("token", "qa-fake-jwt"));
    await ctx.route("**/api/auth/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(c.me) }),
    );
    // Anything else the shell fetches must not hang the shot.
    await ctx.route("**/api/**", (route) =>
      route.request().url().includes("/auth/me")
        ? route.fallback()
        : route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:3000${c.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const denied = await page.getByTestId("access-denied").count();
    const url = page.url();
    await page.screenshot({ path: `${OUT}/${c.name}-${vp.label}.png`, fullPage: true });
    console.log(
      `${c.name} @${vp.label}  denied=${denied}  url=${url.replace("http://localhost:3000", "")}  pageErrors=${errors.length}`,
    );
    await ctx.close();
  }
}
await browser.close();
