import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1472 — Emoji LOCK guard (see .agents/skills refs + lib/chip-icons.js header).
// The dashboard product-form diet chips shipped with emoji baked into their i18n
// labels (🌾/🥦/🥕/🥛) instead of the canonical MEH-1418 Phosphor icon system —
// the third "Emoji LOCK survivor" caught. This test closes the class: it scans
// the rendered UI-component sources (components/** + app/**) for emoji codepoints
// and fails on any that is not in an explicitly-justified allowlist. Runs inside
// the existing vitest suite — no new workflow, no env vars.
//
// SCOPE (deliberate):
//   • components/**  app/**  — the rendered UI layer, .js/.jsx/.ts/.tsx.
//   • NOT messages/*.json — guarded since MEH-1661 by the sibling
//     NoEmojiInMessages.test.js (Sapir's 27/07 classification: UI strings
//     stripped, outbound-message payloads exempt via justified allowlist).
//     The one message-file regression THIS ticket locked — the diet chip
//     labels — is still asserted directly below.
//   • NOT lib/** — data modules (holidays.js holiday glyphs, etc.), not UI chrome.
//   • NOT __tests__/** or e2e/** — tests/fixtures.
//
// Comments are stripped before scanning: the codebase documents past emoji
// removals and 🔒/↔ decision markers inside JSDoc/line comments (MapProducerCard,
// FavoriteButton, …). Those are not rendered, so they must not trip the guard.
// The stripper is best-effort (regex, not a full parser); it can under-strip an
// emoji that follows `//` inside a string on the same line — acceptable for a
// defense-in-depth net, and validated against the current corpus.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SCAN_ROOTS = ["components", "app"];

// Any Unicode codepoint with emoji presentation (pictographs, transport, symbols,
// regional indicators). Excludes plain typographic marks like ★ (U+2605) and → /
// ↔ arrows, which are NOT Extended_Pictographic and stay allowed.
const EMOJI = /\p{Extended_Pictographic}(️)?/gu;

// Explicit allowlist — codepoint → one-line justification. Every entry must be a
// symbol that genuinely cannot be expressed as a Phosphor glyph in its context.
const ALLOWLIST = {
  "©": "© — copyright symbol (Footer legal line) + Leaflet/OSM tile attribution; standard typography, not decorative emoji.",
  "\u{1F449}": "👉 — pointer in outbound WhatsApp/story share-message copy (ShareButton, StoryCardCanvas caption); message text sent to WhatsApp, not rendered UI chrome — changing it is a copy decision.",
  "\u{1F33F}": "🌿 — brand leaf drawn onto the generated Instagram story-card via canvas fillText (StoryCardCanvas); raster graphic, not DOM/Phosphor-addressable.",
};
const ALLOWED = new Set(Object.keys(ALLOWLIST));

function stripComments(src) {
  // Block comments /* ... */ (covers JSDoc headers and JSX {/* */}).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Line comments // ... to EOL, but not the // inside a protocol (http://).
  out = out
    .split("\n")
    .map((line) => {
      const i = line.indexOf("//");
      if (i >= 0 && !/:\/\//.test(line.slice(Math.max(0, i - 1), i + 3))) {
        return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
  return out;
}

function walk(dir, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/(^|\/)(node_modules|\.next|__tests__|e2e|coverage)$/.test(p)) continue;
      walk(p, acc);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("MEH-1472 Emoji LOCK — no raw emoji in UI component sources", () => {
  const { files, violations } = (() => {
    const all = SCAN_ROOTS.flatMap((r) => walk(path.join(ROOT, r), []));
    const found = [];
    for (const file of all) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      stripped.split("\n").forEach((line, idx) => {
        let m;
        EMOJI.lastIndex = 0;
        while ((m = EMOJI.exec(line))) {
          const ch = m[0];
          const base = String.fromCodePoint(ch.codePointAt(0));
          if (ALLOWED.has(ch) || ALLOWED.has(base)) continue;
          const rel = path.relative(ROOT, file);
          const cp = "U+" + ch.codePointAt(0).toString(16).toUpperCase();
          found.push(`${rel}:${idx + 1}  ${JSON.stringify(ch)} (${cp})`);
        }
      });
    }
    return { files: all, violations: found };
  })();

  it("scans a non-trivial set of component sources (guards a no-op)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("the matcher actually detects emoji (guards a broken regex)", () => {
    EMOJI.lastIndex = 0;
    expect(EMOJI.test("diet 🌾 label")).toBe(true);
    // typographic marks that must NOT be treated as emoji
    EMOJI.lastIndex = 0;
    expect(EMOJI.test("★ 5")).toBe(false);
    EMOJI.lastIndex = 0;
    expect(EMOJI.test("a → b")).toBe(false);
  });

  it("every allowlist entry carries a justification", () => {
    for (const [ch, why] of Object.entries(ALLOWLIST)) {
      expect(why.trim().length, `justify allowlisted ${JSON.stringify(ch)}`).toBeGreaterThan(20);
    }
  });

  it("no un-allowlisted emoji in components/** or app/**", () => {
    expect(
      violations,
      `Raw emoji found in UI sources. Replace with a Phosphor glyph (lib/chip-icons.js) ` +
        `or, if genuinely un-replaceable, add the codepoint + a one-line justification to ` +
        `ALLOWLIST in this test:\n  ${violations.join("\n  ")}`
    ).toEqual([]);
  });
});

describe("MEH-1472 Emoji LOCK — diet chip labels are emoji-free (the reported class)", () => {
  const DIET_KEYS = ["diet_gluten_free", "diet_vegan", "diet_vegetarian", "diet_lactose_free"];
  const LOCALES = ["he", "en"];

  for (const locale of LOCALES) {
    const messages = JSON.parse(
      readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8")
    );
    const form = messages.settings.products.form;
    for (const key of DIET_KEYS) {
      it(`${locale}.json settings.products.form.${key} has no emoji`, () => {
        EMOJI.lastIndex = 0;
        expect(
          EMOJI.test(form[key]),
          `"${form[key]}" — diet labels render a Phosphor icon via DietChip; the label ` +
            `string itself must be plain text (MEH-1418 attribute system).`
        ).toBe(false);
      });
    }
  }
});
