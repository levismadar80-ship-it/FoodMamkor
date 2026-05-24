# 🎨 Template 01 — Claude Design (v2.0)

לעיצוב חדש: דפים, קומפוננטות, לוגו, אייקונים. **גרסה 2.0** — מבוססת Anthropic Opus 4.7 design defaults + 2026 best practices.

---

## 📋 מתי להשתמש

✅ עיצוב דף חדש או redesign
✅ קומפוננטה חדשה (ProducerCard, HeroSearch, וכו')
✅ לוגו, אייקונים, Visual Identity
✅ Animation/Interaction design

❌ קוד ללא עיצוב → 02-claude-code-feature.md
❌ תיקון באג ויזואלי קטן → 03-claude-code-bug.md

---

## 🎯 מודל מומלץ

**Design = always Opus 4.7.** ללא יוצא מן הכלל.

למה: Anthropic 2026 רשמי — Opus 4.7 is "more tasteful and creative when completing professional tasks, producing higher-quality interfaces, slides, and docs."

Sonnet 4.6 = פונקציונלי, אבל אסתטיקה fades to "AI slop" patterns מהר יותר.

---

## ⚠️ Critical: Opus 4.7 design defaults

Opus 4.7 יש לו **default house style חזק**:
- Cream/off-white backgrounds (~#F4F1EA)
- Serif display (Georgia/Fraunces/Playfair)
- Italic accents
- Terracotta/amber accent

זה **בדיוק ההפך** ממה שמהמקור צריך לפעמים. הפתרון: lock the brand explicitly + force option proposals.

---

## 🧱 Prompt Structure (Opus 4.7)

```xml
<role>
Senior product designer with strong editorial sensibility, mobile-first.
You understand: trust is built in 3 seconds on mobile.
</role>

<task>
Design [WHAT] for mehamakor.online — Israeli local food directory.
[Context: redesign / new / iteration]

Current issues (if redesign):
- [בעיה 1 ספציפית]
- [בעיה 2 ספציפית]
- [בעיה 3 ספציפית]

Scope: [חד וברור — מה כן, מה לא]
</task>

<brand_lock>
LOCKED — do not deviate without explicit approval:

Colors:
- primary: #2e6853 (deep green)
- background: #F5F0E8 (warm cream — NOT default Opus cream)
- accent gold: #8B6914
- text dark: #1a1a1a
- text muted: #6b6b6b

Typography:
- Hebrew headlines: Frank Ruhl Libre 900
- Body: DM Sans
- Italic accents: Cormorant
- DO NOT use Inter, Roboto, Arial, Georgia, Fraunces (all default Opus picks)

Voice: Hebrew RTL, feminine ("נקבה"). 
"בית עסק" — never "יצרן".
"המהמקור — הבית הראשון של העסק שלך."

Logo: [current state — open after Olive branch retired Apr 2026]
</brand_lock>

<audience>
Israeli women 28-45, mothers + couples.
Mobile-heavy, WhatsApp-native.
Skeptical of advertising — scan for authenticity in 3 seconds.
</audience>

<thesis>
Mehamakor is a magazine, not a marketplace.
Every design decision serves: warmth, belonging, story.
"בית" (warmth/belonging), "סיפור" (magazine thesis).
</thesis>

<options_first>
Before building: propose 4 distinct visual directions tailored to this brief.
For each, output:
- bg hex / accent hex / typeface — one-line rationale
- One sentence: who would this design feel "right" for?
- One sentence: what tradeoff does it make?

Then ask me to pick one. Implement only the chosen direction.
</options_first>

<inspiration_sources>
PRIORITIZE:
- natoora.com (editorial commerce, restraint)
- Kinfolk.com (typography, whitespace, magazine feel)
- Airbnb listing pages 2023+ (trust signals, mobile patterns)
- Smitten Kitchen (warmth + utility)

AVOID:
- Generic SaaS dashboards
- Marketplace patterns (Etsy/Wolt aesthetics — that's the trap)
- AI-generated-looking sites (purple gradients, Inter font, glass morphism)
</inspiration_sources>

<success_criteria>
- A user feels [emotion] within 3 seconds of landing
- The two primary actions are brainlessly easy: [action 1, action 2]
- Awwwards reviewer would say: "[specific compliment]"
- Mobile-first: design starts with 375px width and grows up
- Real Hebrew copy in mockups, not Lorem Ipsum
</success_criteria>

<no_ai_slop>
NEVER use:
- Inter / Roboto / system-ui / Arial fonts
- Purple gradients on white/dark backgrounds
- Cookie-cutter card layouts (image-top-text-bottom-button)
- Default shadcn aesthetic (rounded corners + neutral grays)
- Lucide icons used as-is without context
</no_ai_slop>

<deliverables>
1. 4 visual direction options (text + 1 hex palette each)
2. After approval: high-fidelity mockup of [specific screen]
3. Mobile + desktop views
4. Real Hebrew copy
5. List of 3 patterns this design uses (cite sources)
6. List of 2 anti-patterns avoided
</deliverables>
```

---

## 📊 דוגמה מלאה — MEH-76 ProducerDetail Redesign

```xml
<role>
Senior product designer, editorial sensibility, mobile-first.
</role>

<task>
Redesign /producers/[slug] page on mehamakor.online.

Current issues:
- "Card stacking" feels like a marketplace listing, not a magazine feature
- WhatsApp CTA buried below fold
- No clear story arc — info is just listed flat
- Trust signals weak (no verification badge prominence)

Scope: full page redesign, mobile-first.
NOT in scope: backend changes, new endpoints.
</task>

<brand_lock>
[as above — primary #2e6853, bg #F5F0E8, etc.]
</brand_lock>

<page_must_include>
Above fold (mobile):
- Hero image (Cloudinary, 16:9 or 4:5)
- Producer name + verified badge
- One-sentence positioning ("הסיפור של [שם] ב-15 מילה")
- Primary CTA: WhatsApp (sticky after scroll)

Below fold:
- Description (3-5 paragraphs, magazine prose)
- Specialty/categories (chips, not bullet list)
- Mini-map (location, neighborhood)
- Hours (if provided)
- Reviews (when MEH-103 ships — placeholder for now)
- Similar producers (3 cards)
- Share button
</page_must_include>

<options_first>
4 directions, varying on:
1. Density (sparse magazine vs info-rich card)
2. Image treatment (full-bleed vs framed vs collage)
3. Type hierarchy (italic-heavy editorial vs all-sans modern)
4. Trust signal style (badge vs sentence vs both)
</options_first>

<success_criteria>
- 3-second test: visitor knows WHO this is + WHY trust them
- WhatsApp CTA reachable in <1 thumb-distance
- Story arc: hero → value → social proof → action
- Reviewer at A24-style food magazine would approve
</success_criteria>

<deliverables>
Per option (4 total): Figma frame OR HTML/Tailwind mockup, mobile-first.
After approval: full mockup + responsive notes.
Real Hebrew copy from existing producers in DB.
</deliverables>
```

---

## 🚨 Anti-patterns

❌ **לתת ל-Opus 4.7 לבחור צבעים בעצמו.** Default = cream/terracotta. נעלי את הbrand.

❌ **לדלג על options-first.** מקבלים direction אחד שיכול להיות לא נכון, וצריך iteration. Options-first חוסך זמן.

❌ **"תעצב יפה"** — Anthropic 2026 רשמי: tells what to do, not "make it good".

❌ **Inspiration sources כלליות.** "Awwwards-style" → לא ברור. "natoora.com header treatment" → ברור.

❌ **לבקש Hebrew copy ב-Lorem Ipsum.** Opus 4.7 יודע עברית, ה-copy האמיתי משפיע על העיצוב (RTL, ניקוד, אורך).

❌ **לבקש logo + page באותו prompt.** Logo = brand level (חודשים). Page = product level (שעות). הפרידי.

---

## ✅ Definition of Done (Design)

- [ ] 4 options presented + 1 chosen
- [ ] Mobile + desktop mockups
- [ ] Real Hebrew copy
- [ ] Brand lock respected (verify hex values match)
- [ ] No "AI slop" patterns (Inter, purple gradients, etc.)
- [ ] Inspiration sources cited
- [ ] Mobile gestures considered (swipe, sticky CTA, scroll triggers)
- [ ] Tradeoffs documented

---

## 📚 מקורות

- Anthropic Opus 4.7 design behavior section (Apr 2026)
- Mehamakor brand strategy memo
- natoora.com / Kinfolk / Airbnb 2023+ pattern library
