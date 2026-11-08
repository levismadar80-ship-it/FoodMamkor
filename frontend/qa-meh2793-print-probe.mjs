/**
 * MEH-2793 — computed-style proof that `print:hidden` actually takes effect on
 * the chat launcher, which carries an INLINE style.
 *
 * Reading the class off the DOM (what the vitest suite does) proves the class
 * is present, not that it wins. The launcher sets position/zIndex inline, and
 * an inline declaration beats a class rule for the SAME property — so the
 * question is whether `display` is among them. This measures it in a real
 * browser instead of reasoning about it (frontend.md).
 *
 * CONTROL: the same element is measured under `screen` first. If the screen
 * reading is already `none`, the print reading proves nothing — the element
 * would be hidden either way — so the script fails loudly instead.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, mkdirSync } from "node:fs";

function chromePath() {
  for (const d of readdirSync("/opt/pw-browsers")) {
    const c = `/opt/pw-browsers/${d}/chrome-linux64/chrome`;
    if (existsSync(c)) return c;
  }
}

const BASE = `http://localhost:${process.env.PORT || 3100}`;
const OUT = "qa-artifacts/MEH-2793";

const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
const ctx = await browser.newContext({ deviceScaleFactor: 2, locale: "he-IL" });
await ctx.addInitScript(() => localStorage.setItem("cookieConsent", "all"));
const page = await ctx.newPage();

// /he renders the launcher (not a gated route) and needs no auth.
await page.goto(`${BASE}/he`, { waitUntil: "domcontentloaded" });
await page.locator('[data-testid="chat-launcher"]').waitFor({ timeout: 20000 });

const measure = async () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="chat-launcher"]');
    const cs = getComputedStyle(el);
    return { display: cs.display, visibility: cs.visibility, inlineDisplay: el.style.display || "(not set inline)" };
  });

await page.emulateMedia({ media: "screen" });
const onScreen = await measure();
console.log("screen :", JSON.stringify(onScreen));

await page.emulateMedia({ media: "print" });
const onPrint = await measure();
console.log("print  :", JSON.stringify(onPrint));

mkdirSync(OUT, { recursive: true });
await page.emulateMedia({ media: "print" });
await page.screenshot({ path: `${OUT}/home-print-no-chat.png`, fullPage: false });
await page.emulateMedia({ media: "screen" });
await page.screenshot({ path: `${OUT}/home-screen-chat-visible.png`, fullPage: false });

await browser.close();

// CONTROL first: a screen reading of `none` would make the print reading void.
if (onScreen.display === "none") {
  console.error("\nCONTROL FAILED: the launcher is already display:none on screen — the print reading proves nothing.");
  process.exit(1);
}
if (onPrint.display !== "none") {
  console.error(`\nFAILED: computed display under print is "${onPrint.display}", expected "none".`);
  process.exit(1);
}
console.log("\nPASS — visible on screen, display:none under print; no inline `display` to compete with.");
