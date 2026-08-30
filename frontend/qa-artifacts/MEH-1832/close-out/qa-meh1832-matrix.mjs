import { webkit, chromium, devices } from '@playwright/test';
const BASE = 'https://staging.mehamakor.online';
const HDRS = {
  'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  'x-vercel-set-bypass-cookie': 'true',
};
const out = [];
const log = s => { console.log(s); out.push(s); };

async function matrix(name, browser, ctxOpts) {
  const ctx = await browser.newContext({ ...ctxOpts, extraHTTPHeaders: HDRS });
  const page = await ctx.newPage();
  // hydration warnings must be captured BEFORE navigation, or the listener
  // attaches after the warnings have already fired and reports a clean zero.
  const consoleMsgs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.text()); });
  page.on('pageerror', e => consoleMsgs.push('PAGEERROR: ' + e.message));

  const resp = await page.goto(`${BASE}/he`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);

  const R = {};
  // CONTROL first: if the page did not really render, every null below is void.
  R.control = await page.evaluate(() => {
    const b = document.body.getBoundingClientRect();
    return { box: `${Math.round(b.width)}x${Math.round(b.height)}`,
             err: document.body.innerText.includes('משהו השתבש'),
             cards: document.querySelectorAll('a[href^="/he/"]').length };
  });
  log(`\n## ${name} — http=${resp.status()} body=${R.control.box} errBoundary=${R.control.err} links=${R.control.cards}`);
  if (R.control.err || R.control.box.startsWith('0')) { log('  CONTROL FAILED — every row below is void'); await ctx.close(); return; }

  const seen = async (tid) => page.locator(`[data-testid="${tid}"]`).count();
  const row = async (label, fn) => {
    try { const v = await fn(); log(`  ${v.ok === null ? 'N/A ' : v.ok ? 'PASS' : 'FAIL'} ${label.padEnd(30)} ${v.note}`); }
    catch (e) { log(`  ERR  ${label.padEnd(30)} ${String(e.message).slice(0,90)}`); }
  };

  await row('1 geo', async () => { const n = await seen('geo-empty-notice'); return { ok: null, note: `geo-empty-notice n=${n} (state-dependent; not a pass/fail without a geo grant)` }; });
  await row('2 chips deep-links', async () => {
    const n = await page.locator('[data-testid="hero-chips-row"] a, [data-testid="hero-chips-row"] button').count();
    return { ok: n > 0, note: `chips=${n}` };
  });
  await row('3 onboarding', async () => { const n = await seen('hero-delivery-cta'); return { ok: n > 0, note: `hero-delivery-cta n=${n}` }; });
  await row('4 friday strip', async () => {
    const a = await seen('fallback-day-caption'), b = await seen('day-empty-suggestion');
    return { ok: null, note: `fallback-day-caption=${a} day-empty-suggestion=${b} (day-of-week dependent)` };
  });
  await row('5 recently-viewed', async () => {
    const n = await page.locator('text=/נצפו לאחרונה|צפית לאחרונה/').count();
    return { ok: null, note: `n=${n} (empty for a fresh context by design)` };
  });
  await row('6 region fallback', async () => { const n = await seen('region-fallback'); return { ok: null, note: `region-fallback n=${n}` }; });
  await row('7 empty-state', async () => { const n = await seen('empty-generic'); return { ok: n === 0, note: `empty-generic n=${n} (0 expected — catalog is non-empty)` }; });
  await row('8 load-more (#2742)', async () => {
    const before = (await page.locator('[data-testid="producers-counter"]').textContent().catch(() => '')) || '';
    const btn = page.locator('button:has-text("עוד בתי עסק"), a:has-text("עוד בתי עסק")');
    if (await btn.count() === 0) return { ok: null, note: `no load-more control (counter="${before.trim()}")` };
    await btn.first().click(); await page.waitForTimeout(1500);
    const after = (await page.locator('[data-testid="producers-counter"]').textContent().catch(() => '')) || '';
    return { ok: before !== after, note: `counter "${before.trim()}" -> "${after.trim()}"` };
  });
  await row('9 sessionStorage restore', async () => {
    const stored = await page.evaluate(() => window.sessionStorage.getItem('home_visible_count'));
    return { ok: stored !== null, note: `home_visible_count=${stored}` };
  });
  await row('10 hydration warnings', async () => {
    const hyd = consoleMsgs.filter(m => /hydrat|did not match|Text content does not match/i.test(m));
    return { ok: hyd.length === 0, note: `hydration=${hyd.length} allConsole=${consoleMsgs.length}${hyd[0] ? ' :: ' + hyd[0].slice(0,80) : ''}` };
  });
  await ctx.close();
}

const wk = await webkit.launch();
await matrix('webkit-375', wk, { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await wk.close();
const cr = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--ssl-version-max=tls1.2'] });
await matrix('chromium-1440', cr, { viewport: { width: 1440, height: 900 } });
await cr.close();
