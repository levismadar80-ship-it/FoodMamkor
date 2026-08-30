/**
 * MEH-2148 close-out — z-overlap width sweep, CTA vs MiniMap control.
 *
 * INJECT=1 applies, in-browser, exactly what the shipped fix applies in source:
 *   wrapper  += isolation:isolate      (MiniMap.jsx:554-557)
 *   button   z-index 1000 -> 10        (MAP_BUTTON_STYLE, MiniMap.jsx:56)
 * Staging runs the UNFIXED code, so this is how before/after are compared on one
 * host. It is a mechanism proof, not a deployed-code measurement — the deployed
 * check happens after merge.
 */
import { webkit, chromium, devices } from '@playwright/test';
import fs from 'fs';

const BASE = process.env.TEST_URL || 'https://staging.mehamakor.online';
const SLUG = process.env.SLUG || 'teva-pure';
const TAG = process.env.TAG || (process.env.INJECT === '1' ? 'postfix' : 'prefix');
const INJECT = process.env.INJECT === '1';
const HDRS = {
  'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  'x-vercel-set-bypass-cookie': 'true',
};
const SAMPLES = 13, STEP = 40, SETTLE = 260;
const out = [];
const log = (s) => { console.log(s); out.push(s); };

const findEls = () => {
  const bar = [...document.querySelectorAll('*')].find(e => {
    const s = getComputedStyle(e); return s.position === 'fixed' && parseInt(s.zIndex) === 598;
  });
  const ctl = [...document.querySelectorAll('button')].find(e => (e.getAttribute('aria-label') || '').includes('הגדלת המפה'));
  return { bar, ctl };
};

async function sweep(name, browser, ctxOpts) {
  const ctx = await browser.newContext({ ...ctxOpts, extraHTTPHeaders: HDRS });
  const page = await ctx.newPage();
  const resp = await page.goto(`${BASE}/he/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  if (INJECT) {
    const applied = await page.evaluate((src) => {
      const { ctl } = eval(`(${src})`)();
      if (!ctl) return null;
      const wrap = ctl.parentElement;                       // the relative rounded-lg wrapper
      wrap.style.isolation = 'isolate';                     // <- `isolate`
      ctl.style.zIndex = '10';                              // <- z-10
      return { wrapIsolation: getComputedStyle(wrap).isolation, ctlZ: getComputedStyle(ctl).zIndex };
    }, findEls.toString());
    log(`  INJECTED fix: wrapper isolation=${applied.wrapIsolation} button z-index=${applied.ctlZ}`);
    if (applied.wrapIsolation !== 'isolate' || applied.ctlZ !== '10') { log('  FAIL injection did not take — every result below is void'); await ctx.close(); return; }
  }

  const pre0 = await page.evaluate((src) => {
    const { bar, ctl } = eval(`(${src})`)();
    if (!bar || !ctl) return { hasBar: !!bar, hasCtl: !!ctl };
    const b = bar.getBoundingClientRect();
    return { hasBar: true, hasCtl: true, barZ: getComputedStyle(bar).zIndex, ctlZ: getComputedStyle(ctl).zIndex,
             preScrollBottom: Math.round(b.bottom), vpH: window.innerHeight, docH: document.documentElement.scrollHeight };
  }, findEls.toString());
  log(`\n## ${name} [${TAG}] http=${resp.status()} bar(z=${pre0.barZ}) ctl(z=${pre0.ctlZ}) doc=${pre0.docH} vp=${pre0.vpH}`);
  if (!pre0.hasBar || !pre0.hasCtl) { log(`  FAIL control: actors missing (bar=${pre0.hasBar} ctl=${pre0.hasCtl}) — every null below is void`); await ctx.close(); return; }
  log(`  ${pre0.preScrollBottom > pre0.vpH ? 'PASS' : 'FAIL'} flush-control PRE-scroll: bar bottom=${pre0.preScrollBottom} > vp=${pre0.vpH} (hidden below fold)`);

  const overlap = [], reach = [], blocked = [], obstructed = [], nonFlush = [];
  for (let y = 0; y + pre0.vpH <= pre0.docH; y += STEP) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(SETTLE);
    const r = await page.evaluate(({ SAMPLES, src }) => {
      const { bar, ctl } = eval(`(${src})`)();
      if (!bar || !ctl) return null;
      const b = bar.getBoundingClientRect(), c = ctl.getBoundingClientRect();
      const hits = [];
      for (let i = 0; i < SAMPLES; i++) {
        const el = document.elementFromPoint(b.left + (b.width * (i + 0.5)) / SAMPLES, b.top + b.height / 2);
        hits.push(el ? ((ctl.contains(el) || el === ctl) ? 'CTL' : ((bar.contains(el) || el === bar) ? 'BAR' : 'OTHER')) : 'NULL');
      }
      const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      const inVp = cy >= 0 && cy <= window.innerHeight && cx >= 0 && cx <= window.innerWidth;
      const at = inVp ? document.elementFromPoint(cx, cy) : null;
      return { overlap: !(c.bottom <= b.top || c.top >= b.bottom || c.right <= b.left || c.left >= b.right),
               hits, inVp, reach: !!(at && (ctl.contains(at) || at === ctl)), flushDelta: Math.round(window.innerHeight - b.bottom) };
    }, { SAMPLES, src: findEls.toString() });
    if (!r) continue;
    if (r.flushDelta !== 0) nonFlush.push(y);
    if (r.overlap) overlap.push(y);
    if (r.inVp) (r.reach ? reach : blocked).push(y);
    if (r.hits.includes('CTL')) obstructed.push({ y, hits: r.hits.join(',') });
  }
  const range = (a) => a.length ? `${a[0]}..${a[a.length-1]}px (n=${a.length})` : 'none';
  log(`  flush-control POST-scroll: non-flush at ${range(nonFlush)}; flush elsewhere`);
  log(`  overlap offsets : ${range(overlap)}`);
  log(`  ${obstructed.length === 0 ? 'PASS' : 'FAIL'} CTA-unobstructed (${SAMPLES}-sample width sweep): control won ${obstructed.length} sample-set(s)`);
  if (obstructed.length) log(`       first @y=${obstructed[0].y}: ${obstructed[0].hits}`);
  log(`  ${reach.length > 0 ? 'PASS' : 'FAIL'} INVERTED control reachable at SOME offset: ${range(reach)}`);
  log(`  RESIDUAL control in viewport but NOT reachable: ${range(blocked)}`);

  // ---- HARD GATE: fullscreen overlay ----
  await page.evaluate((src) => { window.scrollTo(0, 1800); const { ctl } = eval(`(${src})`)(); ctl.click(); }, findEls.toString());
  await page.waitForTimeout(1200);
  const fsr = await page.evaluate(() => {
    const ov = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!ov) return { open: false };
    const close = ov.querySelector('button');
    const c = close.getBoundingClientRect();
    const at = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
    return { open: true, ovZ: getComputedStyle(ov).zIndex, closeZ: getComputedStyle(close).zIndex,
             closeBox: `${Math.round(c.width)}x${Math.round(c.height)}`,
             hit: at ? (close.contains(at) || at === close ? 'CLOSE' : at.tagName) : 'NULL' };
  });
  log(`  ${fsr.open ? 'PASS' : 'FAIL'} fullscreen opens on control click`);
  if (fsr.open) {
    log(`  ${fsr.ovZ === '1150' ? 'PASS' : 'FAIL'} overlay z-index === 1150 (live computed, not a count-of-0): ${fsr.ovZ}`);
    log(`  ${fsr.hit === 'CLOSE' ? 'PASS' : 'FAIL'} close button reachable at its centre: elementFromPoint=${fsr.hit} box=${fsr.closeBox} z=${fsr.closeZ}`);
  }
  await ctx.close();
}

const wk = await webkit.launch();
await sweep('webkit-iPhone14-390', wk, devices['iPhone 14']);
await wk.close();
const cr = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ssl-version-max=tls1.2'] });
await sweep('chromium-375', cr, { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await cr.close();

fs.mkdirSync('qa-artifacts/MEH-2148/close-out', { recursive: true });
fs.writeFileSync(`qa-artifacts/MEH-2148/close-out/sweep-${TAG}.log`,
  `MEH-2148 CTA-vs-map-control width sweep — ${new Date().toISOString()}\ntarget: ${BASE}/he/${SLUG}\nmode: ${INJECT ? 'POST-FIX (fix injected in-browser)' : 'PRE-FIX (staging as deployed)'}\n${out.join('\n')}\n`);
console.log(`\nwrote qa-artifacts/MEH-2148/close-out/sweep-${TAG}.log`);
