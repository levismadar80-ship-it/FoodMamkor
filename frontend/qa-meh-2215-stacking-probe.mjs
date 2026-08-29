/**
 * MEH-2215 — which `fixed inset-0` modals are TRAPPED in an ancestor stacking
 * context, and which are not?
 *
 * Run:  node qa-meh-2215-stacking-probe.mjs            (needs `next start` on :3000)
 *       node qa-meh-2215-stacking-probe.mjs --self-test-only
 *
 * ── Why three instruments and not one ────────────────────────────────────────
 *
 * (A) ANCESTOR CHAIN — the mechanism. Walk from the overlay up to <html> and
 *     name every ancestor that creates a stacking context or a fixed containing
 *     block, with the computed property that does it. A CLEAN chain is proof of
 *     "not trapped": with no intervening context the overlay's z is evaluated at
 *     the root and cannot be capped. A DIRTY chain is necessary but not
 *     sufficient for the bug — it only becomes visible when something else at
 *     the root outranks the capped context.
 *
 * (B) PIXEL LUMA — the ground truth for paint order, sampled off the captured
 *     PNG exactly as `e2e/qa-meh2093-modal-z.mjs` does. The overlay is a dark
 *     scrim, so anything painting UNDER it darkens measurably and anything
 *     painting OVER it does not change. This is the instrument that decides
 *     trapped / not trapped, because it reads what the guest actually sees.
 *
 * (C) elementFromPoint — prescribed by the ticket, kept, and reported with the
 *     caveat that it is NOT discriminating over the Header. `Header.jsx:321`
 *     carries `pointer-events-none` (MEH-1251), so the header band can never be
 *     returned by a hit test whether or not it paints on top — a green there has
 *     two causes (.claude/rules/testing.md). Over the /producer tab bar
 *     (`ProducerDetail.jsx:161`, `sticky z-30`, no pointer-events override) it
 *     IS discriminating, and there it agrees with (B).
 *
 * ── Controls, run FIRST; a failure voids every reading after it ──────────────
 *
 *  1. SELF-TEST of the chain walker (A) against four cases whose answers are
 *     known before the run: a clean chain, a `transform` ancestor, a
 *     `position+z-index` ancestor, and — anchored to a real repo shape, per
 *     .claude/rules/testing.md (MEH-1909) — the literal class string from
 *     `ImageGallery.jsx:375` (`absolute top-3 start-3 z-20 lg:hidden`). A probe
 *     that is green only against shapes I invented has not been shown to
 *     recognise the shape this repo actually uses.
 *  2. LUMA CONTROL per capture: a point that is unambiguously under the overlay
 *     MUST darken when the modal opens. If it does not, the overlay never
 *     rendered or the sampler is broken, and every "not trapped" below is void.
 */
import { chromium } from "@playwright/test";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "../qa-artifacts/MEH-2215");
const BASE = "http://127.0.0.1:3000";
const CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const VIEWPORT = { width: 390, height: 844 };
/** Luma delta (0-255) above which a patch counts as "darkened by the scrim". */
const DARK_D = 8;

const DEMO_ID = "11111111-1111-4111-8111-111111111111";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Two gallery photos so ImageGallery takes its IMAGED branch — the one whose
// overlay wrapper is `z-20` (ImageGallery.jsx:375). The imageless branch uses
// `z-10` (:216) and is probed separately below: both are `absolute` + a z
// token, so both create a context, and the issue's table names only the first.
const IMAGES = ["https://res.cloudinary.com/demo/image/upload/a.jpg",
                "https://res.cloudinary.com/demo/image/upload/b.jpg"];

const baseProducer = {
  id: DEMO_ID,
  name: "מאפיית הדגמה של שרה",
  slug: "demo-bakery",
  city: "תל אביב",
  category_id: 1,
  category_name: "מאפים",
  description: "עסק הדגמה ל-QA של MEH-2215. ".repeat(12),
  image_url: null,
  lat: 32.08,
  lng: 34.78,
  is_verified: true,
  verification_tier: "verified",
  verified_at: "2026-01-01T00:00:00Z",
  phone: "0500000000",
  whatsapp: "0500000000",
  kashrut_badges: ["badatz"],
  kashrut_verified_at: "2026-01-01T00:00:00Z",
  kashrut_expires_at: "2027-01-01T00:00:00Z",
  kashrut_certs: [{ badge_code: "badatz" }],
  products: [],
  delivery_areas: [],
  locations: [],
  custom_questions: [],
};
const withImages = { ...baseProducer, images: IMAGES };
const noImages = { ...baseProducer, images: [] };

/* ────────────────────────── instrument A: the chain walker ───────────────── */

/**
 * Injected into the page. Walks `el`'s ancestors and returns every one that
 * creates a stacking context or a fixed containing block, with the property
 * responsible. Kept as a string so the self-test and the real run execute the
 * SAME source — a second copy is free to drift from the one that matters
 * (.claude/rules/testing.md).
 */
const CHAIN_WALKER = `
(function walk(el) {
  const out = [];
  let n = el && el.parentElement;
  while (n && n !== document.documentElement) {
    const s = getComputedStyle(n);
    const why = [];
    // Stacking-context creators (CSS Positioned Layout 3 / Filter Effects 1).
    if (s.position !== "static" && s.zIndex !== "auto") why.push("position:" + s.position + " + z-index:" + s.zIndex);
    // CSSWG 2023: sticky creates one exactly as fixed does, z-index or not.
    if (s.position === "fixed" || s.position === "sticky") why.push("position:" + s.position);
    if (s.opacity !== "1") why.push("opacity:" + s.opacity);
    if (s.transform !== "none") why.push("transform:" + s.transform);
    if (s.filter !== "none") why.push("filter:" + s.filter);
    if (s.backdropFilter && s.backdropFilter !== "none") why.push("backdrop-filter:" + s.backdropFilter);
    if (s.isolation === "isolate") why.push("isolation:isolate");
    if (s.willChange && /transform|opacity|filter/.test(s.willChange)) why.push("will-change:" + s.willChange);
    if (s.contain && /layout|paint|strict|content/.test(s.contain)) why.push("contain:" + s.contain);
    if (s.mixBlendMode && s.mixBlendMode !== "normal") why.push("mix-blend-mode:" + s.mixBlendMode);
    if (s.perspective && s.perspective !== "none") why.push("perspective:" + s.perspective);
    if (why.length) {
      out.push({
        tag: n.tagName.toLowerCase(),
        cls: (n.getAttribute("class") || "").slice(0, 90),
        testid: n.getAttribute("data-testid") || null,
        why,
      });
    }
    n = n.parentElement;
  }
  return out;
})`;

/* ────────────────────────── instrument B: the luma sampler ────────────────── */

async function patchLuma(png, cx, cy, r = 6) {
  const img = sharp(png);
  const { width, height } = await img.metadata();
  const left = Math.max(0, Math.min(width - 2 * r, Math.round(cx) - r));
  const top = Math.max(0, Math.min(height - 2 * r, Math.round(cy) - r));
  const { data, info } = await img
    .extract({ left, top, width: 2 * r, height: 2 * r })
    .raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return sum / n;
}

/* ────────────────────────────── reporting ─────────────────────────────────── */

const rows = [];
const failures = [];
const ran = [];
function check(name, cond, detail) {
  ran.push(name); // derived, never stated (.claude/rules/testing.md, #2780)
  if (!cond) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/* ───────────────────────────── control 1: self-test ───────────────────────── */

async function selfTest(browser) {
  console.log("\n================ CONTROL 1 — chain-walker self-test ================");
  console.log("Four cases with answers known before the run. Three synthetic (edges),");
  console.log("one lifted verbatim from ImageGallery.jsx:375 (the shape this repo uses).\n");
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div id="clean"><div id="t-clean" style="position:fixed;inset:0"></div></div>
    <div id="tf" style="transform:translateY(0px)"><div id="t-tf" style="position:fixed;inset:0"></div></div>
    <div id="zi" style="position:absolute;z-index:20"><div id="t-zi" style="position:fixed;inset:0"></div></div>
    <!-- verbatim from ImageGallery.jsx:375 -->
    <div id="real" style="position:absolute;top:12px;inset-inline-start:12px;z-index:20;display:flex;align-items:center;gap:8px">
      <div id="t-real" style="position:fixed;inset:0"></div></div>
  </body></html>`);

  const res = await page.evaluate((src) => {
    const walk = eval(src);
    const g = (id) => walk(document.getElementById(id));
    return { clean: g("t-clean"), tf: g("t-tf"), zi: g("t-zi"), real: g("t-real") };
  }, CHAIN_WALKER);

  check("self-test: a clean chain reports ZERO culprits",
    res.clean.length === 0, `culprits=${res.clean.length}`);
  check("self-test: a `transform` ancestor is named",
    res.tf.length === 1 && res.tf[0].why.some((w) => w.startsWith("transform:")),
    JSON.stringify(res.tf));
  check("self-test: a `position+z-index` ancestor is named",
    res.zi.length === 1 && res.zi[0].why.some((w) => w.includes("z-index:20")),
    JSON.stringify(res.zi));
  check("self-test: the REAL ImageGallery.jsx:375 wrapper shape is named",
    res.real.length === 1 && res.real[0].why.some((w) => w.includes("position:absolute") && w.includes("z-index:20")),
    JSON.stringify(res.real));

  await ctx.close();
  const ok = failures.length === 0;
  console.log(ok
    ? "\nCONTROL 1 PASS — the walker separates trapped from clean, on a real repo shape.\n"
    : "\nCONTROL 1 FAIL — the walker cannot tell the cases apart. EVERY row below is VOID.\n");
  return ok;
}

/* ──────────────────────────────── the run ─────────────────────────────────── */

/**
 * The node whose ancestors decide the modal's fate is the outermost part of its
 * own render tree that is `position: fixed` — for LoginPromptModal that is the
 * `fixed inset-0` overlay; for AccountSheet, whose scrim and panel are fixed
 * SIBLINGS, it is the panel itself. Found by climbing from `[role=dialog]` to
 * the nearest ancestor-or-self with computed `position: fixed`, so one rule
 * covers every shape instead of a per-modal selector that can silently miss.
 */
const FIXED_ROOT = `
(function fixedRoot(dlg) {
  let n = dlg;
  while (n && n !== document.documentElement) {
    if (getComputedStyle(n).position === "fixed") return n;
    n = n.parentElement;
  }
  return null;
})`;

async function measure(page, target) {
  const row = { modal: target.key, page: target.pageLabel, file: target.file };

  // Put the page in its final scroll position BEFORE the "closed" capture.
  // Otherwise a trigger that needs scrollIntoView moves the chrome between the
  // two frames and the luma delta measures the SCROLL, not the scrim. (That is
  // exactly what produced a nonsensical -11.1 on ReportInfoModal in run 1.)
  if (target.prepare) await target.prepare(page);
  await page.waitForTimeout(400);

  const chrome = await page.evaluate(() => {
    const pill = document.querySelector("header nav") || document.querySelector("header");
    const tabs = [...document.querySelectorAll("nav")].find(
      (n) => getComputedStyle(n).position === "sticky" && getComputedStyle(n).zIndex === "30",
    );
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), h: Math.round(b.height) }; };
    return { header: r(pill), tabs: r(tabs) };
  });
  row.chrome = chrome;

  const closed = path.join(OUT, `${target.key}-closed.png`);
  await page.screenshot({ path: closed });

  await target.open(page);
  await page.waitForTimeout(700);

  const found = await page.evaluate(([fr]) => {
    const fixedRoot = eval(fr);
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    for (const d of dialogs) {
      const root = fixedRoot(d);
      if (root) { root.setAttribute("data-meh2215-root", "1"); return { ok: true, dialogs: dialogs.length }; }
    }
    return { ok: false, dialogs: dialogs.length };
  }, [FIXED_ROOT]);
  if (!found.ok) { row.error = `no [role=dialog] with a position:fixed ancestor-or-self after the trigger (dialogs=${found.dialogs})`; return row; }

  const open = path.join(OUT, `${target.key}-open.png`);
  await page.screenshot({ path: open });

  const measured = await page.evaluate(([src, pts]) => {
    const walk = eval(src);
    const root = document.querySelector("[data-meh2215-root]");
    // The modal's own painted surface = the fixed root, plus any `fixed`
    // siblings of it — AccountSheet and Popover render scrim and panel side by
    // side, so the scrim is not INSIDE the panel.
    //
    // Siblings count ONLY when the root's parent is not <body>. Once a modal is
    // portalled, its "siblings" are unrelated page furniture that also happens
    // to be fixed (the cookie banner, the chat FAB), and counting those would
    // let a hit on the cookie banner report as "inside the modal" — a green
    // with a second cause, in the instrument built to catch exactly that.
    const inPlace = root.parentElement !== document.body;
    const nodes = inPlace
      ? [root, ...[...(root.parentElement?.children || [])]
          .filter((c) => c !== root && getComputedStyle(c).position === "fixed")]
      : [root];
    const inside = (el) => !!el && nodes.some((n) => n === el || n.contains(el));
    const hit = {};
    for (const [name, p] of Object.entries(pts)) {
      if (!p) { hit[name] = null; continue; }
      const el = document.elementFromPoint(p.x, p.y);
      hit[name] = {
        inside: inside(el),
        tag: el ? el.tagName.toLowerCase() : null,
        cls: el ? (el.getAttribute("class") || "").slice(0, 55) : null,
      };
    }
    return {
      chain: walk(root),
      hit,
      rootCls: (root.getAttribute("class") || "").slice(0, 70),
      siblingScrims: nodes.length - 1,
    };
  }, [CHAIN_WALKER, { header: chrome.header, tabs: chrome.tabs }]);
  Object.assign(row, measured);

  const control = { x: Math.round(VIEWPORT.width / 2), y: Math.round(VIEWPORT.height * 0.22) };
  row.luma = {};
  for (const [name, p] of Object.entries({ control, header: chrome.header, tabs: chrome.tabs })) {
    if (!p) { row.luma[name] = null; continue; }
    row.luma[name] = { closed: await patchLuma(closed, p.x, p.y), open: await patchLuma(open, p.x, p.y) };
  }
  row.shots = { closed, open };
  return row;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });

  const controlOk = await selfTest(browser);
  if (!controlOk || process.argv.includes("--self-test-only")) {
    await browser.close();
    process.exit(controlOk ? 0 : 1);
  }

  const makeCtx = async (producer) => {
    const ctx = await browser.newContext({
      viewport: VIEWPORT, locale: "he-IL", timezoneId: "Asia/Jerusalem", reducedMotion: "reduce",
    });
    // No unrelated network condition may decide the outcome (networkidle ban).
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
    await ctx.route(/\/_next\/image/, (r) => r.fulfill({ contentType: "image/png", body: PNG_1PX }));
    await ctx.route(/\/kashrut-cert\//, (r) => r.fulfill({ contentType: "image/png", body: PNG_1PX }));
    // ORDER MATTERS, and it is the reverse of the obvious one: Playwright runs
    // route handlers LAST-REGISTERED FIRST. The catch-all therefore has to be
    // registered BEFORE the specific routes, or it shadows them and every
    // fixture silently becomes `[]` — which is how the first run of this probe
    // rendered the imageless gallery while being handed two photos.
    await ctx.route(/\/api\//, async (r) => {
      if (r.request().url().includes("/auth/me")) return r.fulfill({ status: 401, json: { detail: "guest" } });
      return r.fulfill({ json: [] });
    });
    await ctx.route(/\/api\/producers(?:\?[^#]*)?$/, (r) => r.fulfill({ json: { items: [producer], total: 1 } }));
    await ctx.route(/\/api\/categories(?:\?[^#]*)?$/, (r) => r.fulfill({ json: [{ id: 1, name: "מאפים", slug: "bakery" }] }));
    await ctx.route(new RegExp(`/api/producers/${DEMO_ID}$`), (r) => r.fulfill({ json: producer }));
    return ctx;
  };

  const HEART = 'button[aria-label="הוסיפו למועדפים"]';
  /**
   * Every target: how to reach it, how to put the page in its FINAL scroll
   * position (`prepare`, run before the closed capture), and how to open it.
   * Every selector below was read off the live DOM, not guessed.
   */
  const targets = [
    {
      key: "LoginPromptModal",
      pageLabel: "/he/producer/[id] — imaged gallery heart",
      file: "components/LoginPromptModal.jsx:85",
      producer: withImages,
      url: `/he/producer/${DEMO_ID}`,
      // The gallery overlay wrapper — ImageGallery.jsx:375.
      open: async (page) => {
        const h = page.locator(`.z-20 ${HEART}`).first();
        await h.waitFor({ state: "visible", timeout: 20_000 });
        await h.click();
      },
    },
    {
      key: "LoginPromptModal (imageless)",
      pageLabel: "/he/producer/[id] — NO photos; ImageGallery.jsx:216 wrapper is z-10",
      file: "components/LoginPromptModal.jsx:85",
      producer: noImages,
      url: `/he/producer/${DEMO_ID}`,
      open: async (page) => {
        const h = page.locator(`[data-testid="gallery-empty-state"] ${HEART}`).first();
        await h.waitFor({ state: "visible", timeout: 20_000 });
        await h.click();
      },
    },
    {
      key: "Lightbox",
      pageLabel: "/he/producer/[id] — mobile banner image",
      file: "components/Lightbox.jsx:134",
      producer: withImages,
      url: `/he/producer/${DEMO_ID}`,
      open: async (page) => {
        // Three such buttons exist (2 in the md+ grid, 1 in the mobile banner);
        // only the mobile one is visible at 390px, so filter on visibility
        // rather than trusting DOM order.
        const img = page.locator('button[aria-label^="הגדלו תמונה"]:visible').first();
        await img.waitFor({ state: "visible", timeout: 20_000 });
        await img.click();
      },
    },
    {
      key: "CertModal (KashrutBadgeStrip)",
      pageLabel: "/he/producer/[id] — kashrut quiet line",
      file: "components/KashrutBadgeStrip.jsx:107",
      producer: withImages,
      url: `/he/producer/${DEMO_ID}`,
      prepare: async (page) => {
        await page.locator('[data-testid="kashrut-cert-trigger-badatz"]').first().scrollIntoViewIfNeeded();
      },
      open: async (page) => {
        const t = page.locator('[data-testid="kashrut-cert-trigger-badatz"]').first();
        await t.waitFor({ state: "visible", timeout: 20_000 });
        await t.click();
      },
    },
    {
      key: "ReportInfoModal",
      pageLabel: "/he/producer/[id] — ContactCard",
      file: "components/ReportInfoModal.jsx:108",
      producer: withImages,
      url: `/he/producer/${DEMO_ID}`,
      prepare: async (page) => {
        await page.getByRole("button", { name: /טעות בפרטים/ }).first().scrollIntoViewIfNeeded();
      },
      open: async (page) => {
        const t = page.getByRole("button", { name: /טעות בפרטים/ }).first();
        await t.waitFor({ state: "visible", timeout: 20_000 });
        await t.click();
      },
    },
    {
      key: "Popover sheetOnMobile",
      pageLabel: "/he/producer/[id] — verified badge (shared primitive, STOP (c) candidate)",
      file: "components/ui/Popover.jsx:347 backdrop · :321 panel",
      producer: withImages,
      url: `/he/producer/${DEMO_ID}`,
      open: async (page) => {
        const t = page.locator('button[aria-label="בית עסק מאומת"]').first();
        await t.waitFor({ state: "visible", timeout: 20_000 });
        await t.click();
      },
    },
    {
      key: "LocationModal",
      pageLabel: "/he (home) — location banner",
      file: "components/LocationModal.jsx:156",
      producer: withImages,
      url: "/he",
      open: async (page) => {
        const b = page.getByRole("button", { name: "בחרו עיר" });
        await b.waitFor({ state: "visible", timeout: 25_000 }); // self-reveals after ~3s
        await b.click();
      },
    },
    {
      key: "AccountSheet",
      pageLabel: "/he (home) — BottomNav account tab",
      file: "components/AccountSheet.jsx:114 scrim · :125 panel",
      producer: withImages,
      url: "/he",
      open: async (page) => {
        const b = page.locator("nav button").filter({ hasText: /חשבון/ }).first();
        await b.waitFor({ state: "visible", timeout: 20_000 });
        await b.click();
      },
    },
  ];

  for (const t of targets) {
    const ctx = await makeCtx(t.producer);
    const page = await ctx.newPage();
    let row;
    try {
      await page.goto(`${BASE}${t.url}`, { waitUntil: "domcontentloaded", timeout: 40_000 });
      await page.waitForTimeout(2200);
      const boom = await page.getByText("משהו השתבש").count();
      if (boom > 0) throw new Error("page rendered the error boundary — fixtures insufficient");
      row = await measure(page, t);
    } catch (e) {
      row = { modal: t.key, page: t.pageLabel, file: t.file, error: String(e).split("\n")[0] };
    }
    rows.push(row);
    await ctx.close();
  }
  await browser.close();

  /* ───────────────────────── control 2 + the table ───────────────────────── */

  const good = rows.filter((r) => !r.error && r.luma?.control);
  const ctlOk = good.length > 0 && good.every((r) => r.luma.control.closed - r.luma.control.open > DARK_D);
  console.log("\n================ CONTROL 2 — the scrim actually painted ================");
  if (!ctlOk) {
    console.log(`FAIL — the control point did not darken on ${good.filter((r) => r.luma.control.closed - r.luma.control.open <= DARK_D).map((r) => r.modal).join(", ") || "(no captures)"}.`);
    console.log("The overlay did not render there, or the sampler is broken.");
    console.log("EVERY luma reading below for those rows is VOID, including the reassuring ones.");
  } else {
    console.log(`PASS — the control point darkens on all ${good.length} captures.`);
  }

  console.log("\n================ MEH-2215 PROBE TABLE ================\n");
  console.log("| modal | mount page | culprit ancestor (property) | elementFromPoint (tabs / header) | luma Δ tabs / header | trapped |");
  console.log("|---|---|---|---|---|---|");
  for (const r of rows) {
    if (r.error) {
      console.log(`| \`${r.modal}\` | ${r.page} | — | — | — | **NOT MEASURED** — ${r.error} |`);
      continue;
    }
    const culprits = r.chain.length
      ? r.chain.map((c) => `\`${c.tag}${c.testid ? `[${c.testid}]` : ""}.${(c.cls.split(/\s+/)[0] || "")}\` — ${c.why.join(" · ")}`).join("<br>")
      : "**none — chain clean to \\<html\\>**";
    const d = (k) => r.luma[k] ? (r.luma[k].closed - r.luma[k].open) : null;
    const fmt = (v) => v === null ? "n/a" : v.toFixed(1);
    // Always name the element, inside or out: post-fix the tab-bar point is
    // painted by the modal's own opaque CARD rather than by the scrim, so its
    // luma barely moves — a delta that looks exactly like the bug's signature.
    // Printing what is actually on top is what separates the two.
    const hitTxt = ["tabs", "header"].map((k) => {
      const h = r.hit[k];
      if (!h) return "n/a";
      const name = `${h.tag}.${(h.cls || "").split(/\s+/)[0]}`;
      return h.inside ? `inside ✓ (${name})` : `**${name}** ✗`;
    }).join(" / ");
    // The verdict is the luma reading: it reads paint, which is what the guest sees.
    const surfaces = ["tabs", "header"].filter((k) => r.luma[k]);
    const over = surfaces.filter((k) => d(k) <= DARK_D);
    const verdict = r.chain.length === 0
      ? "**N — chain clean**"
      : over.length
        ? `**Y — ${over.join(" + ")} paints OVER the scrim**`
        : "**N — capped context, but nothing at root outranks it**";
    console.log(`| \`${r.modal}\` | ${r.page} | ${culprits} | ${hitTxt} | ${fmt(d("tabs"))} / ${fmt(d("header"))} | ${verdict} |`);
  }

  console.log("\n---- what was measured, per row (so a wrong node cannot hide behind a tidy table) ----");
  for (const r of rows) {
    if (r.error) { console.log(`${r.modal}: ERROR ${r.error}`); continue; }
    console.log(`${r.modal}`);
    console.log(`   fixed root : ${r.rootCls}`);
    console.log(`   fixed siblings of it (scrims): ${r.siblingScrims}`);
    console.log(`   chrome rects: header y=${r.chrome.header?.y} h=${r.chrome.header?.h} | tabs ${r.chrome.tabs ? `y=${r.chrome.tabs.y} h=${r.chrome.tabs.h}` : "absent on this page"}`);
    console.log(`   luma control ${r.luma.control.closed.toFixed(1)} -> ${r.luma.control.open.toFixed(1)}`);
  }

  console.log("\n(luma Δ = closed − open. Δ > " + DARK_D + " ⇒ that surface darkened ⇒ it is UNDER the scrim.");
  console.log(" Δ ≈ 0 ⇒ it did not change ⇒ it painted OVER the modal. elementFromPoint over the");
  console.log(" HEADER is non-discriminating — Header.jsx:321 is pointer-events-none.)");

  console.log(`\n${ran.length} control assertions ran, ${failures.length} failed.`);
  if (failures.length) { failures.forEach((f) => console.log(`  FAIL ${f}`)); process.exit(1); }
}

main();
