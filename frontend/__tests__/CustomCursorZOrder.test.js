/**
 * MEH-2300 — the custom cursor must paint ABOVE every fixed overlay.
 *
 * The bug: `.custom-cursor-on *{cursor:none !important}` (globals.css) hides
 * the native pointer everywhere, and the replacement dot `.custom-cursor` sat
 * at `z-index: 9999` — the SAME value as ChatWidget's fixed launcher and
 * panel (inline `zIndex: 9999`). On a tie, DOM order decides, and layout.js
 * mounts <ChatWidgetLazy /> after <CustomCursor />, so the open panel painted
 * over the dot: no pointer at all over the chat.
 *
 * jsdom has no layout and no stylesheet cascade, so this reads the SOURCE —
 * same approach as ZTokenLedgerSync.test.js. Each parser carries a control so
 * an empty parse cannot read as a pass.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import tailwindConfig from "../tailwind.config.js";

const FRONTEND = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(FRONTEND, rel), "utf8");

/**
 * MEH-3169: z values are named tokens defined once in tailwind.config.js — a
 * class `z-<name>` or a property `var(--z-<name>)`. Resolve through that object
 * so every comparison below is still between the numbers that render.
 */
const Z = tailwindConfig.theme.extend.zIndex;
const zOfVar = (value) => {
  const m = /^var\(--z-([a-z0-9-]+)\)$/.exec(value.trim());
  if (!m) return Number(value);
  if (!(m[1] in Z)) throw new Error(`var(--z-${m[1]}) is not a token in tailwind.config.js zIndex`);
  return Number(Z[m[1]]);
};

/** Declarations of the `.custom-cursor { … }` rule (the bare one, not modifiers). */
function cursorRule() {
  const css = read("app/globals.css");
  const m = css.match(/(^|\n)\.custom-cursor\s*\{([^}]*)\}/);
  if (!m) return null;
  // Strip comments so prose inside the block cannot supply a value.
  return m[2].replace(/\/\*[\s\S]*?\*\//g, "");
}

function decl(body, prop) {
  const m = body.match(new RegExp(`(^|[;\\s])${prop}\\s*:\\s*([^;]+);`));
  return m ? m[2].trim() : null;
}

/** Inline zIndex values in ChatWidget (launcher + panel), numeric or `var(--z-…)`. */
function chatZ() {
  const src = read("components/ChatWidget.jsx");
  return [...src.matchAll(/zIndex:\s*(?:(\d+)|"(var\(--z-[a-z0-9-]+\))")/g)]
    .map((m) => (m[1] !== undefined ? Number(m[1]) : zOfVar(m[2])));
}

/** Every z class applied in app/ + components/: arbitrary z-[N] or a named token. */
function tailwindZ() {
  const isComment = (l) => /^\s*(\*|\/\/|\/\*|\{\/\*)/.test(l);
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|jsx)$/.test(e.name)) continue;
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        if (isComment(line)) return;
        for (const m of line.matchAll(/z-\[(\d+)\]/g)) {
          out.push({ z: Number(m[1]), at: `${path.relative(FRONTEND, p)}:${i + 1}` });
        }
        for (const m of line.matchAll(/(?<![\w-])z-([a-z][a-z0-9-]*)(?![\w-])/g)) {
          if (m[1] in Z) out.push({ z: Number(Z[m[1]]), at: `${path.relative(FRONTEND, p)}:${i + 1}` });
        }
      });
    }
  };
  for (const d of ["app", "components"]) walk(path.join(FRONTEND, d));
  return out;
}

describe("CustomCursor paints above fixed overlays (MEH-2300)", () => {
  it("CONTROL — every parser finds what it is aimed at", () => {
    const rule = cursorRule();
    expect(rule, ".custom-cursor rule not found in globals.css").not.toBeNull();
    expect(decl(rule, "z-index"), ".custom-cursor has no z-index").not.toBeNull();
    expect(decl(rule, "position")).toBe("fixed");
    // Launcher + panel. If this drops to 0 the comparison below is vacuous.
    expect(chatZ().length, "ChatWidget inline zIndex values not found").toBeGreaterThanOrEqual(2);
    expect(tailwindZ().length, "no z-[N] tokens found in code").toBeGreaterThan(15);
  });

  it("cursor z-index is strictly above the chat launcher and panel", () => {
    const cursor = zOfVar(decl(cursorRule(), "z-index"));
    for (const z of chatZ()) {
      expect(cursor, `cursor ${cursor} must be > chat zIndex ${z} (a tie loses on DOM order)`).toBeGreaterThan(z);
    }
  });

  it("cursor z-index is strictly above every z class in the app (z-[N] or a named token)", () => {
    const cursor = zOfVar(decl(cursorRule(), "z-index"));
    const notBelow = tailwindZ().filter(({ z }) => z >= cursor);
    expect(
      notBelow.map(({ z, at }) => `z-[${z}] ${at}`),
      `overlays that tie or beat the cursor (${cursor}):`,
    ).toEqual([]);
  });

  it("cursor never intercepts clicks (pointer-events stays none)", () => {
    expect(decl(cursorRule(), "pointer-events")).toBe("none");
  });
});
