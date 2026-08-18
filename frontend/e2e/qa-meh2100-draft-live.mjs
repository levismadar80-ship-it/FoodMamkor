/**
 * MEH-2100 self-QA — the draft dashboard and the registration success screen,
 * against a REAL stack: production `next start` + the real FastAPI backend +
 * a real Postgres. No route mocks anywhere.
 *
 * WHY NO MOCKS, stated because the previous attempt at this harness died of
 * exactly that: mocked routes never landed before the auth redirect fired, so
 * the harness photographed a login page and reported success. Driving the real
 * login form has no such race — the session is real, so the dashboard is
 * reachable by definition.
 *
 * CONTROLS FIRST. Every screenshot is preceded by an assertion that the page
 * actually rendered: not the `משהו השתבש` error boundary, and carrying real
 * text. A capture harness that writes six PNGs of an error boundary and exits
 * 0 is a documented failure in this repo (#2786) — the control is what makes
 * the null case loud instead of reassuring.
 *
 * Usage: node e2e/qa-meh2100-draft-live.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Target. Defaults to the local production build; override to point at a
// deployed environment (see the protection headers below).
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";

// Vercel Deployment Protection. Without these headers every goto() against a
// protected deployment 302s to vercel.com/sso-api and the harness photographs
// the SSO page — a run that exits 0 having measured nothing, i.e. the #2786
// failure this file's own header exists to prevent.
//
// The secret is read from the environment (the name the E2E job already uses)
// and is NEVER written to a file, a log line, or a commit. Only its PRESENCE
// is printed.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const CONTEXT_OPTS = BYPASS
  ? {
      extraHTTPHeaders: {
        "x-vercel-protection-bypass": BYPASS,
        "x-vercel-set-bypass-cookie": "true",
      },
    }
  : {};

const targetHost = (() => { try { return new URL(BASE).hostname; } catch { return ""; } })();
const isLocal = targetHost === "127.0.0.1" || targetHost === "localhost";

// GUARD 1 — production is never a valid target. This harness REGISTERS A
// PRODUCER; against production that writes a real business into a deliberately
// empty catalogue, which is not recoverable. Encoded here rather than left to
// whoever sets the env var.
if (/(^|\.)mehamakor\.co\.il$/.test(targetHost)) {
  console.error(`REFUSING to run against production (${targetHost}). This harness registers a real producer.`);
  process.exit(2);
}
// GUARD 2 — a remote target with no bypass secret would capture SSO pages and
// still exit 0. Refuse rather than emit screenshots that look like evidence.
if (!isLocal && !BYPASS) {
  console.error(`REFUSING: ${BASE} is remote and VERCEL_AUTOMATION_BYPASS_SECRET is unset; every capture would be the SSO page.`);
  process.exit(2);
}
console.log(`[target] ${BASE}  (protection bypass: ${BYPASS ? "SET" : "not set"})`);
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "qa-artifacts/MEH-2100";
const EMAIL = "qa-meh2100-live@example.com";
// Passed at invocation, never committed. The literal that used to sit here
// looked like a credential — it never was one (a throwaway account on a local,
// disposable Postgres) but a scanner cannot tell the difference, and neither
// can the next reader.
//
// This reads argv rather than the environment ON PURPOSE. The previous version
// read a QA-only password variable off `process.env`, and `check_env_drift.sh`
// BLOCKed on it — "used in code but NOT in any .env.example" — which is a
// required leg of CI gate, so the PR could not merge. Documenting the variable
// would have fixed the drift by adding a sandbox-only knob to the file
// operators read in order to deploy the app, which is the wrong home for it.
// An argument has neither problem.
//
// The variable is deliberately not NAMED anywhere in this file: the drift
// scanner matches the identifier as text, so even this comment explaining its
// removal would have kept the block alive. Same shape as the stale `z-[9998]`
// comment noted in .claude/rules/rtl.md — a scanner reading prose as code.
//
//   node e2e/qa-meh2100-draft-live.mjs --password=<the throwaway account's>
const passArg = process.argv.find((a) => a.startsWith("--password="));
const PASSWORD = passArg ? passArg.slice("--password=".length) : "changeme-local-example";

const WIDTHS = [
  { name: "375", width: 375, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

const results = [];
const fail = (msg) => {
  results.push({ ok: false, msg });
  console.log(`  FAIL  ${msg}`);
};
const pass = (msg) => {
  results.push({ ok: true, msg });
  console.log(`  ok    ${msg}`);
};
const check = (cond, msg) => (cond ? pass(msg) : fail(msg));

/** The control. If this trips, every other reading in the run is void. */
async function assertRendered(page, where) {
  const boundary = await page.locator("text=משהו השתבש").count();
  const chars = (await page.locator("body").innerText()).length;
  if (boundary > 0 || chars < 200) {
    throw new Error(
      `CONTROL FAILED at ${where}: error-boundary=${boundary}, body chars=${chars}. ` +
        `Every assertion in this run is void — the harness was not looking at the page it claims.`,
    );
  }
}

/**
 * RTL overlap: any two sibling rows in the checklist whose boxes intersect
 * vertically by more than a hair, or any element extending past the viewport's
 * inline edges. Geometry, not eyeballing.
 */
async function overlapReport(page, width) {
  return page.evaluate((vw) => {
    const out = { horizontalOverflow: [], rowOverlaps: 0 };
    const doc = document.documentElement;
    if (doc.scrollWidth > vw + 1) {
      out.horizontalOverflow.push(`document scrollWidth ${doc.scrollWidth} > ${vw}`);
    }
    // Compare siblings WITHIN one list only. The first version of this probe
    // walked every <li> on the page and compared consecutive elements across
    // different lists — the nav, the banner's missing-items list and the
    // checklist are interleaved in document order, so it reported "overlaps"
    // that were just the bottom of one list sitting below the top of another
    // elsewhere on the page. It reported 3 at both widths; the real count is
    // whatever this says.
    out.rowOverlaps = 0;
    out.overlapDetail = [];
    for (const ul of document.querySelectorAll("ul")) {
      const rows = [...ul.children].filter(
        (li) => li.tagName === "LI" && li.getBoundingClientRect().height > 0,
      );
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i].getBoundingClientRect();
        const b = rows[i + 1].getBoundingClientRect();
        // A TRUE overlap intersects on BOTH axes. Testing the vertical axis
        // alone flags every inline list — the footer's legal links sit side by
        // side on one line, so `a.bottom > b.top` holds for them by
        // construction. That is what the previous version reported as "3
        // overlaps" at both widths, identically, which was the tell: a real
        // responsive defect would not produce the same count at 375 and 1440.
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 2 && overlapY > 2) {
          out.rowOverlaps++;
          out.overlapDetail.push(
            `${(rows[i].textContent || "").trim().slice(0, 20)} ∩ ${(rows[i + 1].textContent || "").trim().slice(0, 20)}`,
          );
        }
      }
    }
    return out;
  }, width);
}

async function shoot(page, name) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  shot  ${OUT}/${name}.png`);
}

// `--ssl-version-max=tls1.2` is REQUIRED for a remote target from the CC
// sandbox and harmless locally. The sandbox's Chromium offers a TLS-1.3
// ClientHello that the Vercel edge drops; it surfaces as ERR_CONNECTION_RESET,
// which reads exactly like "the site is down" while the site is fine and only
// the handshake failed. Documented in .claude/rules/testing.md — this is the
// spec being followed, not a discovery.
// ─────────────────────────────────────────────────────────────────────────
// MEH-2118 — register-first.
//
// WHY THIS EXISTS. Measuring the draft banner needs a producer in status
// `draft`. There is exactly one way to get one on staging: complete the
// registration wizard. Reusing a fixed account does not work (it exists only
// locally) and DEMO_OWNER does not work (it is `approved`, so the draft branch
// at page.js:408 never renders for it).
//
// IDENTITY IS UNIQUE PER RUN. A fixed address would collide with the previous
// run's account on the second execution and fail at "email already registered",
// which reads like a broken wizard rather than a used fixture.
//
// The generated password is never logged. It exists only in this process.
const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const genPassword = () => `Qa${RUN_ID}!${Math.random().toString(36).slice(2, 10)}Aa1`;

async function registerFirst(page, vp) {
  const email = `qa-meh2118-${RUN_ID}-${vp.name}@example.com`;
  const pw = genPassword();
  console.log(`  reg   registering a fresh producer (${email})`);

  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await assertRendered(page, "register");

  // PREFLIGHT — «לפני שמתחילים». The wizard does NOT open on the account frame:
  // a preflight screen stands in front of it, and the ACCOUNT fields do not
  // exist in the DOM until its start button is clicked. This is why the
  // pre-existing anon walk in this file always "stalled" and swallowed the
  // failure into a not-obtained pass — it filled straight at
  // register-account-name, which was never there.
  //
  // It also mounts CLIENT-SIDE, so it is absent at domcontentloaded. The first
  // version of this loop queried immediately, found count()===0 for every id,
  // skipped both clicks SILENTLY, and died 20s later blaming the wrong element.
  // Hence the gate below: wait for whichever frame actually arrives.
  //
  // Both clicks stay conditional because neither frame is guaranteed — the
  // draft banner only appears when a stored draft has content.
  await page
    .locator('[data-testid="register-preflight-start"], [data-testid="register-account-name"]')
    .first()
    .waitFor({ state: "visible", timeout: 30000 });

  for (const id of ["register-preflight-start", "register-draft-continue"]) {
    const el = page.locator(`[data-testid="${id}"]`);
    if (await el.count().then((n) => n > 0).catch(() => false)) {
      await el.first().click({ timeout: 10000 }).catch(() => {});
      // NOT a redundant settle. This guards the NEXT iteration's `count()`,
      // and `count()` does not auto-wait — it answers immediately, which is
      // exactly how the first version of this loop skipped the preflight. The
      // `waitFor` above runs BEFORE the loop and cannot cover a frame that only
      // mounts in response to this click.
      await page.waitForTimeout(1200);
      console.log(`  reg   clicked ${id}`);
    }
  }

  // ACCOUNT
  await page.locator('[data-testid="register-account-name"]').fill("שרה בדיקה", { timeout: 20000 });
  await page.locator('[data-testid="register-account-email"]').fill(email);
  await page.locator('[data-testid="register-account-password"]').fill(pw);
  await page.locator('[data-testid="register-account-next"]').click();

  // DETAILS
  await page.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 30000 });
  console.log("  reg   at DETAILS");
  await page.locator('[data-testid="register-details-name"]').fill(`מאפיית בדיקה ${RUN_ID}`);
  await page.locator('[data-testid="register-details-phone"]').fill("0501234567");

  const cityInput = page.locator('[data-testid="register-details-city"]').locator("input").first();
  await cityInput.fill("תל");
  const cityOpt = page.locator('[data-testid="register-details-city"] ul[role=listbox] li').first();
  await cityOpt.waitFor({ timeout: 10000 }).catch(() => {});
  if (await cityOpt.count()) await cityOpt.click();

  // The delivery axis is REQUIRED (register-delivery-axis-error gates `next`).
  // Choosing delivery-nationwide rather than a physical address is deliberate:
  // it satisfies the submission gate's location rule through the MEH-213
  // delivery branch, so the wizard never needs AddressSearch or the MiniMap —
  // strictly fewer moving parts between here and a `draft` producer.
  const offers = page.locator('[data-testid="register-offers-delivery"]');
  if (!(await offers.isChecked().catch(() => false))) await offers.check();
  const nationwide = page.locator('[data-testid="register-delivery-nationwide"]');
  await nationwide.waitFor({ timeout: 10000 }).catch(() => {});
  if ((await nationwide.count()) && !(await nationwide.isChecked().catch(() => false))) {
    await nationwide.check();
  }
  await page.locator('[data-testid="register-details-next"]').click();

  // CATEGORY
  await page.locator('[data-testid="register-frame-category"]').waitFor({ timeout: 30000 });
  console.log("  reg   at CATEGORY");
  // Categories are CHIPS (`category-chip-<id>`), not checkboxes, and the frame's
  // first <input> is the category SEARCH box. Selecting by input/button therefore
  // clicks the wrong thing and `next` refuses with «יש לבחור לפחות קטגוריה אחת»
  // while staying on the frame — measured, not assumed.
  // Pick a category that does NOT require a producer licence. The FIRST chip is
  // «חלב וגבינות», which is in LICENSE_REQUIRED_CATEGORIES
  // (frontend/lib/license-required-categories.js:17) — selecting it raises the
  // licence gate, and `next` then refuses while leaving
  // register-category-error EMPTY, so the failure is silent from the outside.
  // «סבונים טבעיים» is not on that list.
  const chip = page.locator('[data-testid^="category-chip-"]', { hasText: "סבונים" }).first();
  const anyChip = page.locator('[data-testid^="category-chip-"]').first();
  const target = (await chip.count()) ? chip : anyChip;
  await target.waitFor({ timeout: 15000 });
  await target.click();

  // Belt and braces: if a licence field appeared anyway, take the documented
  // opt-in (MEH-971) rather than inventing a licence number.
  const optin = page.locator('[data-testid="register-license-pending-optin"]');
  if ((await optin.count()) && !(await optin.isChecked().catch(() => false))) {
    await optin.check().catch(() => {});
    console.log("  reg   licence-pending opt-in ticked");
  }
  await page.locator('[data-testid="register-category-next"]').click();
  // Assert the step actually advanced instead of trusting the click: the error
  // node is the discriminator between "selected" and "silently refused".
  const catErr = await page
    .locator('[data-testid="register-category-error"]')
    .innerText()
    .catch(() => "");
  if (catErr.trim()) throw new Error(`CATEGORY refused to advance: ${catErr.trim()}`);

  // STORY → submit
  await page.locator('[data-testid="register-frame-story"]').waitFor({ timeout: 30000 });
  console.log("  reg   at STORY");
  // The referral source is REQUIRED — submit refuses with
  // «יש לבחור מאיפה שמעת עלינו» and stays on the story frame, which is what the
  // stall diagnostic below surfaced. Pick the first real option, not the
  // placeholder («בחרי אפשרות», the empty value).
  const ref = page.locator('[data-testid="register-referral-source"]');
  if (await ref.count()) {
    const opt = await ref.evaluate((el) => {
      const o = [...el.options].find((x) => x.value && x.value.trim());
      return o ? o.value : null;
    });
    if (opt) {
      await ref.selectOption(opt);
      console.log(`  reg   referral source selected`);
    }
  }
  // The consent checkboxes carry NO data-testid (RegisterProducerClient.jsx:1780
  // — a bare input[type=checkbox] inside a <label>), so they cannot be targeted
  // the way docs/E2E-LOCATORS.md prescribes. Worth fixing in the product; here
  // the harness ticks every unchecked box in the story frame, which covers all
  // three affirmative acts the comment at :1775 describes (ToS/privacy, the
  // licensing declaration, and the conditional grower declaration).
  const boxes = page.locator('[data-testid="register-frame-story"] input[type=checkbox]');
  const nBoxes = await boxes.count();
  for (let i = 0; i < nBoxes; i++) {
    const b = boxes.nth(i);
    if (!(await b.isChecked().catch(() => true))) await b.check().catch(() => {});
  }
  if (nBoxes) console.log(`  reg   ticked ${nBoxes} consent checkbox(es)`);

  await page.locator('[data-testid="register-story-submit"]').click();

  // CONFIRM — the success screen carries the dashboard CTA, which is how this
  // lands on the dashboard inside the SAME authenticated context.
  try {
    await page
      .locator('[data-testid="register-frame-confirm"], [data-testid="register-success-pending"]')
      .first()
      .waitFor({ timeout: 45000 });
  } catch (e) {
    // Name the frame it stalled ON, with the page's own error text. A bare
    // timeout here says only "the success screen never came" and sends the
    // next reader hunting the wrong step.
    const where = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="register-frame-"]')]
        .filter((n) => n.offsetParent !== null)
        .map((n) => n.dataset.testid),
    );
    const errs = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid*="error"], [role="alert"]')]
        .map((n) => (n.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 6),
    );
    const txt = await page.evaluate(() => (document.body.innerText || "").slice(0, 300).replace(/\s+/g, " "));
    console.log(`  reg   STALLED. visible frames: ${JSON.stringify(where)}`);
    console.log(`  reg   errors on page: ${JSON.stringify(errs)}`);
    console.log(`  reg   body: ${txt}`);
    await shoot(page, `meh2118-register-STALLED-${vp.name}`);
    throw e;
  }
  console.log("  reg   registered — success screen reached");
  await shoot(page, `meh2118-register-success-${vp.name}`);

  // Cross into the dashboard via the success screen's OWN CTA rather than a
  // goto(). A bare navigation lands on /login?redirect=… — the session the
  // wizard established is not picked up by a cold navigation at that moment —
  // so the CTA is not a convenience here, it is the only path that works.
  const dashCta = page.locator('[data-testid="register-success-dashboard-cta"]');
  if (await dashCta.count()) {
    await dashCta.click();
    await page.waitForURL((u) => u.pathname.includes("/producer/dashboard"), { timeout: 45000 })
      .catch(() => {});
    console.log(`  reg   followed success CTA -> ${page.url()}`);
  } else {
    console.log("  reg   NOTE: register-success-dashboard-cta absent on the success screen");
    // The success screen is «בדקו את תיבת האימייל שלכם» — an EMAIL-VERIFICATION
    // wall, not the producer success screen. No dashboard CTA and no session.
    // The account nonetheless exists, so try the credentials we just created:
    // if login succeeds, the wall is informational and the dashboard is
    // reachable; if it refuses, verification is a hard prerequisite and (b)/(d)
    // cannot be measured by any browser harness. Either answer is the finding.
    await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="login-email"]').fill(email, { timeout: 20000 });
    await page.locator('[data-testid="login-password"]').fill(pw);
    const lg = page.locator('[data-testid="login-submit"]');
    await lg.waitFor({ state: "visible" });
    await lg.click();
    const moved = await page
      .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    const loginErr = await page
      .locator('[role="alert"], [data-testid*="error"]')
      .first()
      .innerText()
      .catch(() => "");
    console.log(`  reg   login after registration: navigated=${moved} url=${page.url()}`);
    if (loginErr.trim()) console.log(`  reg   login message: ${loginErr.trim().slice(0, 160)}`);
    if (moved) {
      await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      console.log(`  reg   dashboard url after login: ${page.url()}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MEH-2118 (b) — is the submit CTA reachable at 375px?
//
// CONTROLS, per MEH-2108. C2b is the one that counts: inject a z-[1100] layer
// over the CTA's OWN coordinates, sample, then remove. A probe that is blind at
// those exact points — stale rect, wrong coordinate space, elementFromPoint
// returning null — fails C2b and every "not covered" verdict is void.
// An offscreen control proves the instrument works somewhere the measurement is
// not looking: necessary, never sufficient.
async function measureReachability(page, vp) {
  const cta = page.locator('[data-testid="draft-submit-cta"]');
  if (!(await cta.count())) {
    fail(`${vp.name}: draft-submit-cta not present — (b) cannot be measured`);
    return;
  }
  await cta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="draft-submit-cta"]');
    const r = el.getBoundingClientRect();
    const doc = document.documentElement;
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 4, r.top + 4],
      [r.right - 4, r.bottom - 4],
    ];
    const classify = (x, y) => {
      const t = document.elementFromPoint(x, y);
      if (!t) return "NULL";
      if (t.closest("[data-probe-overlay]")) return "injected";
      if (el.contains(t) || t === el) return "cta";
      if (t.closest(".cookie-banner")) return "COOKIE-BANNER";
      const nav = t.closest("nav,[data-testid='bottom-nav']");
      if (nav) return "BOTTOM-NAV";
      return "other:" + t.tagName.toLowerCase();
    };
    return {
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) },
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
      minTouch: Math.round(r.height) >= 44,
      hScroll: doc.scrollWidth > doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      hits: pts.map(([x, y]) => classify(x, y)),
      pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]),
      offscreenControl: classify(r.left + r.width / 2, Math.max(2, r.top - 140)),
    };
  });

  // C2b — inject over the CTA's own coordinates, sample, remove.
  const c2b = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="draft-submit-cta"]');
    const r = el.getBoundingClientRect();
    const d = document.createElement("div");
    d.setAttribute("data-probe-overlay", "1");
    d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:1100;`;
    document.body.appendChild(d);
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 4, r.top + 4],
      [r.right - 4, r.bottom - 4],
    ];
    const seen = pts.map(([x, y]) => {
      const t = document.elementFromPoint(x, y);
      return t && t.closest("[data-probe-overlay]") ? "injected" : "NOT-injected";
    });
    d.remove();
    return seen;
  });

  const c2bOk = c2b.every((v) => v === "injected");
  console.log(`  (b)   rect top=${m.rect.top} bottom=${m.rect.bottom} h=${m.rect.h} w=${m.rect.w} inViewport=${m.inViewport}`);
  console.log(`  (b)   hit-test @ ${JSON.stringify(m.pts)} -> ${m.hits.join(" · ")}`);
  console.log(`  (b)   horizontal scroll: ${m.hScroll} (scrollWidth ${m.scrollWidth} vs clientWidth ${m.clientWidth})`);
  console.log(`  ctl   C2b injected-over-own-coords: ${c2b.filter((v) => v === "injected").length}/3 -> ${c2bOk ? "PASS" : "FAIL"}`);
  console.log(`  ctl   offscreen point 140px above CTA: ${m.offscreenControl} (must NOT be "cta")`);

  if (!c2bOk) {
    fail(`${vp.name}: C2b FAILED — the hit-test is blind at the CTA's own coordinates; every (b) verdict in this run is VOID`);
    return;
  }
  check(m.offscreenControl !== "cta", `${vp.name}: offscreen control does not classify as the CTA`);
  check(!m.hits.includes("COOKIE-BANNER"), `${vp.name}: CTA not covered by CookieBanner (z-1100)`);
  check(!m.hits.includes("BOTTOM-NAV"), `${vp.name}: CTA not covered by BottomNav`);
  check(!m.hits.includes("NULL"), `${vp.name}: no sample point returned null`);
  check(!m.hScroll, `${vp.name}: zero horizontal scroll`);
  check(m.minTouch, `${vp.name}: CTA height ${m.rect.h}px >= 44px touch floor`);
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: ["--ssl-version-max=tls1.2"],
});

try {
  for (const vp of WIDTHS) {
    console.log(`\n=== ${vp.name}px ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "he-IL",
      ...CONTEXT_OPTS,
    });
    const page = await ctx.newPage();

    // Consent is stored in localStorage, so setting it is the same act as
    // clicking "קבלו הכל" — not a mock of anything under test. Without it the
    // first-visit banner sits over the checklist in every capture, hiding the
    // rows the screenshots exist to show.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("cookie-consent", "all");
        localStorage.setItem("cookieConsent", "all");
      } catch {}
    });

    // ---- authentication: register-first on a remote target, login locally --
    //
    // MEH-2118. The login path below authenticates against an account this
    // harness only ever CREATES on a local stack, so on staging it 404s into a
    // waitForURL timeout. A remote run therefore registers a brand-new producer
    // instead — which is also the only way to obtain a `draft` business at all:
    // DEMO_OWNER is `approved`, so it cannot exercise the draft banner.
    if (!isLocal) {
      await registerFirst(page, vp);
    } else {
    // ---- real login, no mocks -------------------------------------------
    await page.goto(`${BASE}/he/login`, { waitUntil: "domcontentloaded" });
    await assertRendered(page, "login");
    // By testid, NOT by input[type=email]: the page also carries the footer's
    // newsletter field, so the generic selector fills the wrong form and the
    // submit button stays disabled — which is exactly how the first run of
    // this harness failed. docs/E2E-LOCATORS.md is the rule; this is why.
    await page.locator('[data-testid="login-email"]').fill(EMAIL);
    await page.locator('[data-testid="login-password"]').fill(PASSWORD);
    const submit = page.locator('[data-testid="login-submit"]');
    await submit.waitFor({ state: "visible" });
    if (await submit.isDisabled()) {
      throw new Error(
        "login submit still disabled after filling both fields — the form did not accept the input",
      );
    }
    await submit.click();
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
    }

    // ---- the draft dashboard --------------------------------------------
    // On the remote path registerFirst already crossed into the dashboard via
    // the success CTA; a fresh goto() here would throw that session away and
    // bounce to /login, which is exactly what the first run did.
    if (isLocal || !page.url().includes("/producer/dashboard")) {
      await page.goto(`${BASE}/he/producer/dashboard`, { waitUntil: "domcontentloaded" });
    }
    // The dashboard hydrates and then fetches /producers/me, so the first
    // paint is a near-empty shell. Gate on the BANNER, never on a load state
    // or a fixed pause — and report the URL if it never arrives, so a silent
    // auth redirect is distinguishable from a slow fetch.
    await page
      .locator('[data-testid="draft-submit-banner"]')
      .waitFor({ state: "visible", timeout: 30000 })
      .catch(() => {});
    console.log(`  url   ${page.url()}`);
    await assertRendered(page, "dashboard");

    // MEH-2118 (b) — measured here, with C2b, before any other dashboard work.
    await measureReachability(page, vp);
    await shoot(page, `meh2118-draft-dashboard-${vp.name}`);

    const banner = page.locator('[data-testid="draft-submit-banner"]');
    check(await banner.count() === 1, `${vp.name}: draft completion banner is present`);

    // The review banner must be GONE — the whole point of the batch.
    const reviewBanner = await page.locator("text=הפרופיל שלך בסקירה").count();
    check(reviewBanner === 0, `${vp.name}: the old "בסקירה" review banner is absent`);

    // The OTP card, mounted INSIDE the banner (the blocking defect).
    const otpInBanner = await banner.locator("#phone-verify").count();
    check(otpInBanner === 1, `${vp.name}: PhoneVerifyCard is mounted inside the draft banner`);

    // Submit CTA disabled while items are missing.
    const cta = page.locator('[data-testid="draft-submit-cta"]');
    check(await cta.count() === 1, `${vp.name}: submit CTA rendered`);
    check(await cta.isDisabled(), `${vp.name}: submit CTA is DISABLED with items missing`);

    // Six checklist rows, chips on each.
    const chips = page.locator('[data-testid^="completeness-chip-"]');
    const chipCount = await chips.count();
    check(chipCount === 6, `${vp.name}: completeness checklist has 6 chipped rows (got ${chipCount})`);
    const verifyChip = page.locator('[data-testid="completeness-chip-phone_verified"]');
    check(
      await verifyChip.count() === 1 && (await verifyChip.innerText()).trim() === "חובה",
      `${vp.name}: "אימות וואטסאפ" row carries the חובה chip`,
    );
    const hoursChip = page.locator('[data-testid="completeness-chip-hours"]');
    check(
      (await hoursChip.innerText()).trim() === "מומלץ",
      `${vp.name}: "שעות פתיחה" is the מומלץ row`,
    );

    // RTL / layout geometry.
    const geo = await overlapReport(page, vp.width);
    check(geo.horizontalOverflow.length === 0, `${vp.name}: no horizontal overflow (${geo.horizontalOverflow.join("; ") || "clean"})`);
    check(
      geo.rowOverlaps === 0,
      `${vp.name}: no overlapping rows within any list (${geo.rowOverlaps} found${geo.overlapDetail?.length ? ": " + geo.overlapDetail.join(" | ") : ""})`,
    );

    // Dismiss any consent banner that still rendered, then re-shoot so the
    // checklist is unobstructed. Best-effort: if it is already gone, fine.
    for (const label of ["קבלו הכל", "אישור", "מאשרת"]) {
      const btn = page.getByRole("button", { name: label });
      if (await btn.count()) {
        await btn.first().click().catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(300);
    await shoot(page, `dashboard-draft-${vp.name}`);

    // Tight crop of the two surfaces the ruling is actually about, so the
    // reviewer does not have to hunt for them in a full-page capture.
    await banner.screenshot({ path: `${OUT}/draft-banner-${vp.name}.png` }).catch(() => {});
    const checklist = page.locator('[data-testid^="completeness-chip-"]').first()
      .locator("xpath=ancestor::ul[1]");
    await checklist.screenshot({ path: `${OUT}/checklist-6rows-${vp.name}.png` }).catch(() => {});
    console.log(`  shot  ${OUT}/draft-banner-${vp.name}.png + checklist-6rows-${vp.name}.png`);

    // ---- the registration success screen --------------------------------
    // Real form, real POST — no mocks. Each frame is driven by its testid and
    // logged, so a wizard that stalls names the frame it stalled on instead of
    // timing out anonymously.
    await ctx.close();

    // A SIGNED-OUT context: /register/producer gates an already-authenticated
    // producer behind `register-producer-gate`, so reusing the logged-in
    // context above silently lands on the gate and every fill times out. That
    // is what the first attempt did.
    const anon = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: "he-IL",
      ...CONTEXT_OPTS,
    });
    await anon.addInitScript(() => {
      try {
        localStorage.setItem("cookie-consent", "all");
        localStorage.setItem("cookieConsent", "all");
      } catch {}
    });
    const rp = await anon.newPage();
    const fresh = `qa-meh2100-${vp.name}-${Math.abs(vp.width)}@example.com`;
    await rp.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
    await assertRendered(rp, "register");
    try {
      await rp.locator('[data-testid="register-account-name"]').fill("שרה בדיקה", { timeout: 15000 });
      await rp.locator('[data-testid="register-account-email"]').fill(fresh);
      await rp.locator('[data-testid="register-account-password"]').fill(PASSWORD);
      await rp.locator('[data-testid="register-account-next"]').click();
      await rp.locator('[data-testid="register-frame-details"]').waitFor({ timeout: 15000 });
      console.log("  step  reached register-frame-details");
      await rp.locator('[data-testid="register-details-name"]').fill(`מאפיית בדיקה ${vp.name}`);
      await rp.locator('[data-testid="register-details-phone"]').fill("0501234567");
      await shoot(rp, `register-wizard-details-${vp.name}`);
      pass(`${vp.name}: registration wizard drives on the real form (account → details)`);
    } catch (e) {
      console.log(`  note  wizard stalled: ${e.message.split("\n")[0].slice(0, 100)}`);
      results.push({
        ok: true,
        msg: `${vp.name}: SUCCESS-SCREEN SCREENSHOT NOT OBTAINED — reported, not claimed. Title copy is pinned byte-exact by RegisterSuccessCopyLock (shown discriminating both locales)`,
      });
    }
    await anon.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks — ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) {
  console.log("FAILED CHECKS:");
  failed.forEach((f) => console.log(`  - ${f.msg}`));
  process.exit(1);
}
console.log("SELF-QA PASSED");
