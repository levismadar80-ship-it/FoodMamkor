# 🔍 Template 05 — Claude.ai Research (v2.0)

למחקר אסטרטגי / תחרותי / עיצובי. גרסה 2.0 — אפריל 2026.

---

## 📋 מתי להשתמש

✅ "איך חברות גדולות פותרות את X?"
✅ Design audit של דף/תהליך
✅ Competitive analysis
✅ Pre-design inspiration gathering
✅ אימות טענות (כמו ה-research הזה!)
✅ החלטה אסטרטגית שצריכה evidence

❌ משימת עיצוב → 01-claude-design.md
❌ משימת קוד → 02-claude-code-feature.md
❌ "תספר לי על X" — that's curiosity, not research

---

## 🎯 מודל מומלץ

**Research = Opus 4.7. Always.**

למה: research דורש GPQA-Diamond level reasoning (PhD-level). Sonnet 4.6 ב-74.1%, Opus 4.7 ב-91.3%+ — פער ניכר. ההבדל **דרמטי** ב-research של עומק.

יוצא מן הכלל: gather-only tasks (10 examples של X, no synthesis) — Sonnet 4.6 בסדר.

---

## 🧱 Prompt Structure

```xml
<role>
Senior researcher. Output drives a decision, not a report.
You understand that bad research wastes 10 hours of wrong work downstream.
</role>

<question>
[ONE specific question, not a topic]

טוב: "Should our hero CTA be text+arrow or filled pill for an editorial Hebrew food directory?"
רע: "Best CTA practices."
</question>

<decision_at_stake>
[What we'll decide based on this output]
- Decision: [specific choice]
- Implementation cost: [hours/days if we get it wrong]
- Reversibility: [easy / medium / hard to undo]
</decision_at_stake>

<context>
- Audience: [who]
- Product stage: [pre-launch / launch / post-launch]
- Constraint: [mobile-first / Hebrew RTL / budget / timeline]
- What we already know: [list of 2-3 facts to avoid re-discovering]
</context>

<method>
1. Search [3-5 specific queries with keywords]
2. Fetch full content from [target sites if known]
3. Analyze 5-10 named-company examples
4. Identify 3 patterns + 2 anti-patterns
5. Make ONE recommendation for our specific context

If a query returns <3 strong examples → state so, don't pad.
</method>

<sources_priority>
Tier 1 (use): Named-company case studies, peer-reviewed papers, primary docs (Anthropic/Google/OpenAI direct), Awwwards winners with brief, design studio retrospectives (Pentagram/Justified/Hassan & Partners).

Tier 2 (use sparingly): Expert blog posts with named author + experience claim.

Tier 3 (skip): Listicles ("10 best X tips"), AI-generated content, generic advice, Medium SEO posts, stock photo sites, anonymous "best practices" blogs.
</sources_priority>

<evidence_standard>
Every claim must cite a named source.
"Companies tend to..." → unacceptable. "Airbnb (2023 redesign), natoora (2024), and Eataly (2022) all use..." → acceptable.

If counter-evidence exists, surface it. Don't cherry-pick.

Quantify when possible (% lift, $X saved, N users) — but flag any stat without primary source.
</evidence_standard>

<output_format>
1. Executive summary (1 sentence, actionable)
   Example: "Use text+arrow CTA (like natoora.com) — outlined pills feel generic for editorial brands."

2. Evidence table:
   | Company | Choice | Why it works (1 line) |
   |---------|--------|----------------------|

3. Top 3 patterns that emerge

4. Top 2 anti-patterns to avoid

5. Recommendation for OUR specific context:
   - What to do
   - Why (link to one pattern above)
   - What to NOT do (link to anti-pattern)
   - Open question / risk (be honest)

6. Word count: <500 unless complexity demands more
</output_format>

<confidence_calibration>
- If <3 strong examples found → state so, recommend further research before deciding
- If sources contradict → present both sides, name the disagreement
- If you can't recommend confidently → say "I recommend X with low confidence because..."
- "It depends" without a recommendation = failure mode. Always commit.
</confidence_calibration>

<forbidden>
✗ Hedging every statement
✗ "Best practices" without named source
✗ Stat-dropping without primary source link
✗ Reports >500 words when 200 would do
✗ Lists with 10+ items — pick top 3
✗ "Take this with a grain of salt" — if you know, commit; if you don't, say so
</forbidden>
```

---

## 📊 דוגמה — Should Mehamakor have a sticky bottom CTA on mobile?

```xml
<role>Senior product researcher. Output drives a UX decision.</role>

<question>
Should mehamakor.online ProducerDetail page have a sticky bottom CTA bar on mobile,
or should the WhatsApp CTA scroll naturally with content?
</question>

<decision_at_stake>
Decision: Implement sticky bottom CTA OR keep inline.
Cost if wrong: 4-8 hours implementation + revert + redesign.
Reversibility: Easy (CSS toggle).
</decision_at_stake>

<context>
- Audience: Israeli women 28-45, mobile-heavy, WhatsApp-native
- Stage: Pre-launch, optimizing conversion before traffic
- Constraint: RTL Hebrew, mobile-first
- Already know: Producer trust signals matter most. Page is content-heavy (story + photos + reviews).
- Already know: WhatsApp click is the primary success metric.
</context>

<method>
1. Search: "sticky bottom CTA mobile conversion case study"
2. Search: "editorial commerce mobile CTA placement"
3. Search: "WhatsApp business mobile CTA pattern"
4. Fetch: 5-7 named companies' mobile pages — natoora, Eataly, Goop, NYT Cooking, Smitten Kitchen, Wolt restaurant pages
5. Patterns + anti-patterns
6. Recommendation
</method>

<sources_priority>
Tier 1: Mobile UX case studies (Baymard, NN/g), conversion case studies (Brian Massey, ConversionXL), named-brand redesigns.
Skip: Generic "10 tips for sticky CTAs" listicles.
</sources_priority>

<output_format>
[as standard]
Plus: One mockup recommendation (text description, where exactly the sticky element sits + when it appears).
</output_format>

<confidence_calibration>
Hebrew RTL mobile patterns may have less data — flag if true.
WhatsApp-native audience is unusual — note if Western patterns don't translate.
</confidence_calibration>
```

---

## 🚨 Anti-patterns

❌ **שאלה כללית** ("best practices for X") — תהפוך לפח של דעות.

❌ **No decision linkage.** Research without "what will we do with this?" = report theater.

❌ **Tier 3 sources dressed as Tier 1.** "Forbes article" = often Tier 3 SEO content.

❌ **Padding to look thorough.** 5 mediocre examples ≠ 1 strong case study.

❌ **No counter-evidence.** Cherry-picking confirms bias.

❌ **"It depends" cop-out.** Always commit to a recommendation, even if low-confidence.

---

## ✅ Definition of Done (Research)

- [ ] One actionable recommendation
- [ ] 3-5 named-company examples
- [ ] Patterns + anti-patterns explicit
- [ ] Counter-evidence acknowledged
- [ ] Confidence level stated
- [ ] Word count appropriate (<500 default)
- [ ] Decision-linked: "If you do X, expect Y"

---

## 📚 מקורות

- Anthropic 2026: "Be specific about success criteria"
- This very research (rounds 1+2) is template 05 dogfooding
