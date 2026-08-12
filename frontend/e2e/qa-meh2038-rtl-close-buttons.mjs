/**
 * MEH-2038 — self-QA for RTL close-button placement at 390px.
 *
 * Drives a real Chromium against a local `next start` and, for each of the
 * three modals, does TWO things:
 *
 *   1. Screenshots it at 390px (the artifact the ticket asks for).
 *   2. MEASURES the close button's bounding box against the heading's and
 *      asserts they do not intersect.
 *
 * (2) is the part that actually proves the fix. A screenshot proves a human
 * could have looked; an intersection test fails by itself.
 *
 * DISCRIMINATION (.claude/rules/testing.md, MEH-1619) — a pass here has to be
 * impossible under the old code, or it is a green of unknown wiring. So each
 * check runs TWICE against the same live element: once as shipped (end-*) and
 * once with the pre-MEH-2038 classes written back onto the real DOM node
 * (start-*). The old form MUST overlap and the new one MUST NOT. If both come
 * back clean the probe is not measuring placement at all and the run fails
 * loudly rather than reporting three reassuring zeros.
 *
 * CONTROL (.claude/rules/testing.md — "a probe whose null output is also its
 * reassuring output"): every step asserts the modal is really on screen and
 * that the page is not the `משהו השתבש` error boundary before it measures
 * anything. A capture harness that photographs an error boundary and exits 0
 * is a documented failure in this repo (#2786) — an absent modal is a FAIL
 * here, never a skip.
 *
 * Run: node e2e/qa-meh2038-rtl-close-buttons.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-2038");
// Constant + argv override, not an env var: every process.env read must be
// declared in .env.example or the "Env drift" gate blocks the PR
// (regression rule 8). REUSES: e2e/qa-meh1611-map-focus.mjs:27.
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VIEWPORT = { width: 390, height: 844 };

const PRODUCERS_RE = /\/api\/producers(?:\?[^#]*)?$/;
const CATEGORIES_RE = /\/api\/categories(?:\?[^#]*)?$/;
const DEMO_ID = "11111111-1111-4111-8111-111111111111";
const DETAIL_RE = new RegExp(`/api/producers/${DEMO_ID}$`);

// A deliberately LONG Hebrew title is not needed for LocationModal (its title
// is fixed copy), but the CertModal + LoginPrompt paths render real strings —
// the point of 390px is that the narrowest viewport is where a collision shows.
const producer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה של שרה — לחם מחמצת מקמח מלא",
  slug: "demo-bakery",
  city: "תל אביב",
  category_id: 1,
  category_name: "מאפים",
  description: "עסק הדגמה ל-QA של MEH-2038.",
  image_url: null,
  lat: 32.08,
  lng: 34.78,
  is_verified: true,
  // `badatz` — a key that exists in CODE_TO_KEY (KashrutBadgeStrip.jsx:11-20).
  // An unknown code is silently filtered out and the badge never becomes
  // tappable, so the cert modal simply never opens: a null that looks like a
  // selector problem. Measured: "badatz_eda_haredit" produced exactly that.
  kashrut_badges: ["badatz"],
  kashrut_verified_at: "2026-01-01T00:00:00Z",
  kashrut_expires_at: "2027-01-01T00:00:00Z",
  kashrut_certs: [{ badge_code: "badatz" }],
};

// 1×1 transparent PNG — the cert image is served by our own proxy route, which
// has no backend behind it here. Without a real body the <img> has no box and
// the clearance measurement below would compare against nothing.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const failures = [];
const ran = [];
function check(name, cond, detail) {
  // Derived, never stated: len(ran) cannot go stale the way a hardcoded
  // "N assertions" line does (.claude/rules/testing.md — #2780).
  ran.push(name);
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
/**
 * Measured and reported, but NOT a gate. Reserved for facts that are real
 * findings yet sit outside MEH-2038's declared scope — reporting them is the
 * ticket's instruction ("report anything else, don't fix"), and failing the run
 * on them would be this harness quietly widening its own remit.
 */
function info(name, value) {
  console.log(`INFO  ${name} — ${value}`);
}

/** Rect intersection with a 0px tolerance — touching edges are not an overlap. */
function overlaps(a, b) {
  if (!a || !b) return null;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Rendered rectangles of the TEXT inside an element — one per visual line.
 *
 * This must NOT be `boundingBox()`. An <h2> is a block element: its border box
 * spans the full content width whatever `pe-*` does, because padding is INSIDE
 * the border box. Measuring it reports an overlap for every possible value of
 * the padding — including the correct one. Measured on the first run of this
 * harness: the shipped `pe-10` and the pre-fix code both reported
 * "overlapping lines=[0,1]", which is the signature of a probe that cannot see
 * the thing it is aimed at (.claude/rules/testing.md — "a green that has two
 * possible causes"; here it was a red with two possible causes, same defect
 * wearing the opposite sign).
 *
 * `Range.getClientRects()` over the element's text nodes returns the glyph
 * boxes instead, which is what "text runs under the button" actually means.
 */
async function textRects(locator) {
  return locator.evaluate((el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rect of r.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) {
          out.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        }
      }
    }
    return out;
  });
}

async function assertAlive(page, label) {
  const boom = await page.getByText("משהו השתבש").count();
  check(`${label}: page is not the error boundary`, boom === 0, `error-boundary nodes=${boom}`);
}

/**
 * The discriminating measurement. `btn` and `heads` are locators on the LIVE
 * modal. Returns nothing — it records checks.
 *
 * `oldCls`/`newCls` are the class strings before/after MEH-2038. We write the
 * old one back onto the real element and re-measure, so the control exercises
 * the shipped component rather than a copy of it.
 */
async function swapClass(locator, from, to) {
  await locator.evaluate((el, { f, t }) => {
    const parts = el.className.split(/\s+/).filter(Boolean);
    el.className = (f ? parts.map((c) => (c === f ? t : c)) : [...parts, t]).filter(Boolean).join(" ");
  }, { f: from, t: to });
}

/** Remove `cls` from every node the locator matches (used to undo the new padding). */
async function dropClass(locator, cls) {
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    await locator.nth(i).evaluate((el, c) => {
      el.className = el.className.split(/\s+/).filter((x) => x && x !== c).join(" ");
    }, cls);
  }
}

async function addClass(locator, cls) {
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    await locator.nth(i).evaluate((el, c) => { el.className += " " + c; }, cls);
  }
}

async function measureBoth(page, label, btn, heads, oldCls, newCls, headCls, { requireTap44 = true, requireOldCollision = true } = {}) {
  const btnBox = await btn.boundingBox();
  check(`${label}: close button is rendered`, !!btnBox, btnBox ? `${Math.round(btnBox.width)}×${Math.round(btnBox.height)}` : "no box");
  if (!btnBox) return;

  const size = `${Math.round(btnBox.width)}×${Math.round(btnBox.height)}`;
  if (requireTap44) {
    check(`${label}: tap target >= 44px`, btnBox.width >= 44 && btnBox.height >= 44, size);
  } else {
    info(`${label}: tap target (out of MEH-2038 scope, reported not fixed)`, `${size} — under the 44px the rest of the repo meets`);
  }

  // --- as shipped (end-*, heading padded) ---
  const lines = [];
  for (let i = 0; i < (await heads.count()); i++) lines.push(...(await textRects(heads.nth(i))));
  check(`${label}: heading text lines found`, lines.length > 0, `lines=${lines.length}`);
  if (!lines.length) return;

  const hit = lines.map((r, i) => (overlaps(btnBox, r) ? i : -1)).filter((i) => i >= 0);
  check(`${label}: NEW (${newCls} + ${headCls}) — no text under the close button`, hit.length === 0, `overlapping lines=[${hit}] of ${lines.length}`);

  // --- pre-MEH-2038: revert BOTH halves on the live nodes ---
  // Toggling only the button would leave the new padding in place and let the
  // old position come back clean, reporting "no regression" for a state that
  // never existed. The fix is two changes, so the control has to undo two.
  await swapClass(btn, newCls, oldCls);
  await dropClass(heads, headCls);
  const oldBox = await btn.boundingBox();
  const oldLines = [];
  for (let i = 0; i < (await heads.count()); i++) oldLines.push(...(await textRects(heads.nth(i))));
  const oldHit = oldLines.map((r, i) => (overlaps(oldBox, r) ? i : -1)).filter((i) => i >= 0);
  const oldDetail = `overlapping lines=[${oldHit}] of ${oldLines.length}`;
  if (requireOldCollision) {
    check(`${label}: OLD (${oldCls}, no ${headCls}) — DOES collide (proves the probe discriminates)`, oldHit.length > 0, oldDetail);
  } else {
    // Not a weakened guard — a false premise, replaced by a stronger one.
    // This modal's shipped title is short AND centred, so the old position
    // genuinely did not collide with it, exactly as the ticket says. Demanding
    // a collision here would assert something untrue about the old code. The
    // discrimination for this modal is carried instead by the LONG-title pair
    // below, which fails on the old code and passes on the new.
    info(`${label}: OLD with the SHIPPED short title`, `${oldDetail} — no live collision; see the LONG-title pair for the discriminating control`);
  }

  // restore
  await swapClass(btn, oldCls, newCls);
  await addClass(heads, headCls);
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "he-IL" });

  // Kill every external fetch. The sandbox's outbound proxy 403s Unsplash, and
  // the Next image optimizer retries each one — which saturates `next start`
  // and turned a working run into a 30s navigation timeout on the second pass.
  // Same family as the `networkidle` ban in .claude/rules/testing.md: never let
  // an unrelated network condition decide the outcome of a layout assertion.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await ctx.route(/\/_next\/image/, (r) => r.abort());

  await ctx.route(/\/kashrut-cert\//, (r) => r.fulfill({ contentType: "image/png", body: PNG_1PX }));
  await ctx.route(DETAIL_RE, (r) => r.fulfill({ json: producer }));
  await ctx.route(PRODUCERS_RE, (r) => r.fulfill({ json: { items: [producer], total: 1 } }));
  await ctx.route(CATEGORIES_RE, (r) => r.fulfill({ json: [{ id: 1, name: "מאפים", slug: "bakery" }] }));

  const page = await ctx.newPage();

  // ---------- 1. LocationModal (home → location banner) ----------
  await page.goto(`${BASE}/he`, { waitUntil: "domcontentloaded" });
  await assertAlive(page, "LocationModal");
  // The banner self-reveals after 3s when no city is saved (LocationBanner.jsx:16).
  const openBtn = page.getByRole("button", { name: "בחרו עיר" });
  await openBtn.waitFor({ state: "visible", timeout: 15_000 });
  await openBtn.click();
  const locDlg = page.locator('[role="dialog"]').first();
  await locDlg.waitFor({ state: "visible", timeout: 10_000 });
  check("LocationModal: dialog opened", await locDlg.isVisible());
  await page.screenshot({ path: path.join(OUT, "location-modal-390.png") });
  await measureBoth(
    page,
    "LocationModal",
    locDlg.locator("button[aria-label]").first(),
    locDlg.locator("h2, h2 + p"),
    "start-4",
    "end-4",
    "pe-10",
  );
  await page.keyboard.press("Escape");

  // ---------- 2 + 3. Producer detail (LoginPromptModal + CertModal) ----------
  // LoginPromptModal is mounted by FavoriteButton (ProducerHeader.jsx:316), NOT
  // by the home grid — the grid uses CardHeart (ProducerCard.jsx:65), a
  // different component with no login prompt. Measured: clicking the grid heart
  // opens nothing.
  await page.goto(`${BASE}/he/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
  await assertAlive(page, "ProducerDetail");

  const heart = page.locator("button[aria-pressed]").first();
  await heart.waitFor({ state: "visible", timeout: 20_000 });
  await heart.click();
  const loginTitle = page.locator("#login-prompt-title");
  await loginTitle.waitFor({ state: "visible", timeout: 10_000 });
  const loginDlg = page.locator('[aria-labelledby="login-prompt-title"]');
  check("LoginPromptModal: dialog opened", await loginDlg.isVisible());
  await page.screenshot({ path: path.join(OUT, "login-prompt-modal-390.png") });
  await measureBoth(
    page,
    "LoginPromptModal",
    loginDlg.locator("button[aria-label]").first(),
    loginDlg.locator("#login-prompt-title"),
    "start-3",
    "end-3",
    "px-8",
    // requireTap44 is now ON. It was off in the first revision of this PR,
    // because the ticket names the 44px target only for CertModal. The CI
    // reviewer pointed out the obvious consequence: the rtl.md rule this PR
    // ADDS makes 44px normative, so shipping the rule and a 28px close button
    // in the same commit puts the first counterexample inside the diff that
    // introduces it. Fixed rather than deferred.
    { requireOldCollision: false },
  );

  // LATENT case. With the shipped (short, centred) title neither the old nor
  // the new position collides — the ticket says as much: this modal "ניצל רק
  // כי התוכן text-center", a ticking bomb rather than a live bug. A control
  // that cannot fail on the old code proves nothing, so rather than report a
  // meaningless pass, INJECT the condition the ticket predicts and measure it.
  // (.claude/rules/workflow.md — "when a race will not reproduce, inject the
  // end state instead of waiting for it".)
  const LONG = "כותרת ארוכה במיוחד שנועדה למלא את כל רוחב השורה בנייד ולבדוק דריסה";
  const h2 = loginDlg.locator("#login-prompt-title");
  await h2.evaluate((el, txt) => { el.textContent = txt; }, LONG);

  const lbtn = loginDlg.locator("button[aria-label]").first();
  let lbox = await lbtn.boundingBox();
  let lrects = await textRects(h2);
  let lhit = lrects.filter((r) => overlaps(lbox, r)).length;
  check(`LoginPromptModal: LONG title + NEW (end-3 + px-8) — still no overlap`, lhit === 0, `overlapping lines=${lhit} of ${lrects.length}`);

  await swapClass(lbtn, "end-3", "start-3");
  await dropClass(h2, "px-8");
  lbox = await lbtn.boundingBox();
  lrects = await textRects(h2);
  lhit = lrects.filter((r) => overlaps(lbox, r)).length;
  check(
    `LoginPromptModal: LONG title + OLD (start-3, no px-8) — DOES collide (the latent bug, made real)`,
    lhit > 0,
    `overlapping lines=${lhit} of ${lrects.length}`,
  );

  await page.keyboard.press("Escape");
  await loginTitle.waitFor({ state: "detached", timeout: 5_000 });
  check("LoginPromptModal: Esc still closes", (await loginTitle.count()) === 0);
  const certTrigger = page.locator('[data-testid="kashrut-quiet-line"] button').first();
  await certTrigger.waitFor({ state: "visible", timeout: 15_000 });
  await certTrigger.click();
  const certDlg = page.locator('[data-testid="kashrut-cert-modal"]');
  await certDlg.waitFor({ state: "visible", timeout: 10_000 });
  check("CertModal: dialog opened", await certDlg.isVisible());
  await page.screenshot({ path: path.join(OUT, "cert-modal-390.png") });

  // The CertModal's collision partner is the IMAGE, not a heading: the panel
  // has no visible title, and the image is w-full so it runs under the button
  // unless the top margin clears it. That is why mt had to grow 6 -> 10.
  const certBtn = page.locator('[data-testid="kashrut-cert-close"]');
  const certImg = page.locator('[data-testid="kashrut-cert-image"]');
  const cb = await certBtn.boundingBox();
  const ci = await certImg.boundingBox();
  check("CertModal: close button rendered", !!cb, cb ? `${Math.round(cb.width)}×${Math.round(cb.height)}` : "no box");
  check("CertModal: tap target >= 44px", cb && cb.width >= 44 && cb.height >= 44, cb ? `${Math.round(cb.width)}×${Math.round(cb.height)}` : "n/a");
  check("CertModal: image clears the close button", overlaps(cb, ci) === false, `btn.bottom=${cb && Math.round(cb.y + cb.height)} img.top=${ci && Math.round(ci.y)}`);

  // Discriminator for the margin: mt-6 is the pre-fix value and MUST collide.
  await certImg.evaluate((el) => {
    el.className = el.className.replace("mt-11", "mt-6");
  });
  const ciOld = await certImg.boundingBox();
  check("CertModal: OLD mt-6 DOES collide (proves the probe discriminates)", overlaps(cb, ciOld) === true, `btn.bottom=${cb && Math.round(cb.y + cb.height)} img.top=${ciOld && Math.round(ciOld.y)}`);
  await certImg.evaluate((el) => { el.className = el.className.replace("mt-6", "mt-11"); });

  // ---------- 4. Esc + backdrop still close (no behaviour regression) ----------
  await page.keyboard.press("Escape");
  check("CertModal: Esc still closes", (await certDlg.count()) === 0);

  await browser.close();

  console.log(`\n${ran.length} assertions ran, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
  console.log(`artifacts -> ${OUT}`);
};

run().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
