# `check-bash-safety.sh` — patch for three holes in the Bash layer (MEH-1500 Phase C)

> **הבלוקים כאן מיועדים לספיר להחלה ידנית.** `.claude/hooks/**` הוא CC-deny
> (`Edit(.claude/hooks/**)` ב-`.claude/settings.json`) — CC כותבת את התיקון
> בקובץ `.md` הזה בלבד ואינה נוגעת ב-hook. אומת ב-probe לא-מוטטיבי 28/07:
> `Edit` על `check-bash-safety.sh` מחזיר *"File is in a directory that is
> denied by your permission settings."*
>
> ⚠️ **הערה שראוי שתיקרא לפני ההחלה:** ל-CC **הייתה** דרך לעקוף — אין ערך
> `Write(.claude/hooks/**)` ב-deny (זו שורה 3 בבלוק ההדבקה של PR #2384), ולכן
> `Write()` על הקובץ הזה ככל הנראה היה מצליח. CC לא ניסתה, ולא בדקה, כי בדיקה
> **היא** הביצוע. החור חי, ומה שמנע אותו כאן הוא שיקול דעת בלבד — לא מנגנון.
> זו הסיבה ש-Phase B קיים.

---

## מה אומת בהרצה, ומה נשאר קריאת-מקור

| ממצא | איך אומת | סטטוס |
|---|---|---|
| **C2** — דילוג ה-`git` בולע את כל ה-hook | **הרצה**, עם בקרה תואמת | ✅ מאושש |
| **C1** — אפס כיסוי להפניית פלט | **הרצה** על נתיב **לא**-מוגן | ✅ מאושש |
| **C3** — fail-open על `jq` חסר | **קריאת מקור בלבד** (`jq` קיים בקונטיינר: `/usr/bin/jq`) | ⚠️ לא נבדק התנהגותית |

### C2 — הזוג המפריד (verbatim)

```
$ echo "DROP TABLE probe"
Blocked: DROP TABLE
DB schema changes → use Alembic migrations per docs/MIGRATIONS.md …

$ git --version && echo "DROP TABLE probe"
git version 2.43.0
DROP TABLE probe
```

אותה מחרוזת DDL בדיוק. עם תחילית `git ` — ה-hook החזיר `exit 0` בשורה 22 לפני
כל בדיקה. **בלי הבקרה הראשונה זו לא ראיה** — היא מה שמוכיח שה-hook בכלל עובד.

### C1

`echo probe > <נתיב לא-מוגן>` → `exit 0`, הקובץ נכתב. **לא נבדק נתיב מוגן** —
בדיקה כזאת היא כתיבה.

### יישוב הסתירה של MEH-514 — עם file:line

* `.claude/settings.json:284` — `"Bash(git reset --hard:*)"` **קיים ב-deny**.
* `.claude/hooks/check-bash-safety.sh:22-24` — דילוג ה-`git` **קודם** לכל בדיקה.

**מסקנה: `git reset --hard` נחסם ע"י ערך ה-deny, לא ע"י ה-hook.** ה-hook לעולם
לא רואה אותו. `docs/EXECUTION_PLAN.md:216` ניסח את MEH-514 כ*"הוספה ל-allowlist
של bash-safety-hook"* — ייחוס לשכבה הלא נכונה. השורה מתוקנת ב-PR הזה.

**ושאלת ההמשך נבדקה:** דפוסי `Bash(...)` ב-deny **כן שורדים שרשור** —

```
echo hi && echo bye        → allowed   (בקרה: שרשור כשלעצמו אינו נחסם)
rm --version               → denied
echo hi && rm --version    → denied
```

כלומר L2 תופס בתוך פקודה משורשרת, בעוד L3 לא. שכבת ה-deny תקינה בנקודה הזאת.

---

## הפאץ' — החלף את `.claude/hooks/check-bash-safety.sh` בשלמותו

**הסקריפט הזה הורץ.** 18/18 ב-self-test שלמטה. אל תדביקי גרסה שלא הורצה.

```bash
#!/bin/bash
# Bash safety guard (PreToolUse: Bash)
# Blocks dangerous DB DDL, destructive filesystem commands, and writes to the
# protected paths that permissions.deny already closes to Edit().
# Exit 2 = block. Exit 0 = allow.
# Last updated: 2026-07-28 (MEH-1500 Phase C: segment-aware git skip, fail-closed
#   on missing jq, write-redirection coverage; MEH-461 tighten rm -rf regex;
#   MEH-408 production-safety deny-list extension)

# MEH-1500 C3 — FAIL CLOSED on missing jq.
# Was `exit 0`. Every sibling hook fails closed, and check-artifact-location.sh's
# header called this one out by name as the weak link. On Windows/MINGW, where jq
# is exactly what may be absent, fail-open silently disabled this entire layer.
# COST, stated deliberately: without jq every Bash call is blocked, not degraded.
# That is the intended friction — an unenforced safety layer that looks enforced
# is worse than one that stops you and says why.
if ! command -v jq >/dev/null 2>&1; then
  echo "check-bash-safety.sh: jq not found — BLOCKING (fail-closed, MEH-1500)." >&2
  echo "Install jq: pacman -S jq (Git Bash) or https://jqlang.github.io/jq/download/" >&2
  exit 2
fi

COMMAND=$(cat | jq -r '.tool_input.command // ""')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# MEH-1500 C2 — the git exemption applies to a git INVOCATION, not to any command
# that merely STARTS with git.
#
# Was: `grep -iqE '^[[:space:]]*git[[:space:]]' && exit 0` — which returned exit 0
# for the WHOLE command before a single pattern ran. Verified behaviourally 28/07:
#   echo "DROP TABLE probe"                  -> blocked (exit 2)
#   git --version && echo "DROP TABLE probe" -> PRINTED, hook never ran
# Same string, opposite outcome. Not an attack scenario — an accident scenario:
# `git status && rm -rf ~` was exempt.
#
# The original justification stays correct and stays honoured: git cannot execute
# its own arguments as shell, so `git commit -m "DROP TABLE users"` must still
# pass. It does — that segment is a git invocation and is skipped; no other
# segment exists.
#
# HEURISTIC LIMIT, stated: a separator inside a quoted string splits too, so a
# commit message containing `;` or `&&` yields extra segments. That errs toward
# MORE scanning, never less, and matches the heuristic level this file already
# documents for the DELETE FROM check.
SCAN=""
# `|| [ -n "$seg" ]` is load-bearing: read returns non-zero on a final line with
# no trailing newline, and WITHOUT this the last segment is silently dropped.
# A command with no separators at all is one single final segment, so the whole
# scan came back empty and every pattern check was skipped — the hook allowed
# everything while looking correct. Caught by the self-test, which is the reason
# it exists.
while IFS= read -r seg || [ -n "$seg" ]; do
  seg="${seg#"${seg%%[![:space:]]*}"}"      # ltrim
  [ -z "$seg" ] && continue
  if echo "$seg" | grep -iqE '^git[[:space:]]'; then
    continue                                 # git invocation — exempt, as before
  fi
  SCAN="${SCAN}${seg}"$'\n'
done < <(printf '%s\n' "$COMMAND" | sed -e 's/&&/\n/g' -e 's/||/\n/g' -e 's/;/\n/g' -e 's/|/\n/g' -e 's/&/\n/g')

# Every segment was a git invocation — nothing left to scan.
if [ -z "$SCAN" ]; then
  exit 0
fi

# Check blocked patterns (case-insensitive) against the NON-git segments only.
check_pattern() {
  local pattern="$1"
  local label="$2"
  local guidance="$3"
  if echo "$SCAN" | grep -iEq "$pattern"; then
    echo "Blocked: ${label}" >&2
    echo "${guidance}" >&2
    exit 2
  fi
}

DB_GUIDANCE="DB schema changes → use Alembic migrations per docs/MIGRATIONS.md (never ALTER TABLE DROP or DROP COLUMN directly)."
FS_GUIDANCE="Destructive filesystem command → run manually outside Claude Code."
PATH_GUIDANCE="This path is in permissions.deny (Edit). Writing it via the shell bypasses that. Edit it through the normal review path, or run the command yourself outside Claude Code."

check_pattern 'ALTER[[:space:]]+TABLE.*DROP'  "ALTER TABLE ... DROP (dangerous DDL)" "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+TABLE'         "DROP TABLE"                           "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+COLUMN'        "DROP COLUMN"                          "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+DATABASE'      "DROP DATABASE"                        "$DB_GUIDANCE"
check_pattern 'DROP[[:space:]]+SCHEMA'        "DROP SCHEMA"                          "$DB_GUIDANCE"
check_pattern 'TRUNCATE[[:space:]]+TABLE'     "TRUNCATE TABLE"                       "$DB_GUIDANCE"
check_pattern '(^|[[:space:]]|;)TRUNCATE[[:space:]]+[a-zA-Z_"]' "TRUNCATE (bare form)" "$DB_GUIDANCE"

if echo "$SCAN" | grep -iqE 'DELETE[[:space:]]+FROM[[:space:]]+'; then
  if ! echo "$SCAN" | grep -iqE 'WHERE'; then
    echo "Blocked: DELETE FROM without WHERE clause" >&2
    echo "$DB_GUIDANCE" >&2
    exit 2
  fi
fi

check_pattern 'rm[[:space:]]+-rf[[:space:]]+/[[:space:]]*$' "rm -rf / (root)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+/\*' "rm -rf /* (root glob)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+/(etc|home|var|usr|opt|root|boot|lib|lib64|sbin|bin)([[:space:]]*$|/[[:space:]]*$|/\*[[:space:]]*$)' "rm -rf <top-level system dir>" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+~'      "rm -rf ~ (home dir)" "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+\$HOME' "rm -rf \$HOME"       "$FS_GUIDANCE"
check_pattern 'rm[[:space:]]+-rf[[:space:]]+\.[[:space:]]*$' "rm -rf . (cwd)" "$FS_GUIDANCE"

check_pattern 'railway[[:space:]]+(down|service[[:space:]]+delete)' "railway destructive command" "$FS_GUIDANCE"
check_pattern 'vercel[[:space:]]+(--prod|rm)'                       "vercel destructive/prod command" "$FS_GUIDANCE"
check_pattern '\$DATABASE_URL_PRODUCTION'                           "command references production DB URL" "$FS_GUIDANCE"

# MEH-1500 C1 — write-redirection to a protected path.
#
# The hook had ZERO path-write coverage: no >, >>, tee, sed -i, or dd. So every
# path permissions.deny closes to Edit() was writable with `cat > <path>`.
#
# SINGLE SOURCE: the protected list is READ FROM .claude/settings.json's Edit()
# deny entries. It is not copied here. A second copy would drift, which is the
# two-owners-for-one-fact smell (workflow.md Smell #1) and exactly what
# MEH-1030's registry validator exists to catch.
SETTINGS="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}/.claude/settings.json"

if [ -f "$SETTINGS" ]; then
  while IFS= read -r prot; do
    [ -z "$prot" ] && continue
    prefix="${prot%%\*\*}"      # .claude/hooks/**  -> .claude/hooks/
    prefix="${prefix%%\*}"      # .env*             -> .env
    [ -z "$prefix" ] && continue
    esc=$(printf '%s' "$prefix" | sed -e 's/[.[\*^$()+?{}|\\]/\\&/g')
    # > path | >> path | tee [-a] path | dd of=path | sed -i ... path
    if echo "$SCAN" | grep -qE "(>>?[[:space:]]*|tee[[:space:]]+(-a[[:space:]]+)?|of=)[\"']?(\./)?${esc}"; then
      echo "Blocked: shell write to protected path (${prot})" >&2
      echo "$PATH_GUIDANCE" >&2
      exit 2
    fi
    if echo "$SCAN" | grep -qE "sed[[:space:]]+-i[^>]*[[:space:]][\"']?(\./)?${esc}"; then
      echo "Blocked: in-place edit of protected path (${prot})" >&2
      echo "$PATH_GUIDANCE" >&2
      exit 2
    fi
  done < <(jq -r '.permissions.deny[]? | select(type=="string") | select(startswith("Edit(")) | ltrimstr("Edit(") | rtrimstr(")")' "$SETTINGS" 2>/dev/null)
fi

exit 0
```

---

## ה-self-test — `.claude/hooks/check-bash-safety.selftest.sh`

קובץ חדש, לצד ה-hook. הרצה: `bash .claude/hooks/check-bash-safety.selftest.sh
.claude/hooks/check-bash-safety.sh`

```bash
#!/bin/bash
# MEH-1500 Phase C — self-test for check-bash-safety.sh.
# Usage: bash check-bash-safety.selftest.sh <path-to-hook>
# Feeds each case as the real hook input shape ({"tool_input":{"command":...}})
# and asserts the exit code. 0 = allow, 2 = block.
HOOK="${1:?usage: check-bash-safety.selftest.sh <hook>}"
export CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
rc=0

run() { # expected_exit  description  command
  local want="$1" desc="$2" cmd="$3" got
  printf '%s' "$(jq -nc --arg c "$cmd" '{tool_input:{command:$c}}')" | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    printf '  ok   %-58s (exit %s)\n' "$desc" "$got"
  else
    printf '  FAIL %-58s expected %s, got %s\n' "$desc" "$want" "$got"
    rc=1
  fi
}

echo "self-test: $HOOK"

# --- ORIGINAL INTENT MUST SURVIVE (regression guards) ---------------------
run 0 "git commit -m with DDL text in the message"  'git commit -m "DROP TABLE users"'
run 0 "git log with a format string"                'git log --oneline -5'
run 0 "plain safe command"                          'echo hello'
run 0 "redirection to a NON-protected path"         'echo hi > /tmp/meh1500-safe.txt'

# --- C2: the git prefix must no longer swallow the command ----------------
run 2 "git prefix + DDL in a chained segment"       'git --version && echo "DROP TABLE probe"'
run 2 "git prefix + rm -rf ~ (the accident case)"   'git status && rm -rf ~'
run 2 "git prefix + pipe into a blocked segment"    'git log | grep "DROP TABLE"'
run 2 "DDL with no git prefix (unchanged)"          'echo "DROP TABLE x"'

# --- C1: write-redirection to protected paths -----------------------------
run 2 "cat > backend/app/main.py"                   'cat foo > backend/app/main.py'
run 2 "append >> to a protected path"               'echo x >> backend/app/config.py'
run 2 "tee to a protected path"                     'echo x | tee Dockerfile'
run 2 "sed -i on a protected path"                  'sed -i s/a/b/ vercel.json'
run 2 "dd of= a protected path"                     'dd if=/dev/null of=railway.json'
run 2 "write into the .claude/hooks/** glob"        'echo x > .claude/hooks/check-rtl.sh'
run 2 "git prefix + write to protected path"        'git --version && cat a > package.json'

# --- unchanged coverage ---------------------------------------------------
run 2 "DELETE FROM without WHERE"                   'psql -c "DELETE FROM users"'
run 0 "DELETE FROM with WHERE"                      'echo "DELETE FROM users WHERE id=1"'
run 2 "vercel --prod"                               'vercel --prod'

exit $rc
```

### אדום לפני, ירוק אחרי — שתי ההרצות

**מול ה-hook הנוכחי (staging) — 10 נכשלים:**

```
  ok   git commit -m with DDL text in the message                 (exit 0)
  ok   git log with a format string                               (exit 0)
  ok   plain safe command                                         (exit 0)
  ok   redirection to a NON-protected path                        (exit 0)
  FAIL git prefix + DDL in a chained segment                      expected 2, got 0
  FAIL git prefix + rm -rf ~ (the accident case)                  expected 2, got 0
  FAIL git prefix + pipe into a blocked segment                   expected 2, got 0
  ok   DDL with no git prefix (unchanged)                         (exit 2)
  FAIL cat > backend/app/main.py                                  expected 2, got 0
  FAIL append >> to a protected path                              expected 2, got 0
  FAIL tee to a protected path                                    expected 2, got 0
  FAIL sed -i on a protected path                                 expected 2, got 0
  FAIL dd of= a protected path                                    expected 2, got 0
  FAIL write into the .claude/hooks/** glob                       expected 2, got 0
  FAIL git prefix + write to protected path                       expected 2, got 0
  ok   DELETE FROM without WHERE                                  (exit 2)
  ok   DELETE FROM with WHERE                                     (exit 0)
  ok   vercel --prod                                              (exit 2)
EXIT=1
```

**מול הסקריפט שלמעלה — 18/18, EXIT=0.**

**למה זה מפריד ולא סתם אדום:** ארבע בקרות הרגרסיה (`git commit` עם DDL,
`git log`, פקודה תמימה, הפניה לנתיב לא-מוגן) **עוברות בשתי ההרצות**. אילו
הסקריפט החדש היה פשוט חוסם הכול, הן היו מתאדמות. הכוונה המקורית של דילוג
ה-`git` שרדה — וזו הדרישה המפורשת ב-DoD.

> ### באג שנתפס בזכות ה-self-test — ושהיה נשלח בלעדיו
>
> הגרסה הראשונה של הלולאה השתמשה ב-`while IFS= read -r seg` בלי
> `|| [ -n "$seg" ]`, ובלי `\n` ב-`printf`. `read` מחזיר קוד יציאה שונה מאפס
> על שורה אחרונה בלי newline — ולכן **הסגמנט האחרון נבלע**. פקודה בלי מפרידים
> כלל היא סגמנט אחרון יחיד, ולכן `$SCAN` יצא **ריק** ואף בדיקה לא רצה.
>
> ה-self-test הראה 18 מתוך 18 **נכשלים בכיוון ההפוך** — `vercel --prod` ו-DDL
> חשוף עברו. hook שמתיר הכול, בשקט, וקורא נכון. זו בדיוק המחלקה שהכרטיס הזה
> עוסק בה, והיא נתפסה רק כי ה-self-test רץ לפני שהפאץ' נכתב.

---

## עדכון ל-`.claude/hooks/README.md`

בטבלת ה-inventory, בשורה של `check-bash-safety.sh` — להחליף את תיאור
ה-fail-open, ולהוסיף את הכיסוי החדש:

```markdown
| `check-bash-safety.sh` | PreToolUse: Bash | DDL הרסני, `rm -rf` על נתיבי מערכת, פקודות prod של railway/vercel, **וכתיבה מעטפת לנתיבים המוגנים ב-`Edit()` deny** (MEH-1500 C1). דילוג ה-`git` חל על **סגמנט**, לא על הפקודה כולה (MEH-1500 C2). **fail-closed** על `jq` חסר (MEH-1500 C3). |
```

וכן — **להסיר** מה-header של `check-artifact-location.sh` את הניסוח
*"stricter than `check-bash-safety.sh`'s fail-open"*: הוא כבר לא נכון אחרי
C3. שתי השורות מחזיקות את אותה עובדה, ואם רק אחת מתעדכנת נוצר בעל שני
(workflow.md Smell #1).

---

## מה זה **לא** סוגר — לקרוא לפני שמסמנים Done

* **זו heuristic, לא sandbox.** מפריד בתוך מחרוזת מצוטטת מפצל גם הוא; הסטייה
  היא לכיוון **יותר** סריקה, לא פחות.
* **אין כיסוי ל-interpreter כללי.** `python -c "open('backend/app/main.py','w')"`
  אינו נתפס. הוספת דפוס לכל שפה היא מרוץ חימוש; מחוץ ל-scope של הכרטיס.
* **C3 לא אומת התנהגותית.** `jq` קיים כאן, ו"להסיר jq" אינו probe לא-מוטטיבי.
  התיקון הוא שינוי שורה אחת שנקרא ישירות — אבל הוא **קריאת מקור**.
* `permissions.deny` הוא שכבת harness, לא הרשאות מערכת-קבצים. המטרה היא לסגור
  מסלולי-**תאונה**.

---

## סדר ההחלה

1. החליפי את `.claude/hooks/check-bash-safety.sh` בבלוק שלמעלה.
2. צרי את `.claude/hooks/check-bash-safety.selftest.sh` מהבלוק השני, `chmod +x`.
3. הריצי: `bash .claude/hooks/check-bash-safety.selftest.sh .claude/hooks/check-bash-safety.sh` — ציפייה: **18/18, exit 0**.
4. עדכני את `.claude/hooks/README.md` ואת header של `check-artifact-location.sh`.
5. בדקי ידנית שני מקרים בטרמינל שלך: `git commit -m "DROP TABLE test"` על ענף
   זבל (אמור לעבור) ו-`echo x > package.json` (אמור להיחסם).

**אין תלות ב-PR #2384** — שני הפאצ'ים נוגעים בקבצים שונים ואפשר להחיל בכל סדר.
