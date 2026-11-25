# COPY_STYLE.md — Hebrew UI copy source of truth

> The canonical reference for Hebrew UI copy in Mehamakor, and the entry point
> to every copy rule (§0): allowed vs forbidden terms, the neutral-address verb table, canonical spellings, the RTL-arrow
> rule, and the בית-עסק vs בעלת-עסק usage distinction.
>
> Created by MEH-232 (6/7). Extends — does **not** duplicate — the micro-copy
> guidance in [`docs/DESIGN.md`](./DESIGN.md) and the brand voice in
> [`docs/BRAND.md`](./BRAND.md) §4–7. Where this file and BRAND.md disagree on
> brand positioning, **BRAND.md wins** (Truth Hierarchy). This file owns the
> *mechanical* copy rules (gender, spelling, glyphs); BRAND.md owns *voice*.
>
> Audit that produced this file: [`docs/audits/2026-06-13-copy.md`](./audits/2026-06-13-copy.md).

---

## 0. Where every copy rule lives, and what enforces it

Start here. This file is the entry point; each rule below has ONE home, and a
row here points at it rather than restating it. "Not enforced" means no check
fails when the rule is broken — review is the only gate. (MEH-3654, 21/11/2026.)

| Rule | Its home (SoT) | Enforced by |
|---|---|---|
| Reader address is gender-neutral (plural, verbal noun, impersonal) | [ADR-037](./decisions/ADR-037-neutral-reader-address.md), [BRAND.md §9](./BRAND.md) | Partly: `scripts/checks/brand-lexicon-guard.sh` rules `slash-gender`, `feminine-address`. Feminine imperatives are not checked |
| No slash or dot gender forms (`מסכים/ה`, `ספר/י`) | BRAND.md §9, ADR-037 | `brand-lexicon-guard.sh` `slash-gender` |
| CTA / button voice: plural imperative | [ADR-014](./decisions/ADR-014-voice-rules-hebrew-hybrid.md) | Not enforced |
| «בית עסק» / «בעלת עסק», never «יצרן» | BRAND.md §7, ADR-024, §2 below | `brand-lexicon-guard.sh` `yatzran` |
| Not a marketplace; no home-cooking framing; not a periodical | BRAND.md §3 + §7 | `brand-lexicon-guard.sh` `marketplace`, `home-cooking`, `periodical` |
| «קבוצת רכישה» is the feature's name | BRAND.md §7 (MEH-2827) | `brand-lexicon-guard.sh` `group-buy-term` |
| «מאומת / מוצהר», never «מורשה» in consumer copy | BRAND.md §7, ADR-022 | `brand-lexicon-guard.sh` `licensed-term` |
| Say what the site knows, never what the business will do | BRAND.md §7 «דיבור בשם בית העסק», ADR-031 | `frontend/__tests__/CopyHonestyLexicon.test.js` |
| «וואטסאפ» in Hebrew text, Latin only inside a product name | BRAND.md §7 (MEH-2837), §3 below | Not enforced generally (point tests only) |
| One spelling per string: `…`, `״`, no stray trailing `.` | MEH-3462 | `frontend/__tests__/CopyVariantsGuard.test.js` |
| No emoji in copy | BRAND.md §3 Emoji LOCK | `NoEmojiInMessages.test.js`, `NoEmojiInComponents.test.js` |
| Copy lives in `messages/*.json`, not in code | MEH-1687 | `frontend/__tests__/HebrewLiteralRatchet.test.js` (ratchet) |
| Every he key exists in en | MEH-978 | `frontend/__tests__/en-parity-guard.test.js` |
| Which sentence goes where (tagline, descriptor) | BRAND.md §1b, ADR-043, ADR-011 | `adr011-tagline.test.js`, `CanonicalSentenceCopy.test.js` |
| New user-facing copy is approved word for word | `.claude/rules/workflow.md` rule 22 | `scripts/checks/hebrew-copy-skills-guard.sh` (skills line only) |
| «אימייל» vs «מייל» | §3 below | Not enforced. **Open: see §3** |
| Forward arrow `→` vs `←` | §4 below | Not enforced. **Open: see §4** |
| Approved strings and why | [COPY_BANK.md](./COPY_BANK.md) | Record, not a check |

Voice and tone stay in BRAND.md §4–7. This file owns the mechanics.

---

## 1. Reader address — gender-neutral (ADR-037)

> **Corrected 21/11/2026 (MEH-3654).** Until today this section said the
> feminine singular imperative («לחצי», «הוסיפי») was REQUIRED product-wide.
> ADR-037 (04/11/2026) replaced that rule; ADR-014 had already moved buttons to
> the plural in May. Anyone who followed the old table wrote copy the site no
> longer uses.

Every string addressed to the reader, consumer or business owner, is
gender-neutral: UI, narrative, share text, emails and server `detail=`
messages. In order of preference (ADR-037 §Decision):

1. Plural imperative or past tense: «שתפו», «נסו שוב», «הצטרפו».
2. Verbal noun or infinitive: «הורדת הכרטיס», «אפשר להזמין».
3. Impersonal phrasing: «פעם היה צריך לדעת…».
4. Masculine plural as the unmarked form where a pronoun is needed:
   «ברוכים הבאים», «אליכם».

No singular second person either: `שלך`, `לך`, `אותך` and the like are not
used in new copy (ADR-037 amendment, 24/11/2026; until then they stayed as
"unmarked"). Write «המוצרים של העסק» or «אפשר לשמור», or «שלכם» / «לכם» on a
consumer surface when a pronoun is needed. `brand-lexicon-guard.sh` (rule
`singular-address`, MEH-3808) fails new ones. `אלייך` is marked feminine and is
not used. Slash and dot forms are never used (BRAND.md §9).

**Still feminine, by design (ADR-037):** Sapir's own first-person and founder
voice («אנחנו מכירות»); admin screens and admin-directed messages; the badge
«מובילת קהילה»; a named woman («בעלת עסק» for a specific person).

### Verb table — what to write

| Masculine (no) | Feminine (no, except admin) | Write |
|---|---|---|
| לחץ | לחצי | **לחצו** / «יש ללחוץ» |
| הוסף | הוסיפי | **הוסיפו** |
| שמור | שמרי | **שמרו** / «שמירה» |
| ערוך | ערכי | **ערכו** / «עריכה» |
| מחק | מחקי | **מחקו** / «מחיקה» |
| שלח | שלחי | **שלחו** / «שליחה» |
| בחר | בחרי | **בחרו** |
| הזן | הזיני | **הזינו** |
| כתוב | כתבי | **כתבו** |
| מלא | מלאי | **מלאו** |
| צור | צרי | **צרו** |
| עדכן | עדכני | **עדכנו** |
| פתח | פתחי | **פתחו** |
| הצטרף | הצטרפי | **הצטרפו** |

---

## 2. Producer terms — allowed vs forbidden

The brand is a directory of **בתי עסק**, never "producers/manufacturers".

| Forbidden | Replace with |
|---|---|
| יצרן | **בית עסק** (listing) / **בעלי עסק** (people) |
| יצרנית | **בית עסק** (listing) / **בעלת עסק** (a named woman) |
| יצרנים | **בתי עסק** (listings) / **בעלי עסק** (people) |
| יצרניות | **בתי עסק** (listings) / **בעלות עסק** (people) |

### בית עסק (the business) vs בעלת עסק (the owner) — usage distinction

These are **not interchangeable**. Pick by referent:

- **`בית עסק` / `בתי עסק`** = *the business/listing itself* — the entity that
  appears on a card, has a page, a map pin, a profile. Use when the subject is
  the thing being browsed.
  *e.g.* "5 **בתי עסק** חדשים באזור שלכם", "כל **בית עסק** נבחר אישית",
  "← חזרה לדף **בית העסק**".
- **`בעלת עסק` / `בעלות עסק`** = *the person who owns/runs it* — use when the
  subject is the human (registration, account, addressing the owner).
  *e.g.* "סיבה קצרה שתישלח במייל ל**בעלת העסק**", "רישום **בעלת עסק**".

Rule of thumb: if you could replace it with "the listing" → `בית עסק`. If with
"the owner/she" → `בעלת עסק`.

> **Since ADR-037 (04/11/2026):** copy addressed to business owners in general
> uses the plural «בעלי עסקים» or speaks to them directly («העסק שלכם»).
> «בעלת עסק» is for a specific, named woman and for admin copy. ADR-024 §2's
> owner-noun taxonomy is otherwise unchanged.

> Audience-targeting caveat (BRAND.md §85): when a CTA names the audience, do
> **not** enumerate a subset (`"בעלת עסק, חקלאית או מגדלת"` excludes ~75%).
> Use generic `בעלת עסק` / `בית עסק` framings.

---

## 3. Canonical spellings

| Term | Canonical | Status |
|---|---|---|
| WhatsApp (Hebrew) | **`וואטסאפ`** | **LOCKED** (Sapir, 2026-06-13) — `ווטסאפ` is non-canonical |
| WhatsApp (Latin in copy) | TBD — allow vs always Hebraize | **PENDING Sapir** |
| Email | **`מייל`** | **LOCKED** (Sapir, 2026-11-21, MEH-3665) — `אימייל` is non-canonical; `brand-lexicon-guard.sh` rule `email-term` |
| `וואצאפ` / `ווצאפ` (tsadi forms) | **FORBIDDEN** | never use — not currently present, keep it that way |
| Hebrew punctuation | gershayim `״`, geresh `׳`, em-dash `—` | per DESIGN.md |

### LOCKED — WhatsApp (Sapir, 2026-06-13)

Canonical: **`וואטסאפ`**. The variant `ווטסאפ` (11× in `he.json`) and the
tsadi forms `וואצאפ` / `ווצאפ` are **non-canonical** — normalize to `וואטסאפ`
in the follow-up sub-MEH. **Still open:** whether Latin `WhatsApp` inside
Hebrew copy (`he.json:260, 2722`) is allowed or must be Hebraized — separate
Sapir decision, kept PENDING above.

### LOCKED — Email (Sapir, 2026-11-21 — replaces the 2026-06-13 lock)

Canonical: **`מייל`** (`כתובת המייל`, `במייל`, `שלחו מייל`). `אימייל` is
**non-canonical**. Reason: the Israeli-sites research on the MEH-3665 card
found «מייל» the common form in Hebrew interfaces; Sapir approved the call on
21/11. The 2026-06-13 lock said the opposite and is retired; MEH-3665
swept the product to `מייל` and `brand-lexicon-guard.sh` (rule `email-term`)
now fails a new `אימייל` in shipped copy.

---

## 4. RTL directional-arrow rule

**LOCKED (Sapir, 2026-11-21, MEH-3665 — replaces the 2026-06-13 lock):** Hebrew
reads right to left, so «forward» points left. In Hebrew copy **`←`** (U+2190)
is the glyph for forward / continue / next / "leads to" (e.g. `לכל האירועים ←`,
`פרטים טכניים ← אמינות`). **`→`** (U+2192) is used **only** for back /
previous (e.g. `→ חזרה`).

- **carousel / gallery prev/next** arrows (`ImageGallery.jsx`, `Lightbox.jsx`)
  follow the same rule as a pair — never flip one arrow without its partner.
- English copy (`en.json`) is LTR and keeps `→` for forward.

`brand-lexicon-guard.sh` rule `forward-arrow` fails a Hebrew word followed by
`→`. It catches the common shape only: a Latin word or a number right before
the arrow (`ב-WhatsApp → …`, `(30%) → …`), or a quote in gershayim
(`״שלום״ → …`), is not caught.

> The em-dash `—` (U+2014) is the correct connective dash in Hebrew copy (per
> DESIGN.md), distinct from any arrow glyph — leave em-dashes alone.

---

## 5. Brand-positioning terms (cross-ref BRAND.md — do not duplicate)

These are owned by [`docs/BRAND.md`](./BRAND.md); summarized here so copy
authors don't have to context-switch. BRAND.md is authoritative.

| Term | Rule |
|---|---|
| `marketplace` / `פלטפורמת מסחר` | **FORBIDDEN as positioning copy** (BRAND.md §3, DNA violation). The contrastive use "לא בנוי כמו marketplace" (`he.json:2967`) is **pending Sapir** — anti-positioning may be an allowed exception. |
| `מתווך` / `מתווכת` (mediator) | Do **not** position the product as a mediator. The legal disclaimer "אינה מתווכת בעסקאות" (asserting we do NOT mediate) is fine. |
| `אוכל אמיתי` | **Approved** brand value-prop phrasing — keep. |
| `מגזין` (magazine) | Internal/brand-thesis term only, not outbound UI copy (ADR-014). |

---

## 6. How to use this file

- **Before adding/editing any Hebrew UI string:** check §1 (gender), §2
  (producer terms + בית-עסק vs בעלת-עסק), §3 (spelling), §4 (arrows).
- **When `PENDING Sapir` blocks you:** flag it, do not guess — same discipline
  as the MEH-232 audit.
- This file is the copy SoT; `DESIGN.md` micro-copy guidance points here for
  gender/spelling/glyph mechanics. Voice/tone stays in `BRAND.md` §4–7.
