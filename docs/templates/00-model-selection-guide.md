# 🎯 Template 00 — Model Selection Guide

מאיזה מודל לבקש מה. מבוסס על Anthropic 2026 official docs + benchmarks ציבוריים. גרסה 2.0 · אפריל 2026.

---

## 🧠 TL;DR

> **Default: Sonnet 4.6.** לכל עבודה יומיומית. 80% מהמשימות במהמקור.
>
> **Upgrade ל-Opus 4.7** רק כש: קוד מורכב מולטי-קובץ, vision/screenshots, החלטה אסטרטגית, design taste, או PR review של PR גדול.

זה לא דעה — זו ההמלצה הרשמית של Anthropic ב-2026. Sonnet 4.6 מפגר אחרי Opus 4.7 רק במרווח צר ב-SWE-bench, ועולה פי 5 פחות.

---

## 📊 השוואה מהירה — אפריל 2026

| ממד | Sonnet 4.6 | Opus 4.7 |
|---|---|---|
| **מחיר (MTok input/output)** | $3 / $15 | $5 / $25 |
| **SWE-bench Verified** | 79.6% | ~93%+ |
| **GPQA Diamond (PhD reasoning)** | 74.1% | 91.3%+ |
| **Vision (high-res)** | רגיל | 2,576px / 3.75MP (3x) |
| **Max output tokens** | 64K | 128K |
| **Default effort** | high | xhigh |
| **Context window** | 1M | 1M |
| **Speed** | מהיר | בינוני (משקיע ב-thinking) |
| **Best at** | קוד יומיומי, CRUD, copy, classification | קוד מורכב, vision, multi-file, design taste, research |

---

## 🎨 מטריצה למהמקור — מה לאיזה מודל

### 🟢 **Sonnet 4.6** — Default (80% מהמשימות שלך)

**מתי:**
- ✅ Bug fix בקובץ אחד (למשל MEH-78 Map default location)
- ✅ Copy change (החלפת "יצרן" → "בית עסק")
- ✅ CRUD endpoint חדש (POST /producers, GET /events)
- ✅ Component יחיד (ProducerCard, EventCard)
- ✅ Test writing (pytest + RTL render tests)
- ✅ Quick fix / token drift (template 07)
- ✅ Refactor של קובץ אחד או 2 קבצים סמוכים
- ✅ i18n sweep (replace hardcoded Hebrew with t() calls — חוזר וצפוי)
- ✅ Linear issue creation prompts (אתה כותבת אותם, לא המודל)
- ✅ עבודה איטרטיבית עם הרבה PRs קצרים

**Effort recommendation:** `medium` ל-routine, `high` ל-bugs לא-טריוויאליים. אל תשני ל-`max` — אצל Sonnet זה לא helpful.

**עלות צפויה:** ~$0.5-2 per typical Mehamakor PR.

---

### 🟣 **Opus 4.7** — Specialist (20% מהמשימות, ה-hard ones)

**מתי:**
- ✅ Multi-file refactor (3+ קבצים תלויים)
- ✅ Design redesign מ-scratch (MEH-76 ProducerDetail, MEH-122 Map)
- ✅ Architecture decision (auth-as-service vs module)
- ✅ Hard bug (MEH-78 שלא נפתר אחרי 2 ניסיונות)
- ✅ PR review גדול (10+ files changed)
- ✅ Research / Strategic decision (template 05)
- ✅ Smart Search (MEH-99) — Hebrew morphology מורכב
- ✅ Vision tasks (screenshots של staging, ניתוח UI)
- ✅ Long-horizon agentic (auto mode, multi-step planning)
- ✅ Skeptic Mode review של תשובת Claude Code (Opus 4.7 חוזק ב-bug finding +11pp recall)
- ✅ Frontend design עם דרישת taste (logo, hero, brand)

**Effort recommendation:** `xhigh` (default ב-Claude Code). `max` רק לבעיה ממש קשה — אחרת overthinking.

**עלות צפויה:** ~$3-15 per typical Opus PR.

---

### 🟡 **Haiku 4.5** — Lightweight (אם נחוצה מהירות/עלות נמוכה)

**מתי:**
- ✅ Classification (האם המייל הזה ספאם?)
- ✅ Extraction מ-text קצר
- ✅ Translation snippets
- ✅ Real-time chat fallback

**לא במהמקור כרגע** — אבל לדעת שקיים ל-future use cases.

---

## 🔄 דוגמאות קונקרטיות מ-Linear שלך

| Issue | המודל הנכון | למה |
|---|---|---|
| **MEH-78** Map default location | 🟢 Sonnet 4.6 | bug יחיד, קובץ אחד (MapClient) |
| **MEH-76** ProducerDetail redesign | 🟣 Opus 4.7 | design taste + multi-file (component+page+styles) |
| **MEH-99** Smart Search | 🟣 Opus 4.7 | Hebrew morphology = reasoning-heavy |
| **MEH-103** Reviews system | 🟣 Opus 4.7 | feature מולטי-לייר (DB + API + UI + verification) |
| **MEH-122** Map redesign | 🟣 Opus 4.7 | design + multi-file + vision (screenshot review) |
| **MEH-191** verify-email bug | 🟢 Sonnet 4.6 | localized fix in email.py |
| **MEH-296** Multi-channel contact | 🟣 Opus 4.7 | architecture decision (primary channel logic) |
| **MEH-329** XSS sanitization sweep | 🟣 Opus 4.7 | security-critical, multi-file, easy to miss vectors |
| **MEH-330** Dependabot CI | 🟢 Sonnet 4.6 | config files, well-known pattern |
| **MEH-100** About page photo | 🟢 Sonnet 4.6 | quick task, single component |
| **MEH-94** Yellow badge → slate | 🟢 Sonnet 4.6 | 1-line CSS |
| Skeptic Mode reviews | 🟣 Opus 4.7 | bug-finding strength matters |

---

## 🎚️ Effort levels — ב-Claude Code

```
low      → trivial, latency-sensitive (Haiku territory)
medium   → routine Sonnet work, cost-conscious
high     → Sonnet default
xhigh    → Opus 4.7 default — coding/agentic sweet spot
max      → genuine hard problems only. אזהרה: prone to overthinking.
```

**אצל Sapir (Claude Code Max):**
- Sonnet 4.6 → השאירי על default (high)
- Opus 4.7 → השאירי על xhigh (default). העלי ל-max רק ל-MEH-99 / MEH-122 / MEH-329 רמה.

---

## 🧠 Adaptive Thinking — מתי להפעיל ב-claude.ai

### מה זה Adaptive Thinking?

Anthropic החליפה את "Extended Thinking" הישן ב-**Adaptive Thinking** ב-Claude 4.6+ (Feb 2026). בOpus 4.7 (Apr 2026) זה **הmode היחיד** — ה-extended thinking toggle הישן הוסר.

ההבדל המרכזי: במקום *budget קבוע* (1024/8192/32000 tokens), המודל **בוחר בעצמו** כמה להשקיע ב-reasoning per turn — מ-0 tokens לעד 100,000+, לפי מורכבות הquery.

### ב-claude.ai (web/mobile) — איך זה עובד

יש לך **toggle בינארי** ליד שם המודל: ON/OFF. אין יותר slider, אין יותר budget.

- **OFF** = המודל עונה ישר, בלי reasoning visible (מהיר, פחות מדויק על משימות מורכבות)
- **ON** = המודל **רשאי** לחשוב לפני שעונה. הוא לא חייב — הוא בוחר.

**Critical:** Opus 4.7 thinking is **off by default**. אם לא הפעלת toggle → המודל לא חושב כלל.

### ✅ סמני adaptive thinking ב-claude.ai

| Use case | למה |
|---|---|
| 🟣 **כל משימה ב-Opus 4.7** | Off by default — חייבת להפעיל אחרת זה Opus בלי הסופר-כוח שלו |
| 🔍 Research / אסטרטגיה | Multi-step reasoning הכרחי |
| 🐛 Hard bugs | Sonnet 4.6 + thinking = upgrade לפני שעוברים לOpus |
| 🎨 Design decisions (לא execution) | Trade-offs דורשים reasoning |
| 📐 Architecture / DB schema | Implications לטווח ארוך |
| 📊 בדיקת תשובות Claude Code (Skeptic Mode) | Bug-finding דורש reasoning |
| 🧪 השוואות (X vs Y) | Reasoning דורש לעומקם |
| 💡 משימה שלא ברורה איך לפתור | Adaptive ימצא הדרך |

### ❌ אל תסמני adaptive thinking

| Use case | למה |
|---|---|
| 💬 שיחה רגילה ("מה השעה?", "תסבירי X") | Latency גוברת על תועלת |
| 📝 כתיבת copy / תרגום עברית | אין צורך ב-reasoning |
| 🔧 Quick task (template 07) | Overkill — Sonnet 4.6 בלי thinking מספיק |
| 🎯 משימה ברורה לחלוטין עם spec מלא | Reasoning כבר נעשה ב-spec |
| 📋 סיכום / טבלת השוואה פשוטה | Mechanical, לא reasoning-heavy |
| ⚡ urgency — צריך תשובה מהירה | OFF נותן תשובה ב-2-3 שניות |

### 🚨 ⚠️ אזהרה חשובה — adaptive thinking יכול להקצות 0 tokens

Stella Laurenzo (AMD) ניתחה 6,852 sessions של Claude Code אחרי Feb 2026 ומצאה: ב-**67% מהturns** המודל "שומר" tokens על ידי הקצאת **0 reasoning**. Boris Cherny (יוצר Claude Code) אישר ב-HN: turns שהיו fabrications (commit SHAs, package names מומצאים, API versions מומצאות) קיבלו exactly 0 thinking tokens.

**משמעות:** adaptive thinking ON ≠ "המודל יחשוב". הוא **רשאי** לחשוב, אבל לא חייב.

### 🛡️ Mitigation — איך להבטיח שכן יחשוב כשצריך

ב-prompt קריטי, הוסיפי משפט מפורש:

**אם רוצה יותר thinking:**
> "Think carefully step-by-step before responding. This problem is harder than it looks."

**אם רוצה פחות thinking:**
> "Prioritize responding quickly. When in doubt, respond directly."

זה **prompt-level steering** של adaptive thinking, מומלץ ע"י Anthropic 2026 רשמית.

### 📐 כלל אצבע פשוט

```
Opus 4.7  → adaptive thinking ON תמיד
Sonnet 4.6 → ON ל-reasoning tasks, OFF ל-mechanical tasks
Haiku 4.5  → אין adaptive thinking (manual mode בלבד)

כשבספק → ON. הcost לא משמעותי כי המודל בוחר.
```

### 🔁 השוואה — claude.ai web vs Claude Code CLI vs API

| Surface | איפה הtoggle | מה מומלץ |
|---|---|---|
| **claude.ai (web/mobile)** | ליד שם המודל בbar | ON ל-Opus, contextual ל-Sonnet |
| **Claude Code CLI** | אוטומטי לפי effort level | xhigh = always thinks |
| **API** | `thinking: {type: "adaptive"}` | תמיד מומלץ ל-Opus 4.7+ |

**אצל Sapir (Claude.ai Max):** Opus 4.7 → **תמיד ON**. Sonnet 4.6 → ON אם יש "למה" / "איך" / "מה הקומפרומיס" בשאלה.

---

## 🧠 הבדלים פסיכולוגיים — איך לכתוב prompts לכל אחד

### 🟢 Sonnet 4.6 — "engineer מהיר וזריז"

- **More structure helps.** ה-XML tags, examples, success criteria — חשובים יותר מ-Opus.
- **Multishot חזק.** 3-5 examples — לא דבר של מותרות, זה הgame.
- **פחות autonomous.** תנו spec מפורט עד הסוף, אל תסמכו על inference.
- **`<thinking>` tags עוזרים.** Sonnet לא חושב אדפטיבית כברירת מחדל.
- **דגל אדום:** אם הוא טועה אותה טעות פעמיים → עברי ל-Opus, זה לא Sonnet בעיה.

### 🟣 Opus 4.7 — "staff engineer ש-thinks for itself"

- **Less role, more constraints.** משפט אחד ל-`<role>`, יותר ב-`<acceptance_criteria>`.
- **Trust + verify.** תני לו autonomy + ask לעצמו verify ("verify your work before declaring done").
- **More LITERAL.** Anthropic 2026 רשמי: "will not silently generalize". Over-specify the scope.
- **No "think step by step".** xhigh = adaptive thinking auto. בקשה ידנית = רעש.
- **Bundle context up front.** Multi-turn ambiguity מוריד איכות. תני הכל ב-turn 1.
- **Over-engineering guard.** Opus 4.5/4.6 דווח כ-overengineering, 4.7 פחות אבל עדיין. תוסיפי `<over_engineering_guard>: minimal change, no unrequested abstractions`.

---

## 📐 Decision Flow — מה לבחור?

```
1. האם זו משימה מורכבת מולטי-קובץ או החלטה אסטרטגית?
   → כן: Opus 4.7
   → לא: ↓

2. האם זו משימת design עם דרישת taste?
   → כן: Opus 4.7  
   → לא: ↓

3. האם זה bug שלא נפתר ב-2 ניסיונות?
   → כן: Opus 4.7 (escalate)
   → לא: ↓

4. האם זה review של PR גדול?
   → כן: Opus 4.7 (bug finding strength)
   → לא: ↓

5. הכל אחר → Sonnet 4.6
```

---

## 💰 Cost optimization

**Sapir ב-Claude Code Max:**
- Sonnet token allocation גדול → השתמשי בלי דאגה לכל היומיום
- Opus 4.7 token allocation קטן יותר → שמרי ל-hard tasks
- אסטרטגיה: התחילי כל משימה ב-Sonnet. אם נתקעת ב-2 turns → escalate ל-Opus.

**אופטימיזציה לעלות per outcome:**
1. Plan ב-Opus (הוא מבין את הproblem) → Implement ב-Sonnet (זול)
2. Skeptic Mode reviews ב-Opus (bug finding)
3. Design ב-Opus → CSS tweaks ב-Sonnet
4. Bug investigation ב-Opus → bug fix coding ב-Sonnet

---

## 🚨 anti-patterns — מה לא לעשות

❌ **לא ל-Opus כל דבר** — `max` reflex burning tokens. Anthropic 2026: "Most '4.7 feels slow' reports trace back to people running max by reflex."

❌ **לא לכתוב prompts זהים לשני המודלים** — Sonnet זקוק ליותר structure, Opus זקוק לפחות role.

❌ **לא לעבור פתאום באמצע משימה** — אם התחלת ב-Sonnet והוא תקוע, escalate ב-turn החדש (clear context). אל תחליפי באותו chat.

❌ **לא לתת ל-Opus 4.7 הוראות "thinking"** — adaptive thinking פעיל אוטומטית. הוראות ידניות = רעש.

❌ **לא להעמיס ב-CLAUDE.md בלי למחוק** — Anthropic system reminder: "may or may not be relevant". 70% follow rate. כל שורה מיותרת מקטינה ציות.

---

## 📚 מקורות

- [Anthropic Opus 4.7 announcement (Apr 16, 2026)](https://www.anthropic.com/news/claude-opus-4-7)
- [Anthropic Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Best practices for Claude Opus 4.7 with Claude Code](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)
- [Effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)
- Wharton 2025 "Playing Pretend" (arXiv 2512.05858)

---

**מתעדכן:** כל release חדש של Anthropic. Mythos Preview קיים (Apr 2026) אבל דורש Project Glasswing partnership — לא רלוונטי למהמקור כעת.
