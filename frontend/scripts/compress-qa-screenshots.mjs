#!/usr/bin/env node
/**
 * compress-qa-screenshots — shrink CC self-QA screenshots to fit the
 * per-PR qa-artifacts size cap (MEH-1156; target 2 MB/PR). Run it on every
 * screenshot BEFORE committing it to `qa-artifacts/` — the raw Playwright PNGs
 * (fullPage + deviceScaleFactor 2) routinely land at 1–5 MB each and bust the
 * cap on their own (e.g. qa-artifacts/MEH-1143/home-events-1280.png = 4.75 MB;
 * this script takes it to ~92 KB, -98%).
 *
 * NOTE: the 2 MB cap is a LIVE, blocking CI gate — the "qa-artifacts size cap"
 * job (qa-artifacts-size in the CI checks workflow) is wired into
 * "CI gate (required)", so an over-cap PR cannot go green. Running this script
 * is how you comply.
 *
 * Strategy (in order of the effect on size):
 *   1. Cap the pixel width at --max-width (default 1440) — undoes the retina
 *      2x device-scale bloat while staying crisp for review at normal zoom.
 *   2. Re-encode to WebP q80 (lossy, but text/UI stays legible; GitHub renders
 *      WebP inline). PNG-24 screenshots shrink ~90 %+ at this quality.
 *
 * WebP is the default because it beats pngquant/JPEG on UI screenshots (sharp
 * text + flat fills). Pass --jpeg for a JPEG q80 fallback if a reviewer needs
 * a universally-openable file.
 *
 * Usage (run from frontend/, where sharp is installed):
 *   node scripts/compress-qa-screenshots.mjs <file-or-dir> [file-or-dir ...]
 *   node scripts/compress-qa-screenshots.mjs --max-width 1280 shot.png
 *   node scripts/compress-qa-screenshots.mjs --jpeg --keep qa-artifacts/MEH-1156/
 *
 * Flags:
 *   --max-width N   downscale so width <= N px (default 1440; 0 = never resize)
 *   --quality N     encoder quality (default 80)
 *   --jpeg          emit .jpg instead of .webp
 *   --keep          keep the source PNG (default: delete it once the compressed
 *                   file is written, so only the small artifact is committed)
 *
 * History: MEH-1156 (creation).
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const args = process.argv.slice(2);
const opts = { maxWidth: 1440, quality: 80, jpeg: false, keep: false, targets: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--max-width") opts.maxWidth = Number(args[++i]);
  else if (a === "--quality") opts.quality = Number(args[++i]);
  else if (a === "--jpeg") opts.jpeg = true;
  else if (a === "--keep") opts.keep = true;
  else opts.targets.push(a);
}
if (opts.targets.length === 0) {
  console.error("usage: node scripts/compress-qa-screenshots.mjs [--max-width N] [--quality N] [--jpeg] [--keep] <file-or-dir> ...");
  process.exit(2);
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const pct = (before, after) => `${(100 * (1 - after / before)).toFixed(1)}%`;

async function listPngs(target) {
  const st = await fs.stat(target);
  if (st.isDirectory()) {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      const p = path.join(target, e.name);
      if (e.isDirectory()) out.push(...(await listPngs(p)));
      else if (/\.png$/i.test(e.name)) out.push(p);
    }
    return out;
  }
  return /\.png$/i.test(target) ? [target] : [];
}

async function compressOne(file) {
  const before = (await fs.stat(file)).size;
  const meta = await sharp(file).metadata();
  let pipe = sharp(file);
  if (opts.maxWidth > 0 && meta.width > opts.maxWidth) {
    pipe = pipe.resize({ width: opts.maxWidth, withoutEnlargement: true });
  }
  pipe = opts.jpeg
    ? pipe.jpeg({ quality: opts.quality, mozjpeg: true })
    : pipe.webp({ quality: opts.quality, effort: 4 });
  const out = file.replace(/\.png$/i, opts.jpeg ? ".jpg" : ".webp");
  const buf = await pipe.toBuffer();
  await fs.writeFile(out, buf);
  const after = buf.length;
  if (!opts.keep && out !== file) await fs.rm(file);
  console.log(
    `${path.basename(file)}  ${kb(before)} -> ${path.basename(out)}  ${kb(after)}  (-${pct(before, after)})`
  );
  return { before, after };
}

let totBefore = 0, totAfter = 0, n = 0;
for (const target of opts.targets) {
  const pngs = await listPngs(target);
  for (const png of pngs) {
    const { before, after } = await compressOne(png);
    totBefore += before; totAfter += after; n++;
  }
}
if (n === 0) console.log("no .png files found in the given targets");
else console.log(`\n${n} file(s): ${kb(totBefore)} -> ${kb(totAfter)}  (-${pct(totBefore, totAfter)} overall)`);
