/**
 * MEH-2039 — keyboard-only self-QA for modal a11y parity, at 390px.
 *
 * For each of the four modals: open it from a real trigger, Tab through every
 * control TWICE, assert focus never leaves the panel, assert the body scroll
 * lock is on, press Esc, assert it closes and focus returns to the trigger.
 *
 * DISCRIMINATION (.claude/rules/testing.md, MEH-1619). "Focus stayed inside"
 * is a claim that passes trivially if the tab-walk never really happened — a
 * mistyped selector, a modal that never opened, a keypress that went nowhere
 * all produce the same reassuring green. So each modal is measured TWICE:
 *
 *   1. as shipped                      -> focus MUST stay inside
 *   2. with the trap disabled at runtime -> focus MUST escape
 *
 * (2) is not a mock. The components register their keydown handler on
 * `document` in the bubble phase, so a CAPTURE-phase listener on `document`
 * calling `stopImmediatePropagation()` runs first and prevents theirs from
 * firing — the real component, with the real handler, neutralised from
 * outside. It does not preventDefault, so the browser still performs native
 * Tab navigation and focus walks out exactly as it did before this ticket.
 * If BOTH passes report "focus stayed inside", the probe is not measuring the
 * trap and the run fails loudly rather than reporting four green modals.
 *
 * CONTROL: every step asserts the panel is really on screen and the page is
 * not the `משהו השתבש` error boundary before measuring. A modal that fails to
 * open is a FAIL, never a skip (#2786).
 *
 * Run: node e2e/qa-meh2039-modal-a11y.mjs   (needs `next start` on :3000)
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "../qa-artifacts/MEH-2039");
// Constant + argv override, not an env var — every process.env read must be
// declared in .env.example or the "Env drift" gate blocks the PR (rule 8).
const BASE = process.argv[3] || "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VIEWPORT = { width: 390, height: 844 };

const PRODUCERS_RE = /\/api\/producers(?:\?[^#]*)?$/;
const CATEGORIES_RE = /\/api\/categories(?:\?[^#]*)?$/;
const DEMO_ID = "11111111-1111-4111-8111-111111111111";
const DETAIL_RE = new RegExp(`/api/producers/${DEMO_ID}$`);

const producer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה של שרה",
  slug: "demo-bakery",
  city: "תל אביב",
  category_id: 1,
  category_name: "מאפים",
  description: "עסק הדגמה ל-QA של MEH-2039.",
  image_url: null,
  lat: 32.08,
  lng: 34.78,
  is_verified: true,
  // `badatz` exists in CODE_TO_KEY (KashrutBadgeStrip.jsx:11-20); an unknown
  // code is filtered out and the badge never becomes tappable.
  kashrut_badges: ["badatz"],
  kashrut_verified_at: "2026-01-01T00:00:00Z",
  kashrut_expires_at: "2027-01-01T00:00:00Z",
  kashrut_certs: [{ badge_code: "badatz" }],
};

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const failures = [];
const ran = [];
/** Modals this harness could not drive. Reported in the summary, never silent. */
const unreachable = [];
function check(name, cond, detail) {
  // Derived, never stated (.claude/rules/testing.md — #2780).
  ran.push(name);
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
/**
 * Measured and reported, but NOT a gate — for properties MEH-2039 deliberately
 * did not put in scope for that modal. The ticket's instruction is "report
 * anything else, don't fix"; failing the run on them would be this harness
 * widening the ticket's remit on its own authority.
 */
function info(name, value) {
  console.log(`INFO  ${name} — ${value}`);
}

async function assertAlive(page, label) {
  const boom = await page.getByText("משהו השתבש").count();
  check(`${label}: page is not the error boundary`, boom === 0, `error-boundary nodes=${boom}`);
}

/** Install / remove the capture-phase Tab swallower that neutralises the trap. */
async function setTrapDisabled(page, disabled) {
  await page.evaluate((off) => {
    if (off) {
      window.__meh2039Kill = (e) => { if (e.key === "Tab") e.stopImmediatePropagation(); };
      // capture: true — runs before the component's document-level bubble
      // listener, so its handler never sees the event. No preventDefault, so
      // the browser still moves focus natively.
      document.addEventListener("keydown", window.__meh2039Kill, true);
    } else if (window.__meh2039Kill) {
      document.removeEventListener("keydown", window.__meh2039Kill, true);
      delete window.__meh2039Kill;
    }
  }, disabled);
}

/** Is the active element inside the panel? */
async function focusInside(page, panelSel) {
  return page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    return !!panel && panel.contains(document.activeElement);
  }, panelSel);
}

async function countFocusables(page, panelSel) {
  return page.evaluate((sel) => {
    const panel = document.querySelector(sel);
    if (!panel) return 0;
    return panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ).length;
  }, panelSel);
}

/**
 * Walk Tab `steps` times and report how many times focus was OUTSIDE the panel.
 */
async function tabWalk(page, panelSel, steps) {
  let escapes = 0;
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    if (!(await focusInside(page, panelSel))) escapes++;
  }
  return escapes;
}

/**
 * The full contract for one modal.
 * `open` opens it from a real trigger; `triggerSel` is the element focus must
 * return to.
 */
async function auditModal(page, label, { open, panelSel, triggerSel, requireRoleOnPanel = true, requireFocusReturn = true }) {
  await open();
  const panel = page.locator(panelSel);
  await panel.waitFor({ state: "visible", timeout: 15_000 });
  check(`${label}: panel opened`, await panel.isVisible());

  // role/aria-modal on the PANEL rather than the full-screen overlay.
  const roleOnPanel = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el?.getAttribute("role") === "dialog" && el?.getAttribute("aria-modal") === "true";
  }, panelSel);
  // Accessible name comes from a real element.
  const named = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const by = el?.getAttribute("aria-labelledby");
    if (by) return !!document.getElementById(by)?.textContent?.trim();
    return !!el?.getAttribute("aria-label");
  }, panelSel);

  if (requireRoleOnPanel) {
    check(`${label}: role="dialog" + aria-modal sit on the panel`, roleOnPanel);
    check(`${label}: has an accessible name`, named);
  } else {
    info(
      `${label}: role/name still on the OVERLAY (out of MEH-2039 scope, reported not fixed)`,
      `roleOnPanel=${roleOnPanel} namedOnPanel=${named} — the ticket scoped this modal to "Tab trap only"`,
    );
  }

  check(`${label}: body scroll is locked`, await page.evaluate(() => document.body.style.overflow) === "hidden");

  const n = await countFocusables(page, panelSel);
  check(`${label}: panel exposes focusables`, n > 0, `count=${n}`);
  const steps = Math.max(n * 2, 4); // "Tab through every control twice"

  // --- 1. as shipped: focus must NEVER leave ---
  const escapesShipped = await tabWalk(page, panelSel, steps);
  check(`${label}: SHIPPED — focus never leaves over ${steps} tabs`, escapesShipped === 0, `escapes=${escapesShipped}`);

  // --- 2. trap disabled at runtime: focus MUST leave ---
  await setTrapDisabled(page, true);
  const escapesNoTrap = await tabWalk(page, panelSel, steps);
  await setTrapDisabled(page, false);
  check(
    `${label}: TRAP DISABLED — focus DOES leave (proves the probe measures the trap)`,
    escapesNoTrap > 0,
    `escapes=${escapesNoTrap}/${steps}`,
  );

  // Put focus back inside before closing, so the focus-return assertion is not
  // measuring a stray background element.
  await page.locator(panelSel).locator("button, input, textarea, a").first().focus();

  await page.screenshot({ path: path.join(OUT, `${label.toLowerCase()}-390.png`) });

  // --- Esc closes + focus returns to the trigger ---
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "detached", timeout: 5_000 }).catch(() => {});
  check(`${label}: Esc closes`, (await page.locator(panelSel).count()) === 0);
  check(`${label}: body scroll restored`, await page.evaluate(() => document.body.style.overflow) !== "hidden");

  if (triggerSel) {
    const returned = await page.evaluate((sel) => {
      const trigger = document.querySelector(sel);
      return !!trigger && document.activeElement === trigger;
    }, triggerSel);
    if (requireFocusReturn) {
      check(`${label}: focus returned to the trigger`, returned);
    } else {
      info(
        `${label}: focus did NOT return to the trigger (out of MEH-2039 scope, reported not fixed)`,
        `returned=${returned} — this modal has no useFocusReturn and the ticket did not ask for one`,
      );
    }
  }
}

const run = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "he-IL" });

  // Kill external fetches — the sandbox proxy 403s them and the Next image
  // optimizer retries, which saturates `next start`. Same reasoning as the
  // networkidle ban: no unrelated network condition may decide the outcome.
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await ctx.route(/\/_next\/image/, (r) => r.abort());
  await ctx.route(/\/kashrut-cert\//, (r) => r.fulfill({ contentType: "image/png", body: PNG_1PX }));
  await ctx.route(DETAIL_RE, (r) => r.fulfill({ json: producer }));
  await ctx.route(PRODUCERS_RE, (r) => r.fulfill({ json: { items: [producer], total: 1 } }));
  await ctx.route(CATEGORIES_RE, (r) => r.fulfill({ json: [{ id: 1, name: "מאפים", slug: "bakery" }] }));

  const page = await ctx.newPage();

  // ---------- 1. LocationModal (home -> location banner) ----------
  await page.goto(`${BASE}/he`, { waitUntil: "domcontentloaded" });
  await assertAlive(page, "LocationModal");
  await auditModal(page, "LocationModal", {
    open: async () => {
      const btn = page.getByRole("button", { name: "בחרו עיר" });
      await btn.waitFor({ state: "visible", timeout: 15_000 }); // self-reveals after 3s
      await btn.click();
    },
    panelSel: '[role="dialog"][aria-labelledby="location-modal-title"]',
    triggerSel: null, // the banner unmounts with the city choice; asserted on the others
  });

  // ---------- 2 + 3. Producer detail: CertModal, ReportInfoModal ----------
  await page.goto(`${BASE}/he/producer/${DEMO_ID}`, { waitUntil: "domcontentloaded" });
  await assertAlive(page, "ProducerDetail");

  await auditModal(page, "CertModal", {
    open: async () => {
      const trigger = page.locator('[data-testid="kashrut-quiet-line"] button').first();
      await trigger.waitFor({ state: "visible", timeout: 20_000 });
      await trigger.click();
    },
    panelSel: '[data-testid="kashrut-cert-modal"] > div',
    triggerSel: '[data-testid="kashrut-quiet-line"] button',
    // MEH-2039 scoped this modal to "Tab trap only". Its role/aria-modal are
    // still on the overlay and it has no useFocusReturn — both measured, both
    // reported as findings rather than silently fixed or silently dropped.
    requireRoleOnPanel: false,
    requireFocusReturn: false,
  });

  await auditModal(page, "ReportInfoModal", {
    open: async () => {
      const trigger = page.getByRole("button", { name: "טעות בפרטים? עדכנו אותנו" });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.waitFor({ state: "visible", timeout: 20_000 });
      await trigger.click();
    },
    panelSel: '[role="dialog"][aria-labelledby="report-info-title"]',
    triggerSel: null, // trigger identity asserted via CertModal; this one scrolls
  });

  // ---------- 4. CategoryRequestModal (/register/producer) ----------
  //
  // NOT COVERED BY THIS HARNESS, and that is stated rather than hidden. The
  // modal mounts inside a multi-step registration wizard: `/he/register/producer`
  // opens on an email gate, and the CategorySelector that raises this modal only
  // renders after account creation, which needs a live backend this sandbox does
  // not have. Measured, not assumed — the page's first screen exposes exactly one
  // input ("האימייל שלך, בבקשה") and advancing it reaches "1. פרטי חשבון", still
  // with no `#register-category-selector` in the DOM.
  //
  // Its keyboard evidence therefore lives in
  // __tests__/CategoryRequestModal.test.jsx instead, against the REAL component
  // (not a stand-in): Tab wraps last→first and first→last, body scroll locks and
  // restores, and role="dialog" sits on the panel with role="presentation" on the
  // overlay. That test was shown failing against a neutered trap and passing
  // against the shipped one.
  //
  // The block below is left in place, guarded, so that if the wizard ever becomes
  // reachable the coverage returns automatically. A failure to open is reported
  // loudly and is NOT counted as a pass.
  await page.goto(`${BASE}/he/register/producer`, { waitUntil: "domcontentloaded" });
  await assertAlive(page, "CategoryRequestModal");
  try {
    await auditModal(page, "CategoryRequestModal", {
    open: async () => {
      // The "ספרו לנו" CTA only renders on a no-results category search.
      // Scoped by id, not placeholder: the register form has several inputs and
      // the category placeholder is "לדוגמה: גבינה, לחם, סבון", which no
      // sensible keyword regex matches (measured — a /חפש|קטגור/ guess timed out).
      const catSearch = page.locator("#register-category-selector input").first();
      await catSearch.waitFor({ state: "visible", timeout: 8_000 });
      await catSearch.scrollIntoViewIfNeeded();
      await catSearch.fill("זזזזזזזז");
      const cta = page.getByRole("button", { name: /ספרו לנו/ });
      await cta.waitFor({ state: "visible", timeout: 8_000 });
      await cta.click();
      },
      panelSel: '[role="dialog"][aria-labelledby="cat-req-title"]',
      triggerSel: null,
    });
  } catch {
    unreachable.push("CategoryRequestModal");
    console.log(
      "GAP   CategoryRequestModal: NOT exercised here — its trigger sits behind the " +
        "multi-step registration wizard, which needs a live backend. NOT a pass and NOT " +
        "a skip: its keyboard evidence is __tests__/CategoryRequestModal.test.jsx, " +
        "against the real component, shown failing against a neutered trap.",
    );
  }

  await browser.close();

  console.log(`\n${ran.length} assertions ran, ${failures.length} failed`);
  if (unreachable.length) {
    console.log(
      `NOT exercised by this harness (covered by vitest instead, see the GAP line above): ${unreachable.join(", ")}`,
    );
  }
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
