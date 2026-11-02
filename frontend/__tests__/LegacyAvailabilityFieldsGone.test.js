/**
 * MEH-2272 chunk 3 — the legacy availability pair leaves the frontend contract.
 *
 * Chunks 1–2 took `is_available_today` / `availability_status` off every API
 * response. The Zod list schema still declared them ("derived server-side; no
 * frontend reader"), so a revived backend field would parse silently again.
 * This pins both halves: the schema does not declare them, and no source file
 * under app/ · components/ · lib/ reads either key off an object.
 *
 * The source walk carries a corpus control (it must see ProducerCard.jsx and
 * lib/availability.js, and > 200 files) so an empty walk cannot pass as clean.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ProducerListSchema } from "@/lib/schemas";

const LEGACY = ["is_available_today", "availability_status"];
const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Code lines only: a comment may still tell the history of the two fields.
function codeLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/.*$/, ""));
}

describe("MEH-2272 chunk 3 — legacy availability fields are gone", () => {
  it("ProducerListSchema declares neither legacy key", () => {
    const shape = ProducerListSchema.shape;
    expect(shape.availability_state, "control: the enum is still declared").toBeDefined();
    for (const key of LEGACY) expect(shape[key], key).toBeUndefined();
  });

  it("no source file under app/ components/ lib/ reads a legacy key", () => {
    const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));
    const rel = files.map((f) => path.relative(ROOT, f));
    expect(files.length, "corpus control: the walk must see the source tree").toBeGreaterThan(200);
    expect(rel).toContain(path.join("components", "ProducerCard.jsx"));
    expect(rel).toContain(path.join("lib", "availability.js"));

    const offenders = [];
    for (const f of files) {
      codeLines(fs.readFileSync(f, "utf8")).forEach((line, i) => {
        for (const key of LEGACY) {
          if (new RegExp(`\\b${key}\\b`).test(line)) offenders.push(`${path.relative(ROOT, f)}: ${key}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
