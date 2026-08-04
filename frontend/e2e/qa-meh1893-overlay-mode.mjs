import { chromium } from "@playwright/test";
const T='[data-testid="badge-overflow"]', P='[data-testid="badge-overflow-popover"]';
const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--ssl-version-max=tls1.2"] });
const ctx = await browser.newContext({ viewport:{width:375,height:812}, hasTouch:true, isMobile:true,
  extraHTTPHeaders:{ "x-vercel-protection-bypass":process.env.VERCEL_AUTOMATION_BYPASS_SECRET||"", "x-vercel-set-bypass-cookie":"true","x-vercel-skip-toolbar":"1" }});
const page = await ctx.newPage();
await page.goto("https://staging.mehamakor.online/",{waitUntil:"domcontentloaded",timeout:60000});
await page.waitForSelector('[data-testid="producer-card"]',{timeout:45000});
const t = page.locator(T).first(); await t.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
const b = await t.boundingBox(); await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2); await page.waitForTimeout(400);
const info = await page.evaluate((sel)=>{ const el=document.querySelector(sel); if(!el) return null;
  const cs=getComputedStyle(el); return { position:cs.position, top:cs.top, zIndex:cs.zIndex, parent:el.parentElement?.tagName+"."+(el.parentElement?.className||"").slice(0,40) }; }, P);
console.log("panel computed:", JSON.stringify(info));
const y0=await page.evaluate(()=>window.scrollY); const r0=await page.locator(P).boundingBox();
await page.evaluate(()=>window.scrollBy(0,300)); await page.waitForTimeout(600);
const y1=await page.evaluate(()=>window.scrollY); const r1=await page.locator(P).boundingBox().catch(()=>null);
console.log(`scrollY ${y0}->${y1} | panel viewport y ${r0?Math.round(r0.y):"n/a"} -> ${r1?Math.round(r1.y):"GONE"}`);
console.log("still present:", await page.locator(P).count());
await browser.close();
