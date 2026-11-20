/**
 * MEH-1931 Lightbox desktop-visibility probe (NOT part of the e2e suite — run
 * manually):
 *   node e2e/qa-meh1931-lightbox-visibility.mjs [baseURL] [chromiumPath]
 *
 * Four claims are measured here, none inferred:
 *
 *   1. CURSOR. `.custom-cursor` used to carry `mix-blend-mode: multiply`, which
 *      turns the green dot black on a dark backdrop — and, crucially, ALSO
 *      turns a white halo black, because an element carrying mix-blend-mode
 *      blends as a GROUP with its backdrop. STEP 0 proves that with a synthetic
 *      three-arm self-test before any product measurement is trusted.
 *   2. CONTROLS. close / prev / next contrast against the bg-black/95 scrim,
 *      computed from real composited pixels, not from the class name.
 *   3. COUNTER. visual order of "2 / 3" under dir=rtl, measured as the x
 *      position of the first vs the last glyph — not by reading textContent,
 *      which is identical in both the broken and the fixed state.
 *   4. IMAGE ERROR. a dead src must produce the fallback box, never the
 *      browser's broken-image glyph.
 *
 * STEP 0 runs FIRST and exits non-zero on failure: a classifier that cannot
 * separate a correct state from a broken one makes everything after it
 * unreadable (.claude/rules/testing.md — "ship the self-test, run it first").
 *
 * Images are data-URIs on purpose: MEH-1925 (Cloudinary 401, live) would
 * otherwise make every image fail and mask claims 2-4 behind claim 4.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3100";
const CHROME = process.argv[3] || "/opt/pw-browsers/chromium/chrome-linux/chrome";
const OUT = "../qa-artifacts/MEH-1931";
mkdirSync(OUT, { recursive: true });

let failures = 0;
const say = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
};

/* ---------- colour helpers (WCAG 2.x relative luminance + contrast) ------- */
const srgb = (c) => {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const contrast = (a, b) => {
  const [hi, lo] = lum(a) >= lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
};
/* CIE Lab + dE76. A raw /255 channel delta is not a perceptual claim; "looks
   unchanged" needs a perceptual unit. dE76 <= 2.3 is the classic JND. */
const lab = (rgb) => {
  const [rl, gl, bl] = rgb.map(srgb);
  const xyz = [
    (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047,
    0.2126 * rl + 0.7152 * gl + 0.0722 * bl,
    (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
};
const deltaE = (a, b) => {
  const [la, aa, ba] = lab(a);
  const [lb, ab, bb] = lab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
};

/* A 3-image gallery. Each frame is a distinct flat colour so a screenshot can
   be told apart from its neighbour. */
const svg = (hex) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${hex}"/></svg>`,
  )}`;
const IMAGES = [svg("#8fb08a"), svg("#c9a227"), svg("#7a5c3e")];
const DEAD = "https://invalid.invalid/definitely-not-an-image.jpg";

const producer = {
  id: 123,
  name: "חוות הזית",
  slug: null,
  city: "עתלית",
  phone: "0501234567",
  categories: [],
  images: IMAGES,
  is_approved: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_excluded_cities: [],
  pickup_points: false,
  order_window: null,
  locations: [],
  delivery_areas: [],
};

const browser = await chromium.launch({ executablePath: CHROME });

/** Read one pixel out of a PNG buffer without tainting a live page's canvas. */
async function pixelReader(ctx, shot) {
  const p2 = await ctx.newPage();
  await p2.setContent(`<img id="i" src="data:image/png;base64,${shot.toString("base64")}">`);
  await p2.waitForFunction(() => document.querySelector("#i")?.complete);
  const read = (x, y) =>
    p2.evaluate(
      ([xx, yy]) => {
        const img = document.querySelector("#i");
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(xx, yy, 1, 1).data;
        return [d[0], d[1], d[2]];
      },
      [x, y],
    );
  const brightestIn = (x, y, size) =>
    p2.evaluate(
      ([xx, yy, ss]) => {
        const img = document.querySelector("#i");
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(xx, yy, ss, ss).data;
        let win = [0, 0, 0];
        let top = -1;
        for (let i = 0; i < d.length; i += 4) {
          const s = d[i] + d[i + 1] + d[i + 2];
          if (s > top) {
            top = s;
            win = [d[i], d[i + 1], d[i + 2]];
          }
        }
        return win;
      },
      [x, y, size],
    );
  return { read, brightestIn, close: () => p2.close() };
}

/* ======================================================================== */
/* STEP 0 - probe self-test. Three synthetic arms with known answers.        */
/* ======================================================================== */
console.log("\nSTEP 0 · self-test: can the sampler tell a visible halo from a swallowed one?");
{
  const ctx = await browser.newContext({ viewport: { width: 400, height: 400 } });
  const page = await ctx.newPage();
  // The arms isolate ONE variable at a time, and B is the whole point: it is the
  // naive fix ("just add a halo") and it must come out indistinguishable from A.
  // If B were visible, dropping the blend would be unnecessary and this PR would
  // be over-reaching.
  //
  //   A  green dot + multiply                  = exactly what shipped -> SWALLOWED
  //   B  green dot + white halo + multiply     = the naive fix        -> SWALLOWED
  //   C  green dot + white halo, no blend      = what ships now       -> VISIBLE
  //   D  nothing at all (null control)         = bare backdrop        -> SWALLOWED
  //
  // D exists because A/B passing proves nothing if the sampler simply reports the
  // backdrop everywhere; D is the case whose answer is known with certainty.
  await page.setContent(`<body style="margin:0;background:#0c0c0c">
    <div id="A" style="position:fixed;inset-inline-start:60px;top:60px;width:12px;height:12px;border-radius:50%;
      background:#2e6853;mix-blend-mode:multiply"></div>
    <div id="B" style="position:fixed;inset-inline-start:200px;top:60px;width:12px;height:12px;border-radius:50%;
      background:#2e6853;box-shadow:0 0 0 1.5px rgba(255,255,255,.9);mix-blend-mode:multiply"></div>
    <div id="C" style="position:fixed;inset-inline-start:60px;top:200px;width:12px;height:12px;border-radius:50%;
      background:#2e6853;box-shadow:0 0 0 1.5px rgba(255,255,255,.9)"></div>
    <div id="D" style="position:fixed;inset-inline-start:200px;top:200px;width:12px;height:12px"></div>
  </body>`);
  const shot = await page.screenshot();
  writeFileSync(`${OUT}/selftest-halo-arms.png`, shot);
  const px = await pixelReader(ctx, shot);
  const ARMS = ["A", "B", "C", "D"];
  const LABEL = {
    A: "dot + multiply           (shipped before)",
    B: "dot + halo + multiply    (the naive fix)",
    C: "dot + halo, no blend     (ships now)     ",
    D: "nothing                  (null control)  ",
  };
  const centres = await page.evaluate((ids) =>
    ids.map((id) => {
      const r = document.querySelector(`#${id}`).getBoundingClientRect();
      return [Math.round(r.left + r.width / 2 - 12), Math.round(r.top + r.height / 2 - 12)];
    }), ARMS,
  );
  const BG = [12, 12, 12];
  const THRESH = 3; // "discernible" = clears 3:1 against the backdrop
  const arms = {};
  const ratio = {};
  for (const [i, id] of ARMS.entries()) {
    arms[id] = await px.brightestIn(centres[i][0], centres[i][1], 24);
    ratio[id] = contrast(arms[id], BG);
    console.log(`      arm ${id} ${LABEL[id]} rgb(${arms[id]}) contrast ${ratio[id].toFixed(2)}:1`);
  }
  await px.close();
  say(ratio.A < THRESH, "A (as shipped) is SWALLOWED", `${ratio.A.toFixed(2)}:1 < ${THRESH}`);
  say(ratio.B < THRESH, "B (halo UNDER multiply) is ALSO swallowed", `${ratio.B.toFixed(2)}:1 < ${THRESH}`);
  say(ratio.C >= THRESH, "C (halo, blend dropped) is VISIBLE", `${ratio.C.toFixed(2)}:1 >= ${THRESH}`);
  say(ratio.D < THRESH, "D (null control) is SWALLOWED", `${ratio.D.toFixed(2)}:1 < ${THRESH}`);
  say(ratio.C > ratio.B * 2, "C separates from B by a wide margin (not a threshold accident)",
    `${ratio.C.toFixed(2)} vs ${ratio.B.toFixed(2)}`);
  if (failures) {
    console.log("\n  self-test failed -> every measurement below is unreadable. Aborting.");
    await browser.close();
    process.exit(1);
  }
  console.log("      -> the sampler discriminates, and D proves it is not just reading the backdrop.");
  console.log("      -> A vs B IS the proof that a halo cannot survive `multiply`:");
  console.log("         adding the halo changed nothing while the blend was still on.");
  await ctx.close();
}

/* ======================================================================== */
/* product measurements                                                     */
/* ======================================================================== */
const stub = (body) => (route) => {
  const url = route.request().url();
  if (/\/api\/producers\/123$/.test(url)) return route.fulfill({ json: body });
  if (/\/api\/producers(\?|$)/.test(url)) return route.fulfill({ json: [] });
  return route.fulfill({ json: {} });
};

async function openLightbox({ width, height, deadFirst = false, mobile = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    locale: "he",
    ...(mobile ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await ctx.newPage();
  await page.route("**/api/**", stub(deadFirst ? { ...producer, images: [DEAD, ...IMAGES.slice(1)] } : producer));
  await page.goto(`${BASE}/producer/123`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(800);
  // `:visible` matters: the desktop editorial grid hero is `hidden md:grid`, so
  // at 375px a bare .first() resolves to a display:none button and the click
  // times out. Take whichever trigger the breakpoint actually renders.
  await page.locator('[aria-label^="הגדלו תמונה"]:visible').first().click({ timeout: 15_000 });
  await page.waitForSelector('[role="dialog"][aria-label="תצוגת תמונה"]', { timeout: 8000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

/**
 * Return the box-shadow layer that is actually painted as a ring, i.e. the one
 * with a non-zero spread radius. Tailwind emits the ring-offset layer first with
 * 0px spread, so "the first rgba() in the string" is the wrong answer and reads
 * as an opaque white ~19:1 that no user can see.
 */
const ringLayer = (shadow) => {
  const layers = [...shadow.matchAll(/(rgba?\([^)]+\))((?:\s+-?[\d.]+px){2,4})/g)];
  for (const m of layers) {
    const nums = m[2].trim().split(/\s+/).map((v) => Number.parseFloat(v));
    const spread = nums.length >= 4 ? nums[3] : 0;
    if (spread > 0) return { color: m[1], spread };
  }
  return null;
};

/** Composite a possibly-translucent computed colour over a known backdrop. */
const over = (fg, bg) => {
  const m = fg.match(/[\d.]+/g).map(Number);
  const a = m.length > 3 ? m[3] : 1;
  return [0, 1, 2].map((i) => Math.round(m[i] * a + bg[i] * (1 - a)));
};

/* ---- STEP 1/2 · desktop 1440: controls contrast + counter order --------- */
console.log("\nSTEP 1 · desktop 1440 - control contrast vs the bg-black/95 scrim");
{
  const { ctx, page } = await openLightbox({ width: 1440, height: 900 });
  const dpageShadow = (q) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).boxShadow, q);
  const scrimCss = await page.evaluate(
    () => getComputedStyle(document.querySelector('[role="presentation"].fixed.inset-0')).backgroundColor,
  );
  const SCRIM = over(scrimCss, [245, 240, 232]); // bg-black/95 over the cream body
  console.log(`      scrim ${scrimCss} composites to rgb(${SCRIM})`);

  for (const [label, sel] of [
    ["close", '[aria-label="סגרו תצוגה"]'],
    ["prev ", '[aria-label="תמונה קודמת"]'],
    ["next ", '[aria-label="תמונה הבאה"]'],
  ]) {
    const s = await page.evaluate((q) => {
      const el = document.querySelector(q);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { bg: cs.backgroundColor, shadow: cs.boxShadow, w: r.width, h: r.height };
    }, sel);
    const fill = over(s.bg, SCRIM);
    const ratio = contrast(fill, SCRIM);
    say(ratio >= 3, `${label} fill >=3:1`, `${s.bg} -> rgb(${fill}) = ${ratio.toFixed(2)}:1`);
    say(s.w >= 44 && s.h >= 44, `${label} hit area >=44px`, `${s.w}x${s.h}`);
    /* Tailwind's `ring-*` computes to TWO box-shadow layers: the ring-offset
       shadow (opaque, 0px spread — never painted) followed by the real ring.
       The first version of this probe grabbed the FIRST rgba() in the string
       and reported 19.56:1 — that was the invisible offset layer, not the ring.
       Pick the layer that actually has a non-zero spread. */
    const ring = ringLayer(s.shadow);
    if (ring) {
      const px = over(ring.color, SCRIM);
      const r = contrast(px, SCRIM);
      say(r >= 3, `${label} ring >=3:1`, `${ring.color} @${ring.spread}px -> rgb(${px}) = ${r.toFixed(2)}:1`);
    } else {
      say(false, `${label} has a painted ring boundary`, `no non-zero-spread layer in: ${s.shadow}`);
    }
    if (label.trim() === "close") console.log(`      raw box-shadow: ${s.shadow}`);
  }

  /* The base ring is new, so the focus-visible ring now has to distinguish
     itself from a ring rather than from nothing. Before this PR: none -> 2px
     white/40. After: 1px white/70 -> ?. If the two states are near-identical the
     keyboard affordance has been quietly weakened, which would be a regression
     traded for the contrast fix. Measured, not reasoned about. */
  console.log("\nSTEP 1b · focus-visible must still be distinguishable from the new base ring");
  {
    const closeSel = '[aria-label="סגרו תצוגה"]';
    const shadowNow = () => dpageShadow(closeSel);
    const base = await shadowNow();
    await page.keyboard.press("Tab");
    await page.waitForTimeout(150);
    await page.focus(closeSel);
    await page.evaluate((q) => document.querySelector(q).classList.add("__probe-focus"), closeSel);
    // force the focus-visible style by tabbing to it from the keyboard
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);
    const focused = await shadowNow();
    const bw = ringLayer(base)?.spread ?? 0;
    const fw = ringLayer(focused)?.spread ?? 0;
    console.log(`      base ring spread ${bw}px (${ringLayer(base)?.color})`);
    console.log(`      focus ring spread ${fw}px (${ringLayer(focused)?.color})`);
    const changed = focused !== base;
    say(changed, "focus-visible visibly changes the ring", changed ? `${bw}px -> ${fw}px` : "identical box-shadow");
    if (changed) {
      say(fw > bw, "focus ring is thicker than the resting ring", `${bw}px -> ${fw}px`);
    }
  }

  console.log("\nSTEP 2 · counter visual order under dir=rtl");
  const counter = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="lightbox-counter"]');
    const cs = getComputedStyle(el);
    const flat = [...el.childNodes].map((n) => n.textContent).join("");
    const rectOf = (i) => {
      let seen = 0;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        if (seen + n.textContent.length > i) {
          const r = document.createRange();
          r.setStart(n, i - seen);
          r.setEnd(n, i - seen + 1);
          return r.getBoundingClientRect();
        }
        seen += n.textContent.length;
      }
      return null;
    };
    const firstIdx = flat.search(/\d/);
    const lastIdx = flat.length - 1 - [...flat].reverse().join("").search(/\d/);
    return {
      text: el.textContent.trim(),
      dir: cs.direction,
      unicodeBidi: cs.unicodeBidi,
      fvn: cs.fontVariantNumeric,
      docDir: document.documentElement.dir,
      firstChar: flat[firstIdx],
      lastChar: flat[lastIdx],
      firstX: rectOf(firstIdx).x,
      lastX: rectOf(lastIdx).x,
    };
  });
  console.log(`      page dir=${counter.docDir}; counter text="${counter.text}"`);
  console.log(`      direction=${counter.dir} unicode-bidi=${counter.unicodeBidi} font-variant-numeric=${counter.fvn}`);
  console.log(
    `      logical-first glyph "${counter.firstChar}" at x=${counter.firstX.toFixed(1)}; ` +
      `logical-last "${counter.lastChar}" at x=${counter.lastX.toFixed(1)}`,
  );
  say(counter.docDir === "rtl", "page really is RTL (else this proves nothing)", counter.docDir);
  say(
    counter.firstX < counter.lastX,
    'counter reads "current / total" in visual order (not reversed)',
    `"${counter.firstChar}" is left of "${counter.lastChar}"`,
  );
  say(counter.fvn.includes("tabular-nums"), "tabular-nums retained", counter.fvn);
  say(counter.unicodeBidi.includes("isolate"), ".numeric isolation applied", counter.unicodeBidi);

  await page.screenshot({ path: `${OUT}/desktop-1440-lightbox-after.png` });

  await page.keyboard.press("ArrowLeft"); // RTL: ArrowLeft = next
  await page.waitForTimeout(400);
  const shown = (await page.locator('[data-testid="lightbox-counter"]').textContent()).replace(/\s+/g, " ").trim();
  say(shown === "2 / 3", 'counter shows "2 / 3" on slide 2', shown);
  await page.screenshot({ path: `${OUT}/desktop-1440-counter-2of3.png` });

  /* BEFORE/AFTER, measured from real pixels rather than asserted. The prev
     arrow's centre sits on the scrim, so its rendered fill is directly
     comparable across the two states. Eyeballing the two screenshots side by
     side at 1440 was NOT conclusive — hence this assertion. */
  const arrowPt = await page.evaluate(() => {
    const r = document.querySelector('[aria-label="תמונה קודמת"]').getBoundingClientRect();
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
  });
  const ctlPixel = async () => {
    const shot = await page.screenshot();
    const px = await pixelReader(ctx, shot);
    const v = await px.read(arrowPt[0], arrowPt[1]);
    await px.close();
    return { v, shot };
  };
  const afterCtl = await ctlPixel();
  writeFileSync(`${OUT}/desktop-1440-controls-after.png`, afterCtl.shot);

  await page.addStyleTag({
    content: `[role="dialog"] button{background-color:rgba(255,255,255,.10)!important;box-shadow:none!important}`,
  });
  await page.waitForTimeout(300);
  const beforeCtl = await ctlPixel();
  writeFileSync(`${OUT}/desktop-1440-controls-before.png`, beforeCtl.shot);

  const rAfter = contrast(afterCtl.v, SCRIM);
  const rBefore = contrast(beforeCtl.v, SCRIM);
  console.log(`      MEASURED arrow centre AFTER  rgb(${afterCtl.v}) = ${rAfter.toFixed(2)}:1`);
  console.log(`      MEASURED arrow centre BEFORE rgb(${beforeCtl.v}) = ${rBefore.toFixed(2)}:1`);
  say(rBefore < 3, "BEFORE state really does fail 3:1 (the bug is real)", `${rBefore.toFixed(2)}:1`);
  say(rAfter >= 3, "AFTER state passes on the same measurement", `${rAfter.toFixed(2)}:1`);
  say(
    deltaE(afterCtl.v, beforeCtl.v) > 10,
    "the two evidence screenshots are genuinely different states",
    `dE76=${deltaE(afterCtl.v, beforeCtl.v).toFixed(1)}`,
  );
  await ctx.close();
}

/* ---- STEP 3 · cursor over the black scrim ------------------------------- */
console.log("\nSTEP 3 · custom cursor discernibility");
{
  const { ctx, page } = await openLightbox({ width: 1440, height: 900 });
  // Pick a point that is genuinely ON the bg-black/95 scrim. The first run of
  // this probe sampled (700,450) — dead centre, i.e. ON the photo — and read the
  // photo's own colour as if it were the backdrop. Compute a point outside the
  // <img> rect instead, and verify it afterwards against the measured backdrop.
  const pt = await page.evaluate(() => {
    const img = document.querySelector('[role="dialog"] img');
    const r = img.getBoundingClientRect();
    return [Math.round(r.left / 2), Math.round(innerHeight / 2)];
  });
  console.log(`      sampling at (${pt}) — outside the image rect, on the scrim`);

  /** Measured local backdrop = the same pixel with the cursor hidden. No
   *  assumed constant: the reference is whatever is actually painted there. */
  const backdropAt = async () => {
    await page.addStyleTag({ content: `.custom-cursor{visibility:hidden!important}` });
    await page.waitForTimeout(200);
    const shot = await page.screenshot();
    const px = await pixelReader(ctx, shot);
    const v = await px.read(pt[0], pt[1]);
    await px.close();
    return v;
  };
  /* `half` sizes the search box around the pointer. It is a parameter and not a
     constant because the hover state applies scale(3): the halo then sits at a
     radius of ~18px, entirely OUTSIDE a +/-12px window. The first run of this
     check reported the hover cursor at 1.52:1 and looked like a real defect; it
     was the window, not the cursor. Widening it is the fix — but +/-32 was
     chosen by checking it still clears the prev arrow (which ends near x=64,
     while the sample point is x=160), so the box cannot accidentally sample a
     bright control and manufacture a pass. */
  const sample = async (tag, half = 12) => {
    await page.mouse.move(pt[0], pt[1]);
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => !!document.querySelector(".custom-cursor")))) return null;
    const shot = await page.screenshot();
    writeFileSync(`${OUT}/cursor-${tag}.png`, shot);
    const px = await pixelReader(ctx, shot);
    const win = await px.brightestIn(pt[0] - half, pt[1] - half, half * 2);
    await px.close();
    return win;
  };

  const mounted = await page.evaluate(() => !!document.querySelector(".custom-cursor"));
  if (!mounted) {
    say(false, "custom cursor mounted (needs hover:hover + >768px)", "not present in DOM");
  } else {
    const BG = await backdropAt();
    await page.addStyleTag({ content: `.custom-cursor{visibility:visible!important}` });
    console.log(`      measured local backdrop there: rgb(${BG})`);
    say(lum(BG) < 0.02, "that point really is the dark scrim (not the photo)", `rgb(${BG})`);

    const afterPx = await sample("on-black-after");
    const afterRatio = contrast(afterPx, BG);
    console.log(`      brightest pixel at the pointer, AFTER: rgb(${afterPx}) = ${afterRatio.toFixed(2)}:1`);
    say(afterRatio >= 3, "cursor discernible over bg-black/95", `${afterRatio.toFixed(2)}:1`);

    /* HOVER, still in the shipped state (the multiply override below has not
       been applied yet — order matters here). This was unmeasured until
       adversarial review asked for it, and it is the COMMON case inside this
       dialog: the pointer spends its time on close/prev/next.
       `.custom-cursor--hover` applies scale(3) + opacity:.45 !important, so the
       halo's effective alpha drops to 0.9 * 0.45 while the dot triples in size.
       Bigger but fainter — the net direction is not obvious, hence a
       measurement rather than an argument. */
    await page.evaluate(() =>
      document.querySelector(".custom-cursor")?.classList.add("custom-cursor--hover"),
    );
    // Control: prove the widened window is not just finding some other bright
    // thing. With the cursor hidden, the same box must contain nothing bright.
    await page.addStyleTag({ content: `.custom-cursor{visibility:hidden!important}` });
    await page.waitForTimeout(200);
    const emptyShot = await page.screenshot();
    const emptyPx = await pixelReader(ctx, emptyShot);
    const emptyWin = await emptyPx.brightestIn(pt[0] - 32, pt[1] - 32, 64);
    await emptyPx.close();
    await page.addStyleTag({ content: `.custom-cursor{visibility:visible!important}` });
    console.log(`      control: brightest pixel in the same 64px box, cursor hidden: rgb(${emptyWin})`);
    say(contrast(emptyWin, BG) < 1.5, "the widened window contains nothing bright on its own",
      `${contrast(emptyWin, BG).toFixed(2)}:1`);

    const hoverPx = await sample("on-black-hover", 32);
    const hoverRatio = contrast(hoverPx, BG);
    console.log(`      hover state (scale(3), opacity .45): rgb(${hoverPx}) = ${hoverRatio.toFixed(2)}:1`);
    say(hoverRatio >= 3, "cursor still discernible in its HOVER state over the scrim",
      `${hoverRatio.toFixed(2)}:1`);
    await page.evaluate(() =>
      document.querySelector(".custom-cursor")?.classList.remove("custom-cursor--hover"),
    );

    // BEFORE: restore the exact declaration that shipped.
    await page.addStyleTag({ content: `.custom-cursor{mix-blend-mode:multiply!important}` });
    const beforePx = await sample("on-black-before");
    const beforeRatio = contrast(beforePx, BG);
    console.log(`      same pixel with mix-blend-mode:multiply restored: rgb(${beforePx}) = ${beforeRatio.toFixed(2)}:1`);
    say(beforeRatio < 3, "...and was NOT discernible before the fix", `${beforeRatio.toFixed(2)}:1`);
  }
  await ctx.close();
}

/* ---- STEP 3b · cursor on the cream homepage must look unchanged --------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (r) => r.fulfill({ json: [] }));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(600);
  const mounted = await page.evaluate(() => !!document.querySelector(".custom-cursor"));
  if (!mounted) {
    say(false, "custom cursor mounted on the homepage", "not present in DOM");
  } else {
    // Find a point whose real backdrop IS the cream token. The first run sampled
    // a blind (700,620) and landed on a tinted section — rgb(233,223,212), not
    // cream — so the "unchanged on cream" claim was being made about the wrong
    // surface. Scan a grid with the cursor hidden and take the closest match.
    await page.addStyleTag({ content: `.custom-cursor{visibility:hidden!important}` });
    await page.waitForTimeout(200);
    const probeShot = await page.screenshot();
    const scan = await pixelReader(ctx, probeShot);
    const CREAM = [245, 240, 232];
    let best = null;
    for (let x = 60; x <= 1380; x += 120) {
      for (let y = 200; y <= 860; y += 60) {
        const v = await scan.read(x, y);
        const d = deltaE(v, CREAM);
        if (!best || d < best.d) best = { x, y, v, d };
      }
    }
    await scan.close();
    console.log(`      cream sample point (${best.x},${best.y}) backdrop rgb(${best.v}) dE to #F5F0E8 = ${best.d.toFixed(2)}`);
    say(best.d < 3, "found a genuinely cream-coloured backdrop to test over", `dE=${best.d.toFixed(2)}`);

    await page.addStyleTag({ content: `.custom-cursor{visibility:visible!important}` });
    const core = async (tag) => {
      await page.mouse.move(best.x, best.y);
      await page.waitForTimeout(450);
      const shot = await page.screenshot();
      writeFileSync(`${OUT}/cursor-on-cream-${tag}.png`, shot);
      const px = await pixelReader(ctx, shot);
      const v = await px.read(best.x, best.y);
      await px.close();
      return v;
    };
    const after = await core("after");
    await page.addStyleTag({
      content: `.custom-cursor{mix-blend-mode:multiply!important;box-shadow:none!important}`,
    });
    await page.waitForTimeout(300);
    const before = await core("before");
    const dE = deltaE(after, before);
    console.log(`      cream: dot core AFTER rgb(${after}) vs BEFORE rgb(${before})`);
    console.log(`      perceptual difference dE76 = ${dE.toFixed(2)} (JND ~2.3; a 12px dot)`);
    say(dE <= 6, "cream appearance within a hair of unchanged", `dE76=${dE.toFixed(2)}`);
    if (dE > 2.3) {
      console.log(`      NOTE: dE76 ${dE.toFixed(2)} exceeds the 2.3 JND. The dot is very slightly`);
      console.log(`            LIGHTER on cream than it was. Reported, not hidden.`);
    }
  }
  await ctx.close();
}

/* ---- STEP 4 · dead image -> fallback box, never a broken glyph ---------- */
console.log("\nSTEP 4 · onError fallback");
{
  const { ctx, page } = await openLightbox({ width: 1440, height: 900, deadFirst: true });
  await page.waitForTimeout(2500);
  const box = page.locator('[data-testid="lightbox-image-error"]');
  say(await box.isVisible(), "fallback box rendered for a dead src");
  const copy = (await box.textContent())?.trim();
  say(copy === "התמונה לא נטענה", "Hebrew copy matches the locked string", copy);
  const imgs = await page.locator('[role="dialog"] img').count();
  say(imgs === 0, "no <img> left in the dialog -> no broken-image glyph", `${imgs} found`);
  await page.screenshot({ path: `${OUT}/desktop-1440-image-error.png` });
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(700);
  say(!(await box.isVisible()), "error clears when navigating to a good slide");
  await ctx.close();
}

/* ---- STEP 5 · mobile 375: swipe + counter ------------------------------- */
console.log("\nSTEP 5 · mobile 375 - swipe + counter");
{
  const { ctx, page } = await openLightbox({ width: 375, height: 812, mobile: true });
  const read = async () => (await page.locator('[data-testid="lightbox-counter"]').textContent()).replace(/\s+/g, " ").trim();
  const start = await read();
  say(start === "1 / 3", 'mobile counter starts at "1 / 3"', start);
  await page.screenshot({ path: `${OUT}/mobile-375-lightbox.png` });
  // Swipe: touchStartX 300 -> touchEndX 100, so diff > 0 -> goNext.
  await page.evaluate(() => {
    const d = document.querySelector('[role="presentation"].fixed.inset-0');
    const ev = (type, x) => {
      const t = new Touch({ identifier: 1, target: d, clientX: x, clientY: 400 });
      return new TouchEvent(type, { touches: type === "touchend" ? [] : [t], bubbles: true });
    };
    d.dispatchEvent(ev("touchstart", 300));
    d.dispatchEvent(ev("touchmove", 100));
    d.dispatchEvent(ev("touchend", 100));
  });
  await page.waitForTimeout(600);
  const after = await read();
  say(after === "2 / 3", 'swipe advances the counter to "2 / 3"', after);
  await page.screenshot({ path: `${OUT}/mobile-375-counter-2of3.png` });
  await ctx.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
