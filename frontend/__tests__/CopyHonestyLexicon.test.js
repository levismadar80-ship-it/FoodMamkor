import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MEH-1652 half B — the lexicon gate behind BRAND.md §7 ("דיבור בשם בית העסק")
// and ADR-031 ("the outbound channel is unobservable").
//
// THE RULE IN ONE LINE: we say what the SITE knows. Never what the BUSINESS
// will do. The contact CTA is a `wa.me` deep link — the message goes from the
// visitor's phone straight to the business and never touches our servers — so
// every sentence about that message's fate is a guess presented as fact. This
// is a DNA decision (no internal chat), not a temporary limitation, which is
// why the fix is a permanent gate rather than a copy pass.
//
// WHY A VITEST GUARD AND NOT A WORKFLOW STEP: `.github/workflows/**` is
// CC-deny (MEH-671), and vitest already runs inside the required CI gate, so
// a guard added here needs no workflow edit and nothing from Sapir. This
// mirrors the MEH-1661 emoji guard (NoEmojiInMessages.test.js), whose shape
// this file deliberately copies, and the MEH-1507 label-scope contract —
// `.claude/rules/labels.md` writes the same reasoning out in full.
//
// THE PATTERNS ARE DELIBERATELY NARROW. §7's quick test is "who is the subject
// of the sentence?" — Mehamakor speaking about itself uses first person
// (נחזור / נבדוק / נטפל / we will respond), and that is ALLOWED and common:
// eleven such strings live in he.json today and none of them are the defect.
// Matching "any future tense near a time span" would flag all eleven and the
// exemption list would quietly become the guard. So every pattern below
// requires a THIRD-PERSON subject that is the business. A wide net here would
// not be a stricter guard, it would be an unreadable one.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(HERE, "..", "messages");

// NOTE: no `g` flag — these are used with .test() across many strings, and a
// sticky lastIndex would make results order-dependent (the same trap the emoji
// guard documents at its own regex).
const FORBIDDEN = [
  {
    id: "he-wait-for-business",
    // "היא תמתין לבית העסק עד שההזמנות ייפתחו" — MEH-1649's wording.
    re: /תמתין ל(בית ה)?עסק/,
    why: "claims the message will wait — we never observe it after the wa.me handoff",
  },
  {
    id: "he-will-be-answered",
    // "היא תיענה כשההזמנות ייפתחו" — MEH-1546's original wording.
    re: /תיענה|יענה לך|תענה לך|ישיב לך|יגיב לך/,
    why: "promises a reply on the business's behalf",
  },
  {
    id: "he-will-get-back",
    // Third person only. "נחזור אלייך" (Mehamakor, first person) must NOT match.
    re: /יחזרו? אלי[יי]?ך|יחזרו אליכ[םן]/,
    why: "promises the business will get back to the visitor",
  },
  {
    id: "he-habitual-response",
    re: /בדרך כלל (עונה|חוזר|משיב|מגיב)|בית העסק (יחזור|יענה|ישיב|יגיב|יצור קשר)/,
    why: "asserts a response habit or intention we do not measure",
  },
  {
    id: "he-always-available",
    re: /אפשר לפנות בכל שעה|זמין בכל שעה/,
    why: "asserts the business's availability",
  },
  {
    id: "en-they-will-respond",
    re: /\b(they|the business|the owner)\s+(will|'ll)\s+(respond|reply|get back|contact|answer)/i,
    why: "promises a reply on the business's behalf",
  },
  {
    id: "en-habitual-response",
    re: /\b(usually|typically)\s+(responds|replies|answers|gets back)/i,
    why: "asserts a response habit we do not measure",
  },
  {
    id: "en-wait-for-business",
    re: /(will|'ll)\s+wait for (the business|them)/i,
    why: "claims the message will wait — unobservable after the wa.me handoff",
  },
];

/**
 * The REAL classifier. Exercised by the self-test below on synthetic inputs and
 * by the corpus scan on the live bundles — never re-implemented, so the two
 * cannot drift (MEH-1619).
 */
export function collectViolations(node, prefix = "", acc = []) {
  if (typeof node === "string") {
    for (const p of FORBIDDEN) {
      if (p.re.test(node)) acc.push({ key: prefix, pattern: p.id, value: node });
    }
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectViolations(v, prefix ? `${prefix}.${k}` : k, acc);
    }
  }
  return acc;
}

// Dotted key path → one-line justification. EMPTY, and that is the point: at
// the time this guard landed, every violation it found was DELETED rather than
// exempted. An entry here is a claim that a sentence about the business's
// future behaviour is nonetheless defensible — which under ADR-031 it
// essentially never is. Adding one should feel expensive.
const EXEMPT_KEYS = {};

const messageFiles = readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));

describe("MEH-1652 copy-honesty lexicon — messages files", () => {
  it("scans a non-empty messages corpus (guard is actually wired)", () => {
    expect(messageFiles.length).toBeGreaterThanOrEqual(2); // he + en at minimum
  });

  // MEH-1619 self-test FIRST. If the classifier cannot separate a compliant
  // string from a regression-shaped one, nothing it reports below is worth
  // reading. Deterministic synthetic inputs, no I/O, real implementation.
  //
  // The historical wordings are the fixtures, which is what the DoD asked for:
  // a construction that would have caught each one at the time it shipped.
  it("self-test: flags the historical wordings, passes the compliant ones", () => {
    // (1) MEH-1546's original — "היא תיענה כשההזמנות ייפתחו".
    expect(
      collectViolations({ a: "אפשר לשלוח הודעה גם עכשיו — היא תיענה כשההזמנות ייפתחו" }).map((v) => v.pattern)
    ).toEqual(["he-will-be-answered"]);

    // (2) MEH-1649's replacement, live until this change — "תמתין לבית העסק".
    expect(
      collectViolations({ a: "אפשר לשלוח הודעה גם עכשיו — היא תמתין לבית העסק עד שההזמנות ייפתחו" }).map(
        (v) => v.pattern
      )
    ).toEqual(["he-wait-for-business"]);

    // (3) The en-only drift this sweep found — producer.detail.sticky_bar,
    // whose Hebrew twin was clean. Nobody reading Hebrew could have seen it.
    expect(collectViolations({ a: "Send a message — they will respond soon" }).map((v) => v.pattern)).toEqual([
      "en-they-will-respond",
    ]);

    // COMPLIANT — Mehamakor speaking about ITSELF, first person. These are the
    // strings a wider net would have swallowed, so they are asserted clean
    // explicitly rather than left to the corpus scan to cover by accident.
    expect(collectViolations({ a: "נחזור אלייך תוך 3 ימי עסקים" })).toEqual([]);
    expect(collectViolations({ a: "נבדוק ונטפל תוך 48 שעות." })).toEqual([]);
    expect(collectViolations({ a: "We will respond to your request within 30 days." })).toEqual([]);
    // COMPLIANT — a fact the site holds (§7's allowed column).
    expect(collectViolations({ a: "מקבלים הזמנות: ראשון–חמישי 09:00–14:00" })).toEqual([]);
    // COMPLIANT — dashboard advice addressed TO the owner, second person.
    expect(collectViolations({ a: "בתוך 4 שעות בשעות העבודה, תענו משהו" })).toEqual([]);

    // The key PATH is reported, not just the fact of a hit — otherwise a
    // failure names no location and the CI log is not actionable.
    expect(collectViolations({ producer: { detail: { n: "היא תיענה" } } })[0].key).toBe("producer.detail.n");
  });

  for (const file of messageFiles) {
    describe(file, () => {
      const data = JSON.parse(readFileSync(path.join(MESSAGES_DIR, file), "utf8"));
      const violations = collectViolations(data);

      it("no string promises what the business will do", () => {
        const offenders = violations.filter((v) => !(v.key in EXEMPT_KEYS));
        expect(
          offenders,
          `Copy-honesty violations in messages/${file}:\n` +
            offenders.map((o) => `  ${o.key}  [${o.pattern}]  ${o.value}`).join("\n") +
            "\n\nBRAND.md §7: say what the SITE knows, not what the BUSINESS will do. " +
            "The outbound channel is a wa.me deep link we never observe (ADR-031), so " +
            "the claim cannot be true or false — only unverifiable.\n" +
            "Rewriting rarely works: this exact line was rewritten three times " +
            "(MEH-1546 → MEH-1600 → MEH-1649) and stayed wrong. §7's sanctioned answer " +
            "for 'nothing honest to say' is SILENCE — delete the string and let the " +
            "button stand on its own."
        ).toEqual([]);
      });

      it("every allowlisted key still exists and still matches", () => {
        // Split from the check above (no `||`): a stale exemption and a live
        // violation are different failures and each must be visible alone.
        const present = new Set(violations.map((v) => v.key));
        const stale = Object.keys(EXEMPT_KEYS).filter((k) => !present.has(k));
        expect(
          stale,
          `Stale EXEMPT_KEYS entries for ${file} (key gone, or string no longer matches): ` +
            `${stale.join(", ")}\nRemove the entry so the allowlist mirrors reality.`
        ).toEqual([]);
      });
    });
  }
});
