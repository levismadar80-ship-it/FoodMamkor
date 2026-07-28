# Mehamakor — Brand

**Single source of truth for brand narrative and voice.**
**Last reviewed:** 2026-05-23 · **Format:** one-page brand summary (metabrand.digital / zyner.io pattern, pre-launch solo)

> This file holds the **brand narrative** — positioning, voice, anti-patterns, inspiration. For design **tokens** (colors, fonts, spacing, components), see `docs/DESIGN.md`. For permanent **decisions** locking specific elements, see `docs/decisions/ADR-NNN-*.md`. Repository apex SoT is `docs/CONTEXT.md`.

---

## 1 · Positioning

**Mehamakor is a magazine, not a marketplace.** It is a Hebrew-RTL editorial directory for licensed Israeli local food businesses, positioned against the marketplace category that dominates Israeli food discovery (Wolt, 10bis, Cherry, Yad2 food).

The opposing axes:

| Marketplace | Mehamakor |
|---|---|
| Optimize for transaction | Optimize for discovery + trust |
| Take rate / GMV / conversion | Story, craft, origin |
| Auto-onboard for scale | Manual approval, every business |
| Consumer = wallet | Consumer = reader |
| Producer = supply | Producer = subject of editorial |

This is the DNA. Every product decision passes through "does this push toward magazine or marketplace?" If the answer is marketplace, STOP and ask.

## 2 · Tagline (locked — see ADR-011)

> **מהמקור — הבית הראשון של העסק שלך. המקום שבו הסיפור מתחיל.**

Two clauses, distinct functions:

- **Clause 1** (`מהמקור — הבית הראשון של העסק שלך`) — promise to producers: this is your home, not your channel.
- **Clause 2** (`המקום שבו הסיפור מתחיל`) — promise to readers: curated origin, not an aggregator.

Surfaces may use clause 1 alone where space forbids the full version (mobile meta description, OG card). Clause 2 must never appear alone — it loses its referent. Modification requires a new ADR superseding ADR-011.

### Tagline vs hero subtitle — different decisions

The **tagline** appears in: footer brand line, meta description, OpenGraph card, `/about` narrative. The **hero subtitle** is a separate decision (MEH-620 winner copy from PR #690, 2026-05-16): `"ישר מהמקור אלייך. עסקים שכבר בדקנו בשבילך."` — punchy CTA-supporting copy, not the brand tagline. Both are canonical; they serve different surfaces. Don't conflate.

## 3 · Brand LOCKs (cannot change without formal discussion)

### Strategic LOCKs (full set in `docs/CONTEXT.md` §2)

- Magazine, not marketplace
- הדף הבסיסי חינם לעולם. אין עמלות עסקה. פרימיום = כלים בלבד, לעולם לא משפיע על דירוג/חשיפה גם עם סימון — see docs/decisions/ADR-027-revenue-model.md + ADR-030-premium-tools-not-ranking.md
- Manual approval for every business
- Two-tier licensing (ADR-022) — מאומת / מוצהר. Badge free forever. Unlicensed food production stays out; no home cooks (unchanged)
- No `"שכנות מבשלות מהבית"` / `"אוכל ביתי"` / `"מהמטבח של השכן"` in marketing
- No `"יצרן"` / `"יצרנית"` in UI — מונחים per ADR-024: `"בית עסק"` (ישות) · `"בעלי עסקים"` (גנרי) · `"בעלת/בעל עסק"` (ספציפיים)
- No `"marketplace"` / `"פלטפורמת מסחר"` copy anywhere
- No `"מגזין"` word in UI (only in `/about` narrative)

### Visual LOCKs (full token set in `docs/DESIGN.md`)

- Primary green `#2e6853` · cream background `#F5F0E8` (warm cream — NEVER pure white) · text `#1C1A17`
- Frank Ruhl Libre 900 for Hebrew headlines · DM Sans for body
- No pure white `#ffffff` anywhere
- No gradient orbs, blurred backgrounds, glassmorphism (signals "app", opposite of "magazine")
- No shadow lift on hover (SaaS pattern)
- No red heart fill on save/like — green or gold only (Ive council guidance)
- No time-stamped framing (`"ISSUE 01"`, `"SPRING 2026"`) — we don't publish issues

### Iconography LOCK (see ADR-013)

- **Tier 1** (functional UI): `@phosphor-icons/react` exclusively. Lucide FORBIDDEN.
- **Tier 2** (category glyphs): hand-drawn SVG (MEH-683 owns, MEH-666 prerequisite)
- **Tier 3** (editorial illustrations): post-launch only

### Emoji LOCK v2 (MEH-657, surface-scoped)

- ❌ UI / ICU / brand-guidance / editorial surfaces → 0 emojis
- ✅ WhatsApp outbound + share strings + email body → emojis allowed (warmth + Meta template cost)

## 4 · Voice (full rules in ADR-014, refined by ADR-024)

Hybrid Hebrew policy — surface determines grammatical form:

- **UI strings** (buttons, loading, errors, hero H1 + subtitle): gerund (`"טעינה"`) or plural (`"גלו"`, `"הוסיפו"`)
- **Brand voice** (`/about` narrative, founder letter, below-the-fold editorial): feminine (`"גלי"`, `"צרי"`) allowed
- **Forbidden across all surfaces:** slash form (`"טוענ/ת"`), pure masculine (`"המשתמש שלך"`), `"יצרן"`/`"יצרנית"`
- **Surface-function taxonomy (ADR-024):** the split is by surface-function, not audience — functional UI → plural, brand narrative + warmth → feminine. הבהרה: "pure masculine" forbidden = פנייה זכרית לקוראת (`"המשתמש שלך"`), NOT the owner noun (`"בעלי עסקים"` is permitted — סתמי/unmarked)

### Two voice rules from PR #682 precedent

**Audience targeting — no partial category lists.** When a CTA names the audience, do not enumerate a subset (`"בעלת עסק, חקלאית או מגדלת"` excludes ~75% of producers). Use generic framings (`"בעלי עסקים"` / `"בית עסק"` / `"עסק שמייצר אוכל אמיתי"`) and outcome verbs (`"מה שהיא מציעה"`).

**`"מגזין"` — internal use only.** The word describes the editorial thesis internally but must not appear in UI copy. Surface the magazine-tier voice through *what* the copy says (curation signal, producer-page format, founder accountability, story-led framing), not by *labeling* the product as a magazine.

## 5 · Inspiration (curated, single direction)

Editorial premium — Kinfolk lineage, not marketplace lineage:

- **[Kinfolk](https://www.kinfolk.com)** — typographic restraint, warm cream backgrounds, generous whitespace, magazine-page rhythm.
- **[Natoora](https://www.natoora.com)** — producer-first storytelling, full-bleed produce photography, structured product taxonomy without flattening character.
- **[Cherry Bombe](https://cherrybombe.com)** — women-led food editorial, headline typography, founder accountability.
- **[The Infatuation](https://www.theinfatuation.com)** — review-as-narrative, voice-driven recommendations, anti-Yelp positioning.
- **[Smitten Kitchen](https://smittenkitchen.com)** — solo-founder editorial, accumulated trust through consistency.

**Retired** (do not reference, do not use as design north star):

- `gardensweet.com` — was a `docs/DESIGN.md` pre-reset reference; the 4-session design reset moved Mehamakor to editorial premium. Mixing the two directions produces Claude Code drift.

## 6 · Design patterns (canonical home pointers)

Design **patterns** (component-level decisions like navbar shape, hero layout, card composition) don't fit cleanly into ADRs (too granular) or DESIGN.md (which is tokens, not patterns). Their canonical home is the Linear issue that introduced them. This section maintains the pointer index:

| Pattern | Owning Linear issue | Status |
|---|---|---|
| Floating Pill Navbar | MEH-655 | Done 2026-05-22 |
| Hero direction hierarchy (A canonical, B campaign-only) | ADR-018 + MEH-656 (canceled, content absorbed) | LOCKED |
| ProducerCard state token compliance (opacity-on-cream + --fg-muted) | ADR-019 + MEH-656 (canceled, content absorbed) | LOCKED |
| Logo lockup (5-pomegranate-seed) | MEH-637 | Done 2026-05-22 (+ MEH-664 DoD fix) |
| Category glyph system | MEH-683 (blocked-by MEH-666) | Backlog |

**Rule:** before opening a new design pattern, search this index. If the pattern overlaps with a Done entry, extend the existing one rather than starting parallel work.

## 7 · Anti-patterns (forbidden phrasings, beyond LOCKs)

Phrasings that survived to production once and must be caught in review:

- `"home cooks"` (English boilerplate) — caught in `06-press-quotes-bank.md` duplicate, deleted in Phase ζ.
- `"שכנות מבשלות"` / `"מהמטבח של השכן"` / `"אוכל ביתי"` — illegal-in-Israel framing, brand LOCK violation.
- `"יצרן/יצרנית"` — use `"בית עסק"` / `"בעלי עסקים"` (ADR-024). **חריג (MEH-1264, Option A):** `"יצרן"` אסור בממשק ובשיווק, למעט כחלק משם רישיון רשמי (`"רישיון יצרן"`, `"מספר רישיון יצרן"`) — דיוק משפטי, lawyer brief §5.3. הצ'יפ הצרכני `"רישיון יצרן"` נשאר AS-IS (שם הרישיון הרשמי של משרד הבריאות).
- `"marketplace"` / `"פלטפורמת מסחר"` — DNA violation.
- `"שוק"` as a discovery/sort/nav label (e.g. the old `"חדש בשוק"` sort option) — frames Mehamakor as a trade venue, DNA violation (MEH-1218). The sort label is now `"הצטרפו לאחרונה"`. **Not** forbidden: the named `"שוק שישי"` feature (MEH-50) and the event-type category `"שוק"` (a kind of listed event), which describe a real-world market, not the platform.
- `"ISSUE 01"` / `"SPRING 2026"` / time-stamped editorial framing — Mehamakor isn't a periodical.
- Stock illustrations (iStock, Freepik) — kill the "curated" signal.
- Phosphor duotone weight — too playful for editorial; regular weight only.
- `"מורשה"` / `"מורשים"` in consumer copy — regulatory term consumers don't parse; tier language is מאומת / מוצהר only (ADR-022). Legal surfaces (terms, declaration text) may use it.

### דיבור בשם בית העסק

**הכלל בשורה אחת:** אומרים מה האתר יודע. לא מה בית העסק יעשה.

**הבעיה:** במצב "הזמנות סגורות" בעמוד בית עסק הופיעה השורה "אפשר לשלוח הודעה גם עכשיו — היא תמתין לבית העסק עד שההזמנות ייפתחו". השורה תוקנה שלוש פעמים (MEH-1546 → MEH-1600 → MEH-1649) ונשארה לא נכונה, כי הבעיה איננה ניסוח: כפתור הוואטסאפ הוא קישור wa.me. ההודעה עוברת מהטלפון של הלקוחה ישירות לבית העסק ואינה נוגעת בשרתים שלנו. זו לא מגבלה טכנית שנתקן — זו החלטת DNA (אסור צ'אט פנימי). לעולם לא נדע אם ההודעה נקראה, נענתה, או נעלמה. כל משפט שמתאר את גורלה הוא ניחוש שאנחנו מציגים כעובדה.

❌ אסור — טענה על התנהגות, זמינות או כוונה של בית העסק:

- `"היא תמתין לבית העסק עד ש..."`
- `"תיענה כשההזמנות ייפתחו"`
- `"בית העסק בדרך כלל חוזר תוך X שעות"`
- `"אפשר לפנות בכל שעה"`
- כל ניסוח שהנושא שלו הוא בית העסק והפועל שלו בעתיד

✅ מותר — עובדה שהאתר מחזיק:

- `"מקבלים הזמנות: ראשון–חמישי 09:00–14:00"` (מתוך `order_window`)
- `"מקבלים הזמנות שוב ביום ג' 09:00"`
- `"משלוח ביום שלישי"`
- שתיקה. אם אין מה להגיד ביושר — הכפתור עומד בפני עצמו.

✅ מותר גם — טענה שבעלת העסק כתבה בעצמה, בגוף ראשון ומיוחסת לה. (לא קיים היום. אם ייבנה — הניסוח שלה, לא שלנו.)

**מבחן מהיר:** מי הנושא של המשפט? אם זה בית העסק — עצרי. אם זה האתר, החלון, או המשלוח — מותר.

**תקדים חיצוני:** Google סגרה את הצ'אט ב-Google Business Profile ביולי 2024 במקום להחזיק ערוץ שאינה יכולה לעמוד מאחוריו. Yelp מציגה "סגור"/"פתוח" ליד השעות ולא יותר. Etsy שולחת auto-reply — אבל מהחשבון של המוכרת ובניסוח שלה.

**הערה לקוד:** האכיפה מתוכננת כ-lexicon check ב-CI (MEH-1652, חצי ב').

**ADR מגבה:** [ADR-031](./decisions/ADR-031-outbound-contact-unobservable.md) — הערוץ היוצא בלתי-נצפה, ומכאן מגבלת הקופי ושער ה-lexicon.

## 8 · How brand decisions are recorded

The brand record is split across three document types:

| What | Where |
|---|---|
| Narrative summary (this file) | `docs/BRAND.md` |
| Permanent locked decisions | `docs/decisions/ADR-NNN-*.md` (e.g. tagline = ADR-011, voice = ADR-014, icons = ADR-013) |
| Token specifications | `docs/DESIGN.md` |
| UI copy strings | `docs/COPY_BANK.md` |

A new brand decision lands as an ADR first, then this file is updated to reference it. Edits to this file without a backing ADR are not permitted — that's how brand drift starts.

---

*This is the canonical brand narrative. When BRAND.md and an ADR disagree, the ADR wins (per Truth Hierarchy in `docs/CONTEXT.md` §3). When BRAND.md and DESIGN.md disagree on a token, DESIGN.md wins. When BRAND.md and `MEH-124-v4-content-sync.md` (legacy, slated for archive) disagree, this file wins.*
