import { webkit, devices } from '@playwright/test';
const BASE = 'https://staging.mehamakor.online';
const HDRS = { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' };

const wk = await webkit.launch();

// --- row 5: recently-viewed. Needs a prior producer visit in the same context.
{
  const ctx = await wk.newContext({ viewport:{width:375,height:812}, isMobile:true, hasTouch:true, extraHTTPHeaders: HDRS });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/he/teva-pure`, { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(3000);
  const storedAfterVisit = await p.evaluate(() => {
    const keys = Object.keys(localStorage).concat(Object.keys(sessionStorage));
    return keys.filter(k => /recent|viewed/i.test(k)).map(k => `${k}=${(localStorage.getItem(k)||sessionStorage.getItem(k)||'').slice(0,60)}`);
  });
  await p.goto(`${BASE}/he`, { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(3500);
  const n = await p.locator('text=/נצפו לאחרונה|צפית לאחרונה|לאחרונה/').count();
  console.log(`row5 recently-viewed AFTER a real producer visit:`);
  console.log(`  storage keys matched: ${JSON.stringify(storedAfterVisit)}`);
  console.log(`  heading matches on home: ${n}  -> ${n>0?'PASS (block renders)':'FAIL or not-implemented-on-home'}`);
  await ctx.close();
}

// --- row 1: geo. Needs permission + coordinates.
{
  const ctx = await wk.newContext({
    viewport:{width:375,height:812}, isMobile:true, hasTouch:true, extraHTTPHeaders: HDRS,
    permissions:['geolocation'], geolocation:{ latitude:32.0853, longitude:34.7818 }, // Tel Aviv
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/he`, { waitUntil:'domcontentloaded', timeout:60000 });
  await p.waitForTimeout(4000);
  const geoNotice = await p.locator('[data-testid="geo-empty-notice"]').count();
  const regionFb  = await p.locator('[data-testid="region-fallback"]').count();
  const counter   = (await p.locator('[data-testid="producers-counter"]').textContent().catch(()=>'')) || '';
  console.log(`row1 geo WITH permission+coords (Tel Aviv):`);
  console.log(`  geo-empty-notice=${geoNotice}  region-fallback=${regionFb}  counter="${counter.trim()}"`);
  console.log(`  -> ${counter.trim() ? 'PASS (grid renders under a geo grant)' : 'FAIL (no counter)'}`);
  await ctx.close();
}
await wk.close();
