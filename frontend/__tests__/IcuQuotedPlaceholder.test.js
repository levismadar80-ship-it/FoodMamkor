import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTranslator } from "next-intl";

// MEH-2261 — ICU quoted-literal guard.
//
// In ICU MessageFormat (which next-intl parses messages/*.json with), a single
// quote before `{` opens a LITERAL quote: `'{label}'` means "the text {label},
// verbatim", not "the value of label wrapped in quotes". Four strings shipped
// that way and rendered the placeholder name to the user:
//
//   he.json  same_city.labelled     «יש לך כבר {label} בחיפה.»
//   en.json  same_city.labelled     "You already have {label} in Haifa."
//   he/en    categories.confirm_delete  «מחיקת {name} — 3 בתי עסק משויכים»
//
// The fix is ICU's own escape: `''` is one literal apostrophe, so `''{label}''`
// renders 'החנות'. Approved copy is preserved to the character — this is an
// escaping change, not a wording change, so no rule-22 copy gate applies.
//
// WHY A GUARD AND NOT JUST THE FIX: nothing about `'{x}'` looks wrong in a diff.
// It reads as ordinary quoting in every language except the one that parses it,
// and it fails silently — no error, no warning, just a placeholder shown to a
// business owner. Same family as NoEmojiInMessages.test.js: a message-file
// pattern that is never legitimate, asserted once so it cannot come back.
//
// SCOPE: messages/he.json + messages/en.json, all nesting depths. The pattern
// `'{identifier}'` is ALWAYS a bug in these files — there is no case where a
// message wants the literal text "{label}" shown to a user.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(HERE, "..", "messages");
const LOCALES = ["he", "en"];

// A single-quoted placeholder: '{ident}'. Deliberately NOT matching `''{x}''`
// — that is the escaped, correct form, and its inner text is `'{x}'` only if
// you read past the doubled quotes. The negative lookbehind/ahead below keep
// the fixed form from matching itself.
const QUOTED_PLACEHOLDER = /(?<!')'\{[a-zA-Z_][a-zA-Z0-9_]*\}'(?!')/g;

function walk(node, trail, out) {
  for (const [key, value] of Object.entries(node)) {
    const here = [...trail, key];
    if (typeof value === "string") {
      for (const hit of value.match(QUOTED_PLACEHOLDER) ?? []) {
        out.push({ key: here.join("."), hit, value });
      }
    } else if (value && typeof value === "object") {
      walk(value, here, out);
    }
  }
}

function scan(locale) {
  const raw = readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8");
  const found = [];
  walk(JSON.parse(raw), [], found);
  return found;
}

describe("ICU quoted placeholders (MEH-2261)", () => {
  // The self-test runs FIRST: a scanner that cannot see the broken shape makes
  // every clean result below meaningless. Both cases are real strings from this
  // repo's history — the one that shipped, and the one that replaced it.
  it("the scanner discriminates the broken form from the fixed one", () => {
    const broken = { a: { labelled: "יש לך כבר '{label}' ב{city}." } };
    const fixed = { a: { labelled: "יש לך כבר ''{label}'' ב{city}." } };
    const plain = { a: { unlabelled: "יש לך כבר {kind} ב{city}." } };

    const brokenHits = [];
    walk(broken, [], brokenHits);
    expect(brokenHits.map((h) => h.key)).toEqual(["a.labelled"]);

    const fixedHits = [];
    walk(fixed, [], fixedHits);
    expect(fixedHits).toEqual([]);

    const plainHits = [];
    walk(plain, [], plainHits);
    expect(plainHits).toEqual([]);
  });

  // What the scanner asserts is a *rendering* claim, so pin it against the real
  // library rather than trusting the regex to stand in for ICU's semantics.
  // (A first pass at this ticket used intl-messageformat directly and got the
  // OPPOSITE answer — different library, different behaviour. next-intl is what
  // the app runs, so next-intl is what decides.)
  it("next-intl renders the broken form literally and the fixed form correctly", () => {
    const messages = {
      t: {
        broken: "יש לך כבר '{label}' ב{city}.",
        fixed: "יש לך כבר ''{label}'' ב{city}.",
      },
    };
    const t = createTranslator({ locale: "he", messages, namespace: "t" });
    const args = { label: "החנות", city: "חיפה" };

    expect(t("broken", args)).toBe("יש לך כבר {label} בחיפה.");
    expect(t("fixed", args)).toBe("יש לך כבר 'החנות' בחיפה.");
  });

  it.each(LOCALES)("messages/%s.json has no single-quoted placeholders", (locale) => {
    const hits = scan(locale);
    const report = hits.map((h) => `  ${h.key}: ${h.hit}  in  ${h.value}`).join("\n");
    expect(
      hits,
      hits.length === 0
        ? ""
        : `messages/${locale}.json has ${hits.length} single-quoted placeholder(s).\n` +
            `ICU reads '{x}' as the literal text "{x}" — the user sees the placeholder name.\n` +
            `Write ''{x}'' for a literal apostrophe around the value.\n${report}`,
    ).toEqual([]);
  });

  // Derived, not stated: a count written by hand goes stale the moment a locale
  // is added, and would read as coverage while measuring nothing.
  it("scans every locale file the app ships", () => {
    expect(LOCALES.length).toBe(2);
    for (const locale of LOCALES) {
      expect(() => scan(locale)).not.toThrow();
    }
  });
});
