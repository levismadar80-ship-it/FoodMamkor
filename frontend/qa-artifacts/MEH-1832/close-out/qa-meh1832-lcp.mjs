import { chromium } from '@playwright/test';
const BASE='https://staging.mehamakor.online';
const HDRS={'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET,'x-vercel-set-bypass-cookie':'true'};
const br = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--ssl-version-max=tls1.2'] });
const runs=[];
for (let i=1;i<=3;i++){
  const ctx=await br.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,isMobile:true,hasTouch:true,extraHTTPHeaders:HDRS});
  const p=await ctx.newPage();
  await p.addInitScript(()=>{
    // documentElement is null this early; guard so the sampler cannot die silently
    window.__m={lcp:0,cls:0,obsErr:null};
    try{
      new PerformanceObserver(l=>{for(const e of l.getEntries())window.__m.lcp=Math.max(window.__m.lcp,e.startTime);}).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__m.cls+=e.value;}).observe({type:'layout-shift',buffered:true});
    }catch(err){window.__m.obsErr=String(err);}
  });
  await p.goto(`${BASE}/he`,{waitUntil:'load',timeout:60000});
  await p.waitForTimeout(6000);
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight/2));
  await p.waitForTimeout(2500);
  const m=await p.evaluate(()=>window.__m);
  runs.push(m);
  console.log(`  run ${i}: LCP=${m.lcp.toFixed(0)}ms  CLS=${m.cls.toFixed(4)}  observerError=${m.obsErr||'none'}`);
  await ctx.close();
}
await br.close();
const med=a=>a.slice().sort((x,y)=>x-y)[1];
console.log(`  median: LCP=${med(runs.map(r=>r.lcp)).toFixed(0)}ms  CLS=${med(runs.map(r=>r.cls)).toFixed(4)}`);
console.log(`  CONTROL: any run with LCP=0 means the observer never fired -> that run is void`);
