/**
 * qa-meh1690-contrast.mjs — MEH-1690 AA probe for text over the hero photo.
 *
 * Purpose:  MEH-1690 moved the chips row onto the hero band and, by making the
 *           band taller, moved the H1 into a thinner part of `.scrim-ink`
 *           (which is a gradient over inset-0, so its stops scale with height).
 *           This measures the resulting contrast in the WORST case.
 *
 * Method:   the worst case globals.css:72 names is "a blown-white highlight
 *           under the text", so the probe REPLACES the produce photo with solid
 *           white, screenshots the band, and samples the actually-painted
 *           backdrop pixel beside each text run. Contrast is then computed
 *           against that real pixel.
 *
 *           An earlier version of this probe re-implemented the `.scrim-ink`
 *           stops in JS and composited them arithmetically. That was wrong in
 *           the way that matters: it consulted a COPY of the CSS instead of the
 *           page, so it returned byte-identical numbers before and after a real
 *           scrim change and could not have detected any fix or any regression.
 *           Sampling pixels is what makes this discriminate.
 *
 * Does NOT: judge the photo's mid-tones (white is strictly the worst case), or
 *           replace a real-device check.
 * History:  MEH-1690 (creation).
 */
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const AA = 4.5;

const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const parse = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

const browser = await chromium.launch({ executablePath: EXE });
let fails = 0;

for (const vp of [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "he-IL",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/he`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="hero-chips-row"]');

  // Worst case: the photo is a blown-white highlight everywhere.
  await page.evaluate(() => {
    const kb = document.querySelector(".kenburns-right");
    if (kb) {
      kb.style.backgroundImage = "none";
      kb.style.backgroundColor = "#ffffff";
    }
  });

  const geo = await page.evaluate(() => {
    const kb = document.querySelector(".kenburns-right");
    const band = kb.parentElement.getBoundingClientRect();
    const item = (label, sel, pickBg) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        label,
        color: cs.color,
        ownBg: pickBg ? cs.backgroundColor : null,
        // Sample at the TOP line — highest up the band, thinnest scrim.
        sampleY: Math.round(b.top + parseFloat(cs.fontSize) * 0.5),
      };
    };
    return {
      band: {
        x: Math.round(band.left),
        y: Math.round(band.top),
        width: Math.round(band.width),
        height: Math.round(band.height),
      },
      items: [
        item("H1 (over photo)", "h1", false),
        item("subtitle (over photo)", "section p", false),
        item("chips prefix (over photo)", '[data-testid="hero-chips-row"] span', false),
        item("chip label (own fill)", '[data-testid="hero-chips-row"] button', true),
      ].filter(Boolean),
    };
  });

  const buf = await page.screenshot({ clip: geo.band });
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const cx = Math.max(0, Math.min(info.width - 1, x));
    const cy = Math.max(0, Math.min(info.height - 1, y));
    const i = (cy * info.width + cx) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  console.log(`\n=== viewport ${vp.name}px  (band ${geo.band.width}x${geo.band.height}) ===`);
  for (const it of geo.items) {
    const fg = parse(it.color);
    let bg;
    let note;
    if (it.ownBg && !/rgba?\([^)]*,\s*0\)/.test(it.ownBg)) {
      bg = parse(it.ownBg);
      note = `own fill ${it.ownBg}`;
    } else {
      // Sample the painted backdrop 3px in from the band's inline edges, at the
      // text's own y — inside the band, clear of glyphs.
      const y = it.sampleY - geo.band.y;
      const cands = [px(3, y), px(info.width - 4, y)];
      // Worst case = the LIGHTEST backdrop the text can sit on.
      bg = cands.reduce((a, b) => (lum(a) > lum(b) ? a : b));
      note = `painted backdrop rgb(${bg.join(",")}) @y=${y}`;
    }
    const r = contrast(fg, bg);
    const ok = r >= AA;
    if (!ok) fails++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${it.label.padEnd(26)} ${r.toFixed(2)}:1  (fg ${it.color}; ${note})`);
  }

  await ctx.close();
}

await browser.close();
console.log(`\nRESULT: ${fails === 0 ? `PASS — all ≥ ${AA}:1` : `FAIL (${fails} under ${AA}:1)`}`);
process.exit(fails === 0 ? 0 : 1);
