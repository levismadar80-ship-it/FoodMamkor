/**
 * MEH-1687 batch D — modal overlays do not blur what is behind them.
 *
 * The 03/09 design-debt audit (P7) found two `fixed inset-0` dialog overlays
 * with `backdrop-blur-sm` — CityPickerModal and LocationModal — while the other
 * nine overlays in the app use a flat scrim. Over /map the blur is the most
 * expensive composite on a 3G phone (it re-samples the Leaflet layer every
 * frame), and it is the one place the scrims disagreed. Both are now flat.
 *
 * The sticky Header / dashboard bars keep their glass on purpose (ADR-023,
 * MEH-1686) — they are not `fixed inset-0` overlays, so this test does not
 * see them.
 *
 * Corpus control: the walk must find at least 5 `fixed inset-0` overlays, so
 * a mis-rooted walk cannot pass as clean.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("MEH-1687 D — fixed inset-0 overlays carry no backdrop blur", () => {
  it("no class string with `fixed inset-0` also carries backdrop-blur", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    let overlays = 0;
    const offenders = [];
    for (const f of files) {
      for (const m of fs.readFileSync(f, "utf8").matchAll(/(["'`])([^"'`]*\bfixed inset-0\b[^"'`]*)\1/g)) {
        overlays += 1;
        if (/\bbackdrop-blur/.test(m[2])) offenders.push(path.relative(ROOT, f));
      }
    }
    expect(overlays, "corpus control: overlays must be found").toBeGreaterThanOrEqual(5);
    expect(offenders).toEqual([]);
  });
});
