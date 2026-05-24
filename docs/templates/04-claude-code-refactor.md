# 🔧 Template 04 — Claude Code Refactor (v2.0)

לשיפור קוד קיים בלי לשנות פונקציונליות. גרסה 2.0 — אפריל 2026.

---

## 📋 מתי להשתמש

✅ Code smell ידוע (duplication, long function, tangled logic)
✅ Rename module/file with cascading import updates
✅ Extract reusable utility from N copies
✅ Migrate from pattern A to pattern B (e.g., callbacks → async/await)
✅ Modernize old code (legacy patterns → current best practices)

❌ פיצ'ר חדש → 02-claude-code-feature.md
❌ Bug fix שמתחפש ל-refactor → 03-claude-code-bug.md (be honest!)
❌ "While I'm here" cleanups in middle of feature → STOP, separate ticket

---

## 🎯 מודל מומלץ

| סוג refactor | מודל | למה |
|---|---|---|
| Single-file cleanup | 🟢 Sonnet 4.6 | localized, clear scope |
| Cross-file rename / extract | 🟣 Opus 4.7 | dependency tracking |
| Architecture refactor (auth-as-module) | 🟣 Opus 4.7 | strategic, requires deep model |
| Pattern migration (callbacks → async) | 🟢 Sonnet 4.6 | mechanical if pattern clear |
| Performance refactor (N+1 → batched) | 🟣 Opus 4.7 | reasoning about runtime behavior |
| Test-only refactor (pytest → fixtures) | 🟢 Sonnet 4.6 | mechanical |

---

## ⚠️ Critical: Refactor = behavior preservation

ה-rule הזה מקודש:
**אם behavior משתנה — זה לא refactor, זה feature/bugfix.** הפרידי.

לכן: הוכחת behavior preservation = test before + test after = identical.

---

## 🧱 Prompt Structure (Opus 4.7 — multi-file)

```xml
Read .claude/rules/. Read HANDOFF.md.

<role>
Engineer refactoring code on mehamakor.online. Behavior must be preserved.
</role>

<refactor_goal>
[משפט אחד — מה משתנה במבנה, מה לא משתנה בהתנהגות]

דוגמה: "Extract email transport logic from auth.py and reset_password.py into 
shared backend/app/lib/email_transport.py. No functional changes."
</refactor_goal>

<motivation>
[למה עכשיו? איזה pain זה פותר?]
- Code smell: [duplication / long function / tangled / coupling]
- Cost of NOT refactoring: [maintainability / future feature blocked / bug magnet]
</motivation>

<scope>
Files to touch: [explicit list with paths]
Files NOT to touch: [explicit boundary]

Behavior preservation:
- All existing tests must pass without modification
- API surface unchanged (no new params, removed params, renamed endpoints)
- Database schema unchanged
- No new env vars
- No new dependencies
</scope>

<verification_required>
BEFORE refactor:
1. Run full test suite. Paste output. Confirm green.
2. Run `git diff` baseline. Confirm clean working tree.

DURING refactor:
3. Make commits per logical step (extract → re-import → cleanup), not one mega-commit.
4. After each commit — run tests, paste result.

AFTER refactor:
5. Run full test suite. Identical pass/fail to step 1.
6. Show before/after structure (file:line counts, function counts).
7. Confirm: zero behavior change in CHANGELOG note.
</verification_required>

<over_engineering_guard>
- No "while we're here" extras.
- No new abstractions beyond the refactor's stated goal.
- If you spot another smell → flag it in PR description, don't fix it.
- No premature generalization. Extract only what's currently duplicated.
</over_engineering_guard>

<constraints>
- Branch: feature/meh-XX-refactor-[slug] off staging
- One PR per logical refactor step (or one PR with clean commit history)
- Commits readable independently
</constraints>

<acceptance_criteria>
- All existing tests pass — same count, same names
- npm run build green
- pytest green
- No new linter warnings
- PR description: before/after diagram or one-paragraph explanation
- HANDOFF.md updated
</acceptance_criteria>

<confidence_calibration>
- File:line evidence for any "this is duplicated" claim.
- If extract candidate has subtle differences across call sites — STOP, list them, ask.
- "I think this is equivalent" → not good enough. Show me side-by-side.
</confidence_calibration>
```

---

## 🧱 Prompt Structure (Sonnet 4.6 — single-file)

```xml
Read .claude/rules/.

<role>Engineer refactoring [filename] on mehamakor.online.</role>

<refactor_goal>[1 sentence — what changes, what doesn't]</refactor_goal>

<scope>
Single file: [path]
No other files touched.
Behavior preserved.
</scope>

<thinking_guidance>
Before patching:
1. Identify the smell — quote the code.
2. Sketch the after-shape.
3. List risks (what could break).
4. Output plan, wait for "go".
</thinking_guidance>

<acceptance_criteria>
- Existing tests pass (run pytest, paste output)
- New shape is shorter / clearer / less duplicated
- No new dependencies
</acceptance_criteria>

<branch>feature/meh-XX-refactor-[slug] off staging</branch>
```

---

## 📊 דוגמה — Extract email transport (Opus 4.7)

```xml
Read .claude/rules/. Read HANDOFF.md.

<role>Engineer refactoring backend on mehamakor.online.</role>

<refactor_goal>
Extract email send logic (currently duplicated in auth.py, reset_password.py, verify_email.py)
into shared backend/app/lib/email_transport.py. 
Add the base64 Content-Transfer-Encoding workaround in ONE place.
</refactor_goal>

<motivation>
- Duplication: 3 copies of `_send_*_email` with same Resend setup
- Bug magnet: MEH-331 fix (base64 encoding) only applied to one — others may regress
- Future blocker: MEH-103 reviews will need email notifications, would create 4th copy
</motivation>

<scope>
Files to touch:
- backend/app/lib/email_transport.py (NEW)
- backend/app/routers/auth.py (replace inline _send → import from lib)
- backend/app/routers/reset_password.py (same)
- backend/app/routers/verify_email.py (same)

Files NOT to touch:
- email templates themselves (jinja templates stay)
- Resend SDK pinning (no version change)
- Any tests (they should pass unchanged)

Behavior preservation:
- Same headers, same body, same Resend response handling
- Same error logging format (Railway expects "[EMAIL]" prefix)
</scope>

<verification_required>
1. Run `pytest backend/tests/test_auth.py test_reset_password.py test_verify_email.py` — paste output
2. Confirm baseline green
3. Refactor in 3 commits:
   commit 1: add email_transport.py with extracted logic + unit tests
   commit 2: migrate auth.py to use it (test still pass)
   commit 3: migrate reset_password + verify_email
4. After: re-run same test suite, identical results
5. Manual: send a verify-email through preview, check Gmail "Show original" — base64 still applied
</verification_required>

<over_engineering_guard>
- No abstract class hierarchy. One module-level function: `send_email(to, subject, html, **headers)`.
- No retry logic added (separate concern).
- No queue / async refactor (separate ticket).
</over_engineering_guard>

<acceptance_criteria>
- 3 routers now import from lib
- Tests unchanged, all green
- MEH-331 base64 fix applied centrally
- PR description: 3-commit log + before/after line count
- HANDOFF.md: one-paragraph note "consolidated email transport"
</acceptance_criteria>

<branch>feature/meh-XXX-refactor-email-transport off staging</branch>
```

---

## 🚨 Anti-patterns

❌ **Refactor שמכניס bugs.** Behavior changed = not a refactor.

❌ **"While I'm here" extras.** Document, separate ticket.

❌ **Premature generalization.** Extract רק כשיש 3+ duplications באותה צורה.

❌ **No baseline tests.** אם לא רץ pytest לפני → אין לך base להוכיח preservation.

❌ **One mega-commit.** Refactor = sequence of small atomic commits, כל אחד עומד בעצמו.

❌ **לחבר refactor + bugfix.** הפרידי. PR נפרדים.

---

## ✅ Definition of Done

- [ ] Baseline tests recorded (output paste)
- [ ] After-tests identical (paste)
- [ ] Commit history clean and readable
- [ ] Zero behavior changes (verify in PR description)
- [ ] No new deps
- [ ] No new env vars
- [ ] preview URL — manual smoke test of refactored area
- [ ] HANDOFF.md updated

---

## 📚 מקורות

- Anthropic 2026: "Avoid over-engineering. Don't add abstractions not requested."
- Mehamakor MEH-342 retrospective (split CLAUDE.md → rules) — refactor done right
