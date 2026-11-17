#!/usr/bin/env node
/**
 * capture-page-video — record a short phone-sized video of one page, plus
 * three still screenshots, to send to a business before its page is live
 * (MEH-3377).
 *
 * What it does: opens the URL at 390×844 (a phone), waits for the page to
 * settle, scrolls from top to bottom at reading speed, and saves
 *   <out>/<name>.mp4       (H.264, plays inline in WhatsApp)
 *   <out>/<name>-1.png …   (top, middle, bottom)
 * When no system ffmpeg is installed it leaves the .webm Playwright recorded
 * and says so — WhatsApp will not play that inline.
 *
 * What it does NOT do: sign in, send anything, or read a draft by itself. Give
 * it the read-only preview link from the admin panel («קישור תצוגה מקדימה»),
 * which needs no session, or a live page's address.
 *
 * Usage (from frontend/):
 *   node scripts/capture-page-video.mjs <url> <name> [--out <dir>] [--seconds 18]
 *
 * Example:
 *   node scripts/capture-page-video.mjs \
 *     "https://mehamakor.co.il/draft-preview/<token>" sandra-perot --out ./captures
 *
 * <name> becomes the file name: latin letters, digits and hyphens only.
 * The URL (which may carry a token) is never printed.
 */
import { chromium } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const VIEWPORT = { width: 390, height: 844 };

function parseArgs(argv) {
  const pos = [];
  const opt = { out: "./captures", seconds: 18 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") opt.out = argv[(i += 1)];
    else if (argv[i] === "--seconds") opt.seconds = Number(argv[(i += 1)]);
    else pos.push(argv[i]);
  }
  return { url: pos[0], name: pos[1], ...opt };
}

function fail(msg) {
  console.error(`capture-page-video: ${msg}`);
  process.exit(1);
}

const { url, name, out, seconds } = parseArgs(process.argv.slice(2));
if (!url || !name) fail("usage: capture-page-video.mjs <url> <name> [--out <dir>] [--seconds 18]");
if (!/^https?:\/\//.test(url)) fail("the address must start with http:// or https://");
if (!/^[a-z0-9-]{1,60}$/.test(name)) fail("<name> takes lowercase latin letters, digits and hyphens only");
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 60) fail("--seconds must be between 5 and 60");

mkdirSync(out, { recursive: true });
const tmpDir = path.join(out, `.${name}-recording`);

// CHROME_PATH: for a machine whose installed browser is not the one this
// Playwright version expects (the Claude Code cloud sandbox is one).
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "he-IL",
  recordVideo: { dir: tmpDir, size: VIEWPORT },
});
// The cookie banner would sit over the bottom of every frame. "essential"
// is the answer that loads no analytics (components/CookieBanner.jsx), which
// is also right for a recording nobody is browsing.
await context.addInitScript(() => {
  try {
    localStorage.setItem("cookieConsent", "essential");
  } catch {
    // storage blocked — the banner stays; the recording is still usable
  }
});
const page = await context.newPage();

let status = 0;
try {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  status = res?.status() ?? 0;
  // Readiness is the page's own content, not network silence (testing.md:
  // no unbounded networkidle). Either the business page or the dead-link page.
  await page
    .locator('h1, [data-testid="draft-preview-invalid"]')
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
} catch (err) {
  await context.close();
  await browser.close();
  rmSync(tmpDir, { recursive: true, force: true });
  fail(`the page did not load (${err.name})`);
}

if (await page.locator('[data-testid="draft-preview-invalid"]').count()) {
  await context.close();
  await browser.close();
  rmSync(tmpDir, { recursive: true, force: true });
  fail("this preview link is no longer active — create a new one in the admin");
}
if (status >= 400) {
  await context.close();
  await browser.close();
  rmSync(tmpDir, { recursive: true, force: true });
  fail(`the page answered ${status}`);
}

// Let the hero image paint before the first frame anyone will look at.
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, `${name}-1.png`) });

const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
const steps = Math.max(1, Math.round((seconds * 1000) / 50));
let midShot = false;
for (let i = 1; i <= steps; i += 1) {
  // Ease in and out, so the scroll reads as a hand and not as a script.
  const p = i / steps;
  const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(total * eased));
  await page.waitForTimeout(50);
  if (!midShot && p >= 0.5) {
    midShot = true;
    await page.screenshot({ path: path.join(out, `${name}-2.png`) });
  }
}
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(out, `${name}-3.png`) });

const video = page.video();
await context.close(); // flushes the recording
await browser.close();

const webm = path.join(out, `${name}.webm`);
renameSync(await video.path(), webm);
rmSync(tmpDir, { recursive: true, force: true });

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
if (!hasFfmpeg) {
  console.log(`saved ${webm} and 3 screenshots.`);
  console.log("no ffmpeg on this machine, so the video stayed .webm (WhatsApp will not play it inline).");
  process.exit(0);
}
const mp4 = path.join(out, `${name}.mp4`);
execFileSync(
  "ffmpeg",
  // yuv420p + even dimensions + faststart: what WhatsApp and iOS need to play inline.
  ["-y", "-loglevel", "error", "-i", webm, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-movflags", "+faststart", "-crf", "23", mp4],
  { stdio: "inherit" },
);
if (existsSync(mp4)) rmSync(webm);
console.log(`saved ${mp4} and 3 screenshots (${name}-1.png … ${name}-3.png).`);
