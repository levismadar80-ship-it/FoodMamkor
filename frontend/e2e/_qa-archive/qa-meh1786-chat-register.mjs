// MEH-1786 chunk ג QA: the chatbot's registration answer must no longer claim
// a 3-step form. Clicks the "איך נרשמים כבית עסק?" prompt and captures the
// reply, which ChatWidget answers locally from chat.answers.register
// (ANSWERED_PROMPT_IDS, ChatWidget.jsx:85) — no API round-trip.
//
// Captured at DESKTOP, not 375px: ChatWidget.jsx has `if (!isDesktop) return
// null` (MEH-1410), so the widget renders nothing on mobile. The 375px pass
// below exists to prove that absence rather than to skip it.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "qa-artifacts/MEH-1786";
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PROMPT = "איך נרשמים כבית עסק?";
const BANNED = ["3 שלבים", "3-step"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ["--ssl-version-max=tls1.2"] });

async function visit(width, height, label) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: "he-IL",
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  const consent = page.getByRole("button", { name: /קבלו הכל|קבל/ }).first();
  if (await consent.count()) { await consent.click(); await page.waitForTimeout(400); }
  const launcher = page.getByRole("button", { name: /שאלו אותנו|שאלה\? שאלו אותי/ }).first();
  const launcherCount = await launcher.count();
  return { page, launcher, launcherCount, label };
}

// ── 375px: prove the widget is absent, don't quietly skip ──────────────
const m = await visit(375, 812, "mobile");
await m.page.screenshot({ path: `${OUT}/chat-375-absent.png`, fullPage: false });
console.log(`[375px] chat launcher elements found: ${m.launcherCount}  ` +
  `${m.launcherCount === 0 ? "(expected 0 — ChatWidget.jsx:!isDesktop returns null, MEH-1410)" : "(UNEXPECTED)"}`);
await m.page.close();

// ── desktop: the surface where this copy is actually reachable ─────────
const d = await visit(1280, 900, "desktop");
if (d.launcherCount === 0) {
  console.error("FAIL: chat launcher not found at 1280px either — cannot capture the answer");
  await browser.close();
  process.exit(1);
}
await d.launcher.click();
await d.page.waitForTimeout(600);
await d.page.getByRole("button", { name: PROMPT }).first().click();
await d.page.waitForTimeout(800);

const panel = d.page.getByRole("dialog").first();
const target = (await panel.count()) ? panel : d.page.locator("body");
await target.screenshot({ path: `${OUT}/chat-register-answer-1280.png` });

const text = await target.innerText();
await browser.close();

const hits = BANNED.filter((b) => text.includes(b));
console.log("\n--- rendered chat panel text ---\n" + text.trim() + "\n-------------------------------");
if (hits.length) {
  console.error(`FAIL: banned step-count phrase still rendered: ${hits.join(", ")}`);
  process.exit(1);
}
if (!text.includes("טופס קצר")) {
  console.error('FAIL: expected "טופס קצר" in the rendered answer, not found');
  process.exit(1);
}
console.log('\nPASS: answer renders "טופס קצר"; no "3 שלבים" / "3-step" anywhere in the panel.');
