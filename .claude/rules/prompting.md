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
