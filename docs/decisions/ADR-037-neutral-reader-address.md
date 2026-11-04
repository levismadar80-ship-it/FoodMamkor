# ADR-037: Reader address is gender-neutral on every surface (supersedes ADR-024 §1 feminine half)

**Status:** Accepted
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

`שלך` and `לך` stay, because they are unmarked in writing. `אלייך` (double yod) is marked feminine and is not used.

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
