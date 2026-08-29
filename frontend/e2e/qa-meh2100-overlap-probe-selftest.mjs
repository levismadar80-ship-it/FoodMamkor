import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage();
// Three synthetic lists with KNOWN answers: inline (must NOT flag),
// stacked (must NOT flag), genuinely collided (MUST flag exactly 1).
await p.setContent(`
  <ul id="inline" style="display:flex;gap:8px;margin:0"><li>a</li><li>b</li><li>c</li></ul>
  <ul id="stacked" style="margin:0"><li>x</li><li>y</li></ul>
  <ul id="broken" style="margin:0;position:relative;height:60px">
    <li style="position:absolute;top:0;left:0;width:200px;height:40px">p</li>
    <li style="position:absolute;top:20px;left:0;width:200px;height:40px">q</li>
  </ul>`);
const r = await p.evaluate(() => {
  let n = 0; const detail = [];
  for (const ul of document.querySelectorAll("ul")) {
    const rows = [...ul.children].filter((li) => li.tagName === "LI" && li.getBoundingClientRect().height > 0);
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i].getBoundingClientRect(), bb = rows[i + 1].getBoundingClientRect();
      const ox = Math.min(a.right, bb.right) - Math.max(a.left, bb.left);
      const oy = Math.min(a.bottom, bb.bottom) - Math.max(a.top, bb.top);
      if (ox > 2 && oy > 2) { n++; detail.push(ul.id); }
    }
  }
  return { n, detail };
});
console.log("SELF-TEST result:", JSON.stringify(r));
console.log(r.n === 1 && r.detail[0] === "broken"
  ? "SELF-TEST PASS — flags the real collision, ignores inline and stacked"
  : "SELF-TEST FAIL — the probe cannot discriminate; its green is worthless");
await b.close();
process.exit(r.n === 1 && r.detail[0] === "broken" ? 0 : 1);
