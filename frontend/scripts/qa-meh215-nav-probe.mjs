/**
 * MEH-215 journey C — control for the navigation listener in
 * `e2e/flows/30-login-journey-c.spec.ts`.
 *
 * That spec proves "a failed login must not navigate anywhere" from a
 * `framenavigated` log. An empty log is the PASS condition, which means a
 * listener that never fires reports the reassuring answer and is
 * indistinguishable from correct behaviour. This probe removes that ambiguity
 * the only way available: by exercising a navigation whose answer is known in
 * advance — clicking the register link on /login, which must produce
 * ["/login", "/register"].
 *
 * It exists because the spec's first version DID mis-report. `expect.poll`
 * resolves on its first matching sample, and the log was read synchronously
 * right after the click, so the same breakage went red on desktop and green on
 * mobile. This probe is what established the listener itself was sound and the
 * ordering was the defect — without it, "the log is empty" and "the log is
 * broken" would have been the same observation.
 *
 *   usage: node scripts/qa-meh215-nav-probe.mjs [baseUrl]
 *   exit 0 = the listener observed the known navigation; exit 1 = it did not,
 *   and the spec's empty-log assertion cannot be trusted until that is fixed.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
// The sandbox caches chromium under /opt/pw-browsers; CI resolves its own.
const CHROME = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL" });
  const page = await ctx.newPage();

  const navs = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname);
  });

  await page.goto(`${BASE}/he/login`);
  navs.length = 0; // discard the initial document load — the subject is soft nav

  await page.getByTestId("login-register-link").click();
  await page.waitForURL("**/register");

  const sawRegister = navs.some((p) => p.replace(/^\/he(?=\/|$)/, "") === "/register");
  console.log(
    JSON.stringify(
      {
        logged: navs,
        verdict: sawRegister
          ? "PASS — the listener observes App Router soft navigation, so an EMPTY log in the spec is real evidence"
          : "FAIL — the listener never fired; the spec's 'no stray navigation' assertion proves nothing",
      },
      null,
      2,
    ),
  );
  if (!sawRegister) process.exitCode = 1;
} finally {
  await browser.close();
}
