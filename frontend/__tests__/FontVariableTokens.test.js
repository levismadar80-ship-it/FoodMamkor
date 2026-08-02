import { describe, it, expect } from "vitest";
import tailwindConfig from "../tailwind.config.js";
import tokens from "../tailwind.tokens.json";

/**
 * MEH-1831 — the Tailwind fontFamily stacks must lead with next/font's CSS
 * variable.
 *
 * Why this needs a guard and not just a careful read: `tailwind.tokens.json` is
 * REGENERATED from docs/DESIGN.md, and tailwind.config.js decides which variable
 * to prepend by matching the literal family name inside each stack. So a future
 * DESIGN.md edit that renames a family — or adds a fourth one — produces a stack
 * with NO variable in front. Nothing errors. The build stays green, the
 * utility is still emitted, and the page silently renders the system fallback
 * because no @font-face is named "DM Sans" any more (next/font's faces carry
 * generated names). That is the MEH-1611 silent shape.
 *
 * The self-test at the top feeds the real transform three synthetic stacks
 * whose correct sorting is known, so a validator that cannot tell a var-led
 * stack from a bare one is caught before its verdict on the real config is read
 * (.claude/rules/testing.md).
 */

const FAMILY_TO_VAR = [
  ["Frank Ruhl Libre", "--font-headline"],
  ["DM Sans", "--font-body"],
  ["Heebo", "--font-hebrew"],
];

/**
 * Two properties, and the second is the one that bites.
 *
 * 1. Every brand family named in the stack has its variable present.
 * 2. The variables appear in the SAME RELATIVE ORDER as the families they
 *    stand for. A body stack is "DM Sans" then "Heebo" because DM Sans has no
 *    Hebrew glyphs and Heebo is what renders Hebrew. Emit the variables the
 *    other way round and every Hebrew string on the site silently changes
 *    typeface — no error, no failing build, and under VRT's 2% tolerance
 *    quite possibly no red pixel either.
 */
function verdict(stack) {
  const value = Array.isArray(stack) ? stack.join(", ") : stack;
  const present = FAMILY_TO_VAR.filter(([family]) => value.includes(family));
  if (present.length === 0) return { needsVar: false, ok: true, value };

  const expectedOrder = present
    .slice()
    .sort(([a], [b]) => value.indexOf(a) - value.indexOf(b))
    .map(([, variable]) => `var(${variable})`);

  const actualOrder = value.match(/var\(--font-[a-z]+\)/g) ?? [];
  const ok =
    actualOrder.length === expectedOrder.length &&
    actualOrder.every((v, i) => v === expectedOrder[i]) &&
    value.startsWith(expectedOrder[0]);

  return { needsVar: true, ok, value, expected: expectedOrder.join(", ") };
}

describe("MEH-1831 self-test — the validator discriminates", () => {
  it("accepts a correctly ordered var-led stack", () => {
    expect(
      verdict(['var(--font-body), var(--font-hebrew), "DM Sans", "Heebo", sans-serif']).ok,
    ).toBe(true);
  });

  it("REJECTS a bare stack — the exact regression this file exists for", () => {
    expect(verdict(['"DM Sans", "Heebo", sans-serif']).ok).toBe(false);
  });

  it("REJECTS a stack missing one of its variables", () => {
    expect(verdict(['var(--font-body), "DM Sans", "Heebo", sans-serif']).ok).toBe(false);
  });

  it("REJECTS variables emitted in the wrong order (Hebrew ahead of latin)", () => {
    // The dangerous one: present, spelled correctly, and wrong. Hebrew body
    // text would still render — in Heebo — but latin runs would too.
    expect(
      verdict(['var(--font-hebrew), var(--font-body), "DM Sans", "Heebo", sans-serif']).ok,
    ).toBe(false);
  });

  it("REJECTS a plausible-looking stack carrying the wrong variable", () => {
    expect(verdict(['var(--font-headline), "DM Sans", sans-serif']).ok).toBe(false);
  });

  it("passes a stack naming no brand family through untouched", () => {
    const neutral = verdict(["ui-monospace, monospace"]);
    expect(neutral.needsVar).toBe(false);
    expect(neutral.ok).toBe(true);
  });
});

describe("MEH-1831 — every brand fontFamily token leads with its variable", () => {
  const entries = Object.entries(tailwindConfig.theme.extend.fontFamily);

  it("preserves the generated token keys exactly (no key added or dropped)", () => {
    expect(entries.map(([key]) => key).sort()).toEqual(
      Object.keys(tokens.theme.extend.fontFamily).sort(),
    );
  });

  it.each(entries)("%s carries its next/font variables in stack order", (token, stack) => {
    const result = verdict(stack);
    expect(
      result.ok,
      `fontFamily["${token}"] = ${result.value}\n` +
        `expected it to lead with: ${result.expected} — see tailwind.config.js ` +
        `FONT_VAR_BY_FAMILY. A family renamed in docs/DESIGN.md drops out of that list ` +
        `silently.`,
    ).toBe(true);
  });

  it("keeps the literal family names behind the variables as the fallback", () => {
    // The variables alone are not enough: if next/font ever fails to inject
    // them, the browser must still land on a named family rather than nothing.
    for (const [, stack] of entries) {
      const { needsVar, value } = verdict(stack);
      if (!needsVar) continue;
      expect(value).toMatch(/var\(--font-[a-z]+\)(, var\(--font-[a-z]+\))*,\s*"/);
    }
  });

  it("never puts the Hebrew variable ahead of the latin one in a body stack", () => {
    // Stated separately from the ordering assertion above because this is the
    // specific inversion that changes what Hebrew readers see, and a failure
    // message naming it is worth more than a generic order mismatch.
    for (const [token, stack] of entries) {
      const value = Array.isArray(stack) ? stack.join(", ") : stack;
      if (!value.includes("--font-hebrew") || !value.includes("--font-body")) continue;
      expect(
        value.indexOf("--font-body"),
        `fontFamily["${token}"] puts --font-hebrew before --font-body`,
      ).toBeLessThan(value.indexOf("--font-hebrew"));
    }
  });
});
