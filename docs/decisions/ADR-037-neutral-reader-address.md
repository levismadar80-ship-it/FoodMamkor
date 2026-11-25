# ADR-037: Reader address is gender-neutral on every surface (supersedes ADR-024 §1 feminine half)

**Status:** Accepted — **Amended 2026-11-24** (no singular address in new copy, see [Amendment](#amendment--2026-11-24--no-singular-address-in-new-copy-meh-3808)) — **Amended 2026-11-25** (generic plural allowed on business surfaces, see [Amendment](#amendment--2026-11-25--generic-plural-on-business-surfaces-meh-3854))
**Date:** 2026-11-04
**Deciders:** Sapir Levi
**Source:** MEH-2661 / PR #3981

## Context
ADR-024 kept brand narrative and "warmth" strings (share text, email bodies) feminine, and BRAND.md §9 layer 2 made the marked pronoun on consumer copy feminine ("אליכן"). In practice the line between a functional string and a warm one was not stable. The group-buy share button read «שתפו עם חברות», and a sweep found about 130 reader-facing strings in the feminine («נסי שוב», «הצטרפי», «אלייך», «היית צריכה»). Many of them sat on surfaces that ADR-024 itself classed as functional. Men and mixed groups use the site, and so do male business owners.
Sapir asked for research into what other sites do, and delegated the decision on 04/11 («מאשרת מה שתחליט»). Large Hebrew products (gov.il, Wix, Google and Meta Hebrew UI, Israeli banks) address the reader in the plural or impersonally. The Hebrew Language Academy treats the masculine plural as the unmarked form for a mixed audience.

## Decision
Every string addressed to the reader, whether a consumer or a business owner, is gender-neutral on every surface: UI, narrative, share and warmth strings, emails and server `detail=` messages. The tools, in order of preference:
1. Plural imperative or past tense: «שתפו», «נסו שוב», «הצטרפו».
2. Verbal noun or infinitive: «הורדת הכרטיס», «יש ללחוץ».
3. Impersonal phrasing: «פעם היה צריך לדעת…».
4. The masculine plural as the unmarked form where a pronoun is needed: «ברוכים הבאים», «אליכם».

~~`שלך` and `לך` stay, because they are unmarked in writing.~~ **Amended 24/11/2026, see below:** the singular `שלך` / `לך` are not used in new copy either. `אלייך` (double yod) is marked feminine and is not used.

**Still feminine, by design:**
- Sapir's own first-person and founder voice: «אנחנו מכירות», «אני כותבת».
- Admin screens and admin-directed messages. She is the reader.
- The automatic badge label «מובילת קהילה», which is a named badge.
- A named woman: «בעלת עסק» for a specific woman (ADR-024 §2 owner-noun taxonomy is unchanged).

## Consequences
**Positive:**
- One rule, so there is no per-string surface classification and no audit churn over warmth versus function.
- No reader is misaddressed.

**Negative:**
- Some warmth is lost in narrative copy.
- Legacy feminine strings can come back via copy pasted from old docs.

**Mitigations:**
- Warmth is carried by content and the founder's first-person voice, not by grammatical gender.
- `test_meh1588_contact_promise` pins «אליכם» over «אלייך». A broader lint can follow if regressions recur.

## Alternatives considered
- Keep ADR-024 as-is (feminine narrative): rejected. It produced the «עם חברות» bug class, and the surface boundary proved unenforceable.
- Slash forms (לקוח/ה): rejected, still forbidden by ADR-014 (typography, magazine voice).
- Full feminine: rejected for the same reasons as in ADR-024.

## Amendment — 2026-11-24 — no singular address in new copy (MEH-3808)

Sapir asked on 24/11 whether the site should address the reader in the singular or the plural, asked for research into what other sites do, and then delegated the rule («תקבע את זה שתדע לעשות את זה תמיד בלי שתשאל אותי»).

The answer follows the Context above: large Hebrew products address the reader in the plural or impersonally, and BRAND.md §9 already makes business surfaces fully neutral (changed on 25/11, see the next amendment). `שלך` and `לך` are unmarked for gender, but they are singular, and they mix with the plural imperatives this ADR prefers («בחרו את המוצרים שלך»), which is exactly the mix §9's self-check forbids.

**Decision:** new copy does not use the singular second person (`שלך`, `משלך`, `לך`, `אותך`, `בשבילך`, `אצלך`, `עליך`, `ממך`, `איתך`, `אליך`, `בך`). Use the tools listed above, in the same order: «המוצרים של העסק», «אפשר לשמור», and «שלכם» / «לכם» when a pronoun cannot be avoided on a consumer surface. Admin copy and messages to a named person are unchanged (the «Still feminine, by design» list).

**Enforcement:** `scripts/checks/brand-lexicon-guard.sh`, rule `singular-address`. The strings written before this amendment are frozen in `scripts/checks/brand-lexicon-baseline.txt` and reworded in batches from a table Sapir approves (workflow rule 22).

## Amendment — 2026-11-25 — generic plural on business surfaces (MEH-3854)

The 24/11 amendment left BRAND.md §9 layer 3 as it was: business surfaces (dashboard, business forms, operational emails) fully neutral, with no pronoun at all. A sweep found 151 business strings with «שלכם», «לכם» or «אליכם». A neutral rewrite of all of them was drafted, and on 25/11 Sapir judged it weaker than what is there now («זה נשמע פחות טוב ממה שיש עכשיו»). Examples: «שימצאו אתכם» became «שימצאו את העסק», and «זהו עמוד העסק שלכם» became «זהו העמוד שמנוהל מהחשבון הזה».

Layer 3 gave its reason as «לא נקבה כפויה — יש גם בעלי עסק גברים». It was written when consumer copy used the feminine. Since this ADR, the marked form is the generic plural, which forces no gender, so a plural pronoun on a business surface meets that reason.

**Decision (Sapir, decision card 25/11):** business surfaces follow the same rule as consumer surfaces. Neutral wording is still the default, and the generic plural («שלכם», «לכם», «אתכם») is allowed when a pronoun is needed. The singular stays forbidden everywhere (24/11 amendment). Existing business copy is left as it is; the neutral rewrite table is not applied.

**Enforcement:** unchanged. `brand-lexicon-guard.sh` checks the singular only, and never checked the plural.
