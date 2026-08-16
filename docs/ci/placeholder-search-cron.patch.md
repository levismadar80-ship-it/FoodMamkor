# Placeholder search rot — periodic checker (MEH-1800)

> **הבלוק כאן מיועד לספיר להדבקה ידנית.** `.github/workflows/**` הוא CC-deny
> (`.claude/settings.json`, MEH-671) — CC כותב את ה-YAML בקובץ `.md` הזה בלבד
> ואינו נוגע ב-workflow.

## מה זה

`scripts/check_placeholder_search.py` שואל את החיפוש החי אם כל מחרוזת placeholder
רשומה עדיין מחזירה **≥1 תוצאה**. הסקריפט קיים, רץ, ו**הודגם נכשל** — ראו §הוכחה
למטה. מה שחסר זה רק **מי מריץ אותו מעצמו**, וזה הבלוק בהמשך.

עד שהבלוק יוחל, ההרצה היא ידנית:

```bash
export VERCEL_AUTOMATION_BYPASS_SECRET=…      # staging מוגן ב-Vercel SSO
python3 scripts/check_placeholder_search.py
```

## למה cron ולא שער merge

MEH-1800 §3 שקל שלוש אפשרויות והכריע **ב'** — בדיקה תקופתית שמדווחת ואינה חוסמת:

| | | |
| -- | -- | -- |
| א | טסט E2E מול staging | אמיתי, אבל תלוי דאטה חיה → מאדים PR-ים מסיבות שאינן באשמתם. בדיוק ה-flake ש-MEH-1792 סגר. |
| **ב** | **cron שמדווח** | **הבעיה היא רקב לאורך זמן, לא רגרסיה שנכנסת ב-diff מסוים. שער על כל PR משלם על כל PR כדי לתפוס מצב ששום PR לא יצר.** |
| ג | טסט מול fixture | דטרמיניסטי אבל לא מודד את הדבר האמיתי. |

**החצי הדטרמיניסטי כן חוסם, והוא כבר בפנים.**
`frontend/__tests__/SearchPlaceholderContract.test.js` תופס את המחלקה שאפשר להכריע
מהמחרוזת לבדה — רשימה מופרדת בפסיקים לא יכולה להחזיר תוצאות **מבנית**, בלי קשר
לדאטה. הוא רץ ב-vitest, כלומר בתוך **CI gate** הנדרש, בלי שום עריכת workflow.
שני החצאים לא מחליפים זה את זה: אחד בודק צורה, השני בודק עולם.

## ⚠️ לפני ההחלה — שני דברים שצריך להכריע

1. **`VERCEL_AUTOMATION_BYPASS_SECRET` חייב להיות repository secret.**
   בלעדיו staging מחזיר SSO redirect. הסקריפט מדווח `UNREACHABLE` ויוצא **2**
   (לא 0 ולא 1) — כלומר ריצה חסומה לא נקראת כירוק ולא כאדום כוזב, אבל היא גם
   לא מודדת כלום. ה-secret קיים היום בסביבת CC; צריך לוודא שהוא קיים גם
   ב-Actions.
2. **מה קורה כשזה נכשל.** cron אדום שאף אחד לא רואה הוא הבטחה, לא שער
   (אותה מחלקה כמו ה-tally הריק של MEH-487). הבלוק למטה פותח **issue** במקום
   להסתמך על מייל כישלון. אם מעדיפים ערוץ אחר — לשנות לפני ההחלה, לא אחרי.

## הבלוק להדבקה — `.github/workflows/placeholder-search-cron.yml` (קובץ חדש)

```yaml
name: Placeholder search rot

on:
  schedule:
    # 05:00 UTC יום ראשון — לפני תחילת השבוע בישראל.
    - cron: "0 5 * * 0"
  workflow_dispatch:
    inputs:
      base:
        description: "Base URL to check"
        required: false
        default: "https://staging.mehamakor.online"

permissions:
  contents: read
  issues: write

jobs:
  check:
    name: Placeholders still return results
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Check placeholders against live search
        id: check
        env:
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
          PLACEHOLDER_CHECK_BASE: ${{ inputs.base || 'https://staging.mehamakor.online' }}
        run: |
          set +e
          python3 scripts/check_placeholder_search.py | tee /tmp/placeholder-report.txt
          echo "code=${PIPESTATUS[0]}" >> "$GITHUB_OUTPUT"
      - name: Open an issue when a placeholder rotted
        if: steps.check.outputs.code != '0'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('/tmp/placeholder-report.txt', 'utf8');
            const code = '${{ steps.check.outputs.code }}';
            const title = code === '2'
              ? 'Placeholder rot check could not reach the search'
              : 'A search placeholder returns zero results';
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title,
              body: [
                'Automated run of `scripts/check_placeholder_search.py`.',
                '',
                'A placeholder that returns nothing teaches the user something false —',
                'see MEH-1800 for the mechanism (AND over tokens, MEH-1664).',
                '',
                '```',
                report.slice(0, 60000),
                '```',
              ].join('\n'),
            });
      - name: Fail the run
        if: steps.check.outputs.code != '0'
        run: exit 1
```

**אין להוסיף את ה-job הזה ל-ruleset `protect-staging` (15240090).** הוא לא
per-PR, אין לו head SHA לדווח עליו ברוב הריצות, ו-required check שמדלג נקרא
`Expected` וחוסם docs-only (MEH-892, נוסה על E2E ב-13/07 ובוטל באותו יום).

## הוכחה — הודגם נכשל, ואז עובר (MEH-1619)

נמדד מול `https://staging.mehamakor.online/api/search` ב-31/07/2026.

**אדום** — הסקריפט מול `he.json` שלפני התיקון, תופס בדיוק את שלוש השבורות
ומעביר את ארבע התקינות:

```
ZERO  home.search.placeholder             'לחם מחמצת, ביצים אורגניות, ירקות ופירות'  TOTAL=0
ok    home.search.placeholders.q1         'לחם מחמצת'      TOTAL=2
ok    home.search.placeholders.q2         'לחמים ואפייה'   TOTAL=1
ok    home.search.placeholders.q3         'זכרון יעקב'     TOTAL=2
ok    home.search.placeholders.q4         'מאפיית המחמצת'  TOTAL=1
ZERO  producers.search_input.placeholder  'לחם מחמצת, גבינת עזים, ירקות אורגניים'    TOTAL=0
ZERO  search.input_placeholder            'לחם מחמצת, ביצים אורגניות, ירקות ופירות'  TOTAL=0
FAILED — 3 placeholder(s) return zero results        exit=1
```

**אדום גם על המחרוזת המוכרת ש-MEH-1800 §5 דורש** (`--probe`):

```
ZERO  --probe[0]  'גבינת עיזים'    TOTAL=0
ZERO  --probe[1]  'ירקות מהשדה'    TOTAL=0
ZERO  --probe[2]  'ביצים אורגניות' TOTAL=0
FAILED — 3 placeholder(s) return zero results        exit=1
```

**ירוק** — אחרי התיקון, כל שבע:

```
PASSED — all 7 placeholder(s) return at least one result.   exit=0
```

**ולא ירוק כוזב** — בלי ה-secret, ריצה חסומה מדווחת `UNREACHABLE … HTTP 401`
ויוצאת **2**. זה מפריד בין "אין תוצאות" לבין "לא נמדד", וזה מה שמונע מהבדיקה
לדווח שהכול תקין כשהיא בכלל לא הצליחה לשאול (`.claude/rules/testing.md` —
"A green that has two possible causes is not a signal").
