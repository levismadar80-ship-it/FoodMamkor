# Prompting rules

How to write prompts and specs for Claude Code in this repo. Always-load —
applies to every session.

---

## Prompt compression (Caveman style)

Specs → keywords + values only, no filler words. Reasoning / context →
full sentences ok. Apply to all future prompts in this repo.

- Good: `Thumb RIGHT 88px (72px <1180). Cloudinary. Placeholder #EAF3DE.`
- Bad: `The thumbnail should be positioned on the right side at 88 pixels wide.`
- Good: `Trust strip MAX 2. if verified → ✓+rating. if not → rating only. Skip response_time.`
- Bad: `The trust strip should show a maximum of two items. If the producer is verified, show the checkmark and rating.`

This rule corresponds to workflow rule 15. The pointer in
[workflow.md](./workflow.md) keeps the rule numbered for cross-reference;
the body lives here.

---

## Templates

לפני מענה על בקשה: זהי איזה template מתאים, קראי אותו, בני תשובה לפיו.

- 00-model-selection-guide.md — איזה מודל לבחור (Sonnet vs Opus)
- 01-claude-design.md — עיצוב (דפים, קומפוננטות, לוגו)
- 02-claude-code-feature.md — פיצ'ר חדש
- 03-claude-code-bug.md — תיקון באג
- 04-claude-code-refactor.md — שיפור קוד קיים
- 05-claude-research.md — מחקר אסטרטגי
- 06-linear-issue.md — משימה מלאה ב-Linear (v2.1 — XML structure)
- 07-linear-quick.md — משימה קטנה (<1 שעה)
- 08-linear-issue-examples.md — 10 דוגמאות מהbacklog

כלל: אם סוג המשימה לא ברור — שאלי לפני שאת בונה.
