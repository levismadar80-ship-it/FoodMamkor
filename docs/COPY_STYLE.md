# COPY_STYLE.md — Hebrew UI copy source of truth

> The canonical reference for Hebrew UI copy in Mehamakor: allowed vs forbidden
> terms, the masculine→feminine verb table, canonical spellings, the RTL-arrow
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

## 1. Audience & gender — the core rule

Mehamakor addresses a **feminine "את"** by default (both buyers and business
owners are addressed in the feminine singular). Every UI verb, toast,
placeholder, and aria-label uses the **feminine imperative**. This is not a
per-page choice — it is product-wide, admin panel included.

> Plural / generic framings (`הצטרפו`, `בעלות עסק`) remain acceptable where the
> copy deliberately addresses a group; the rule below targets the **singular
> imperative** drift specifically.

> **CTAs/buttons — defer to [ADR-014](./decisions/ADR-014-voice-rules-hebrew-hybrid.md) (higher in Truth Hierarchy):** functional UI CTAs/buttons use the **plural imperative** (`הוסיפו עסק`, `גלו עסקים`); narrative / brand-"we" surfaces stay **feminine**. ADR-014 is the arbiter for CTA voice — do not re-litigate per-PR.

### Masculine → feminine verb table

| Masculine (FORBIDDEN) | Feminine (REQUIRED) | Gloss |
|---|---|---|
| לחץ | **לחצי** | click / press |
| הוסף | **הוסיפי** | add |
| שמור | **שמרי** | save |
| ערוך | **ערכי** | edit |
| מחק | **מחקי** | delete |
| שלח | **שלחי** | send / submit |
| בחר | **בחרי** | choose / select |
| הזן | **הזיני** | enter / input |
| הקלד | **הקלידי** | type |
| כתוב | **כתבי** | write |
| מלא | **מלאי** | fill |
| צור | **צרי** | create |
| עדכן | **עדכני** | update |
| פתח | **פתחי** | open |
| הצטרף | **הצטרפי** (or plural הצטרפו) | join |

Already-correct siblings exist in the codebase (e.g. `delete_f: "מחקי"`,
`submit: "שלחי לאישור"`) — match those, not the masculine drift.

---

## 2. Producer terms — allowed vs forbidden

The brand is a directory of **בתי עסק**, never "producers/manufacturers".

| Forbidden | Replace with |
|---|---|
| יצרן | בעל עסק → **בעלת עסק** (feminine default) |
| יצרנית | **בעלת עסק** |
| יצרנים | **בתי עסק** (listings) / **בעלי עסק** (people) |
| יצרניות | **בתי עסק** (listings) / **בעלות עסק** (people) |

### בית עסק (the business) vs בעלת עסק (the owner) — usage distinction

These are **not interchangeable**. Pick by referent:

- **`בית עסק` / `בתי עסק`** = *the business/listing itself* — the entity that
  appears on a card, has a page, a map pin, a profile. Use when the subject is
  the thing being browsed.
  *e.g.* "5 **בתי עסק** חדשים בשוק שלך", "כל **בית עסק** נבחר אישית",
  "← חזרה לדף **בית העסק**".
- **`בעלת עסק` / `בעלות עסק`** = *the person who owns/runs it* — use when the
  subject is the human (registration, account, addressing the owner).
  *e.g.* "סיבה קצרה שתישלח במייל ל**בעלת העסק**", "רישום **בעלת עסק**".

Rule of thumb: if you could replace it with "the listing" → `בית עסק`. If with
"the owner/she" → `בעלת עסק`.

> Audience-targeting caveat (BRAND.md §85): when a CTA names the audience, do
> **not** enumerate a subset (`"בעלת עסק, חקלאית או מגדלת"` excludes ~75%).
> Use generic `בעלת עסק` / `בית עסק` framings.

---

## 3. Canonical spellings

| Term | Canonical | Status |
|---|---|---|
| WhatsApp (Hebrew) | **`וואטסאפ`** | **LOCKED** (Sapir, 2026-06-13) — `ווטסאפ` is non-canonical |
| WhatsApp (Latin in copy) | TBD — allow vs always Hebraize | **PENDING Sapir** |
| Email | **`אימייל`** | **LOCKED** (Sapir, 2026-06-13) — standalone `מייל` is non-canonical |
| `וואצאפ` / `ווצאפ` (tsadi forms) | **FORBIDDEN** | never use — not currently present, keep it that way |
| Hebrew punctuation | gershayim `״`, geresh `׳`, em-dash `—` | per DESIGN.md |

### LOCKED — WhatsApp (Sapir, 2026-06-13)

Canonical: **`וואטסאפ`**. The variant `ווטסאפ` (11× in `he.json`) and the
tsadi forms `וואצאפ` / `ווצאפ` are **non-canonical** — normalize to `וואטסאפ`
in the follow-up sub-MEH. **Still open:** whether Latin `WhatsApp` inside
Hebrew copy (`he.json:260, 2722`) is allowed or must be Hebraized — separate
Sapir decision, kept PENDING above.

### LOCKED — Email (Sapir, 2026-06-13)

Canonical: **`אימייל`**. Standalone `מייל` (~51× — `כתובת מייל`, `תיבת המייל`,
`במייל`) is **non-canonical**; normalize to `אימייל` in the follow-up sub-MEH.

---

## 4. RTL directional-arrow rule

**LOCKED (Sapir, 2026-06-13):** in Hebrew copy the canonical directional glyph
is **`→`** (U+2192) — use it for forward / continue / next / general CTAs
(e.g. `הבא →`, `הצטרפי →`). **`←`** (U+2190) is allowed **only** as a
documented exception:

- **back / previous** navigation (e.g. `← הקודם`, `← חזרה`)
- **carousel / gallery prev** arrows (`ImageGallery.jsx`, `Lightbox.jsx`) —
  the prev/next pair stays physically paired.

Everywhere else `←` is **non-canonical**: the 32 forward/CTA `←` strings in
`he.json` are normalize-to-`→` candidates for the follow-up sub-MEH. Paired
gallery controls apply the rule to **both** directions together — never flip
one arrow without its partner.

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
