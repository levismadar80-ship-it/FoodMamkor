/**
 * MEH-1858 probe — what does the login request actually return when the
 * role-reachability spec "flakes"?
 *
 * The spec's symptom is a 20s toHaveURL timeout. The DOM at failure time shows
 * the generic error alert, i.e. LoginClient's catch branch ran: the login POST
 * failed and the app correctly did not navigate. So the question is not "why
 * did the redirect race" but "why did the request fail" — and that needs the
 * status code, which the spec never captures.
 *
 * MANUAL HARNESS — never wire this into CI, and do not turn it into a spec.
 * It deliberately loops logins to exhaust the limiter, which is the opposite
 * of what a suite should do. `frontend/e2e/CLAUDE.md` already carries the
 * rule for the sibling endpoint — "shared GitHub Actions runner IPs burn the
 * /auth/register limiter quota across PRs … don't loop registrations in a
 * single spec". That rule was written about register; this probe is the
 * measurement showing the same is true of /auth/login, and that the E2E suite
 * is already crossing the line without meaning to.
 *
 * Requires a Chromium at PW_EXECUTABLE_PATH (defaults to the CC sandbox path)
 * and DEMO_OWNER_PASSWORD in the environment.
 *
 * Run:
 *   TEST_URL=https://staging.mehamakor.online node e2e/qa-meh1858-login-probe.mjs 30
 */
import { chromium, devices } from "@playwright/test";

const BASE = process.env.TEST_URL || "https://staging.mehamakor.online";
const PASSWORD = process.env.DEMO_OWNER_PASSWORD;
const N = Number(process.argv[2] || 20);

if (!PASSWORD) {
  console.error("DEMO_OWNER_PASSWORD unset — cannot probe.");
  process.exit(2);
}

// Sandbox-specific by default: the CC image ships a pinned Chromium at this
// path and downloads are disabled, so `@playwright/test`'s own build is absent
// (it wants 1234, the image has 1194). Overridable so the probe is runnable
// off this machine — without the override it throws browser-not-found, which
// is a confusing way to learn about a path dependency. Same pin, same reason,
// as playwright.local.config.ts:16 (MEH-997).
const browser = await chromium.launch({
  executablePath: process.env.PW_EXECUTABLE_PATH || "/opt/pw-browsers/chromium",
  // Sandbox Chromium offers TLS 1.3; the Vercel edge drops it and it surfaces
  // as ERR_CONNECTION_RESET, which looks like the site being down.
  args: ["--ssl-version-max=tls1.2"],
});

const results = [];

for (let i = 1; i <= N; i++) {
  const ctx = await browser.newContext({
    ...devices["Pixel 5"],
    locale: "he-IL",
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
      "x-vercel-skip-toolbar": "1",
    },
  });
  const page = await ctx.newPage();

  const seen = [];
  page.on("response", async (r) => {
    if (!/\/auth\/login/.test(r.url())) return;
    let body = "";
    try {
      body = (await r.text()).slice(0, 200);
    } catch {
      body = "<unreadable>";
    }
    seen.push({ status: r.status(), body });
  });
  page.on("requestfailed", (r) => {
    if (/\/auth\/login/.test(r.url())) {
      seen.push({ status: "REQUEST-FAILED", body: r.failure()?.errorText || "" });
    }
  });

  const t0 = Date.now();
  let outcome = "?";
  try {
    await page.goto(`${BASE}/producer/dashboard`, { waitUntil: "load", timeout: 30_000 });
    await page.getByTestId("login-email").fill("demo-owner@example.com");
    await page.getByTestId("login-password").fill(PASSWORD);
    await page.getByTestId("login-submit").click();
    // Deliberately short: we are measuring whether it lands, not waiting it out.
    await page.waitForURL(/\/producer\/dashboard/, { timeout: 12_000 });
    outcome = "LANDED";
  } catch {
    outcome = "NO-NAV";
  }
  const ms = Date.now() - t0;

  const alert = await page
    .locator('[role="alert"]')
    .first()
    .textContent()
    .catch(() => null);

  results.push({ i, outcome, ms, responses: seen, alert: alert?.trim() || null });
  const tag = outcome === "LANDED" ? "ok " : "FAIL";
  console.log(
    `${tag} #${String(i).padStart(2)} ${String(ms).padStart(6)}ms  ` +
      `login-responses=${JSON.stringify(seen.map((s) => s.status))}` +
      (outcome === "LANDED" ? "" : `  alert=${JSON.stringify(alert?.trim() || null)}`),
  );
  if (outcome !== "LANDED") {
    for (const s of seen) console.log(`      body: ${s.body}`);
  }

  await ctx.close();
}

await browser.close();

const failures = results.filter((r) => r.outcome !== "LANDED");
console.log(`\n════ ${failures.length}/${N} did not land ════`);
for (const f of failures) {
  console.log(`  #${f.i}  ${f.ms}ms  statuses=${JSON.stringify(f.responses.map((s) => s.status))}  alert=${JSON.stringify(f.alert)}`);
}
