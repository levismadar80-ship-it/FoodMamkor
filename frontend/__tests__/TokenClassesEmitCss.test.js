/**
 * MEH-1687 / ADR-038 — every token-spelled class the codemods introduced
 * actually EMITS CSS, and emits exactly what the raw spelling it replaced did.
 *
 * Why: Tailwind renders nothing — and raises nothing — for a class whose key
 * is missing from the config. The value pins in the codemod tests
 * (RadiusTokenCodemod, TouchTokenCodemod, StatusColorTokenCodemod) check the
 * JSON, not the compiled output; a config that stopped spreading the tokens
 * would leave every pin green and every converted site unstyled. This test
 * compiles both spellings through the repo's own tailwind.config.js and
 * compares the declarations. (CI reviewer on PR #4041, "Should Consider" 2.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "../tailwind.config.js";

async function declarations(cls) {
  const cfg = { ...config, content: [{ raw: cls }], corePlugins: { ...(config.corePlugins || {}), preflight: false } };
  const out = await postcss([tailwind(cfg)]).process("@tailwind utilities;", { from: undefined });
  const m = out.css.match(/\{([^}]*)\}/);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const PAIRS = [
  ...STEPS.flatMap((s) => [
    [`bg-danger-${s}`, `bg-red-${s}`],
    [`text-warning-${s}`, `text-amber-${s}`],
  ]),
  ["border-danger-200", "border-red-200"],
  ["bg-danger-600/20", "bg-red-600/20"],
  ["bg-surface", "bg-white"],
  ["bg-surface/90", "bg-white/90"],
  ["bg-surface/95", "bg-white/95"],
  ["rounded-sm", "rounded-[8px]"],
  ["rounded-md", "rounded-[12px]"],
  ["rounded-lg", "rounded-[16px]"],
  ["rounded-xl", "rounded-[20px]"],
  ["min-h-touch", "min-h-[44px]"],
  ["min-w-touch", "min-w-[44px]"],
];

describe("token classes emit the same CSS as the raw spelling they replaced", () => {
  it("control: a class with no config key emits nothing, and a different step differs", async () => {
    expect(await declarations("bg-no-such-token-50")).toBe("");
    expect(await declarations("bg-danger-600")).not.toBe(await declarations("bg-danger-700"));
  });

  it.each(PAIRS)("%s ≡ %s", async (token, raw) => {
    const t = await declarations(token);
    expect(t, `${token} emitted no CSS — is its key in tailwind.tokens.json and spread by the config?`).not.toBe("");
    expect(t).toBe(await declarations(raw));
  });
});

/**
 * MEH-2798 — and the reason this block exists rather than another PAIRS row.
 *
 * PAIRS above is a HAND-MAINTAINED list of the classes the codemods
 * introduced. It is not, and never claimed to be, an inventory of every token
 * class in the repo — but it reads like one, which is how
 * `text-muted-foreground` sat in CollectionNotice's default tone for months
 * emitting nothing. The machinery here would have caught it on day one; the
 * list simply never named it.
 *
 * So this reads the classes OUT OF THE COMPONENT instead of restating them.
 * Whatever TONES holds is what gets compiled, so the next wrong spelling fails
 * here even though nobody remembered to add a row.
 *
 * SCOPE, stated so a green is not read as more than it is: this covers ONE
 * component. The general version — scan every component for colour-ish token
 * classes and compile each — is the actual fix for the class and belongs in
 * its own card; it needs a decision about dynamically built class names, which
 * this does not.
 */
const COLLECTION_NOTICE = readFileSync(
  path.join(import.meta.dirname, "..", "components", "CollectionNotice.jsx"),
  "utf8",
);

/** Every class named inside CollectionNotice's TONES map. */
function toneClasses() {
  const block = COLLECTION_NOTICE.match(/const TONES = \{([\s\S]*?)\n\};/);
  // Control: if the map stops matching, an empty list would make the
  // assertions below pass vacuously — "every class emits CSS", zero classes.
  expect(block, "TONES not found in CollectionNotice.jsx — the parse broke").toBeTruthy();
  const classes = [...block[1].matchAll(/"([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter((c) => /^(text|bg|border)-/.test(c));
  expect(classes.length, "parsed no colour classes from TONES").toBeGreaterThan(2);
  return [...new Set(classes)];
}

describe("CollectionNotice's tone classes all emit CSS (MEH-2798)", () => {
  it("the parse finds the real classes", () => {
    // Named explicitly as well as derived: if the fix were reverted, the
    // derived list would still be checked below, but this says which spelling
    // is correct so the failure names the remedy.
    expect(toneClasses()).toContain("text-fg-muted");
    expect(toneClasses()).not.toContain("text-muted-foreground");
  });

  it.each(toneClasses().map((c) => [c]))("%s compiles to a declaration", async (cls) => {
    const out = await declarations(cls);
    expect(
      out,
      `${cls} emitted NO CSS. Tailwind renders nothing and raises nothing for a ` +
        `class whose key is missing from the config, so this surface would ` +
        `silently inherit its parent instead. Add the key to ` +
        `tailwind.tokens.json or use an existing token.`,
    ).not.toBe("");
  });
});
