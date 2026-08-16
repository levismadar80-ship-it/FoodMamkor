# אודיט ולידציה — עמוד בית העסק הראשי (MEH-1759, Phase 0)

> **Phase 0 בלבד.** אפס שינויי runtime. שום `.parse()` לא נוסף.
> נכתב מול `origin/staging` בתאריך 02/08/2026.

---

## 0 · תקציר מנהלים — הכרטיס מצביע על הקובץ הלא נכון

הכרטיס מניח ש-`ContactCard` יושב מתחת ל-`page.js:9` הלא-מפורסר, ולכן ש**תיקון
`page.js:9` הוא מה שייתן משמעות לארבע ההצהרות המתות**. זה מדוד, וזה לא נכון.

`page.js:73` מרנדר `<ProducerDetail />` **בלי props**. ברירת המחדל בחתימה היא
`initialProducer = null` (`ProducerDetail.jsx:37`), ולכן `useProducerData`
מבצע fetch **צד-לקוח** משלו (`hooks/useProducerData.js:34-38`), ומשם מגיע
ה-producer ל-`ContactCard` (`ProducerDetail.jsx:224`).

**המסקנה המעשית:** ה-fetch של השרת ב-`page.js:9` **אינו מזין את העץ המרונדר
בכלל** — הוא מזין JSON-LD ומטא-דאטה ותו לא. תיקון `page.js:9` לבדו לא ייגע
בשדה אחד שההצהרות המתות מתארות. **המשטח שצריך parse עבור `ContactCard` הוא
`useProducerData.js:35`, לא `page.js:9`.**

שני המשטחים לא מפרסרים. הכרטיס תפס אחד מהם, וייחס לו את התסמין של השני.

---

## 1 · מפת מסלול הנתונים

### מסלול א' — server, `page.js:9`

```
page.js:9   getProducer(id) → serverFetch(`${API_URL}/producers/${id}`)   ← אין Zod
  ├─ page.js:26  generateMetadata → buildProducerMetadata / buildPageUrl / buildAlternates
  └─ page.js:72  <ProducerJsonLd producer={producer}> → buildJsonLd → serializeJsonLd
```

**זה כל הצריכה.** אין צרכן עלה נוסף במסלול הזה.

### מסלול ב' — client, `useProducerData.js:35`

```
ProducerDetail.jsx:37   initialProducer = null   ← page.js:73 לא מעביר props
  └─ hooks/useProducerData.js:34-38   api.get(`/producers/${id}`)          ← אין Zod
        └─ ProducerDetail.jsx:224   <ContactCard producer={producer}>
              └─ ContactCard.jsx:105 instagram · :114 website
                 :120 facebook · :121 external_order_form
```

`useProducerData.js:38` הוא `.catch(() => setProducer(null))` — **בליעה שקטה
נוספת**, מאותה מחלקה של MEH-1754.

---

## 2 · השדות הנצרכים

**מסלול א' (server) — 19 שדות, כולם דרך `lib/seo.js`:**

`avg_rating` · `categories` · `city` · `delivery_areas` · `delivery_nationwide` ·
`description` · `has_physical_location` · `id` · `images` · `lat` · `lng` ·
`name` · `offers_delivery` · `opening_hours` · `phone` · `price_range` ·
`reviews_count` · `slug` · **`website`**

**מסלול ב' (client) — `ContactCard` בלבד, מתוך הארבעה:**
`instagram` · `website` · `facebook` · `external_order_form`

**לא נמצא שדה נצרך שאינו בחוזה.** כל 19 מופיעים ב-`ProducerDetailOut`. אין פגם
חי מהסוג שה-AC ביקש לחפש — נאמר במפורש, כי היעדר ממצא הוא ממצא.

---

## 3 · הכרעה על ארבע ההצהרות המתות — **לא למחוק, ולא לחבר ל-`page.js:9`**

הכרטיס מציג את הארבע כאינרטיות אחידות. המדידה מפרידה ביניהן:

| שדה | נצרך במסלול א' (server) | נצרך במסלול ב' (client) |
| -- | -- | -- |
| `website` | ✅ `lib/seo.js` | ✅ `ContactCard.jsx:114` |
| `instagram` | ❌ | ✅ `ContactCard.jsx:105` |
| `facebook` | ❌ | ✅ `ContactCard.jsx:120` |
| `external_order_form` | ❌ | ✅ `ContactCard.jsx:121` |

**`website` אינו אינרטי בכלל** — הוא נצרך משני המשטחים. ההכללה "ארבע הצהרות
מתות" נכונה רק לגבי `ProducerSchema` כסכימת **רשימות**; היא אינה נכונה לגבי
השדות עצמם.

**ההמלצה:** לא למחוק אף אחת מהארבע, ולא לחבר אותן ל-`page.js:9` (שם שלוש מהן
לא נצרכות ממילא). אם רוצים שההצהרות יהפכו למשמעותיות עבור `ContactCard` — המקום
היחיד שזה קורה בו הוא **`useProducerData.js:35`**.

---

## 4 · בדיקת שבע ההישנויות — **המסקנה מחלישה את התיק, ואני אומרת זאת במפורש**

ה-AC ביקש לבדוק אם מי משבע ההישנויות (MEH-826 · 901 · 902 · 766 ch5 · 1412 ·
1704 · 1719) הייתה מתגלה כאן אילו העמוד פירסר.

**לא בדקתי את שבע ההישנויות אחת-אחת מול ה-diffs שלהן.** מה שכן ניתן לקבוע
מבנית, וזה החלק שמכריע:

`page.js:9` מזין **אך ורק** JSON-LD ומטא-דאטה. שדה חסר או ששינה טיפוס בחוזה
ה-detail יתבטא שם כ-JSON-LD חסר שדה — לא כשגיאת רינדור, לא כמסך שבור, ולא
כמשהו שמשתמשת רואה. כלומר **parse ב-`page.js:9` היה תופס מחלקת פגמים צרה
שהתסמין שלה הוא SEO בלבד**, בעוד שכל פגם שמשפיע על מה שהמשתמשת רואה עובר
במסלול ב' ולא ייגע בו.

**זה מחליש את התיק ל-parse ב-`page.js:9` ומחזק אותו ל-`useProducerData.js:35`.**
אני לא יודעת כמה משבע ההישנויות היו נתפסות בכל אחד מהמסלולים בלי לקרוא את
שבעת ה-diffs, וזו עבודה שלא בוצעה כאן.

---

## 5 · דפוסים קיימים ב-repo — יש דפוס, אין להמציא חדש

`.claude/rules/frontend.md` מתעד שלושה אתרי parse חיים, וכולם **client-side**:

| אתר | התנהגות כשל |
| -- | -- |
| `lib/use-home-page.js:326` · `:360` · `:430` | parse קפדני, all-or-nothing |
| `app/[locale]/map/state/useProducersFeed.js:49` | מרוקן את הרשימה + toast מתורגם (`:36-39`) |
| `app/[locale]/favorites/FavoritesClient.jsx:140` | parse **פר-שורה**; שורה פגומה נזרקת, שאר העמוד שורד |

**אין אף server component ב-repo שמפרסר.** `page.js:9` לא יהיה תיקון של חריגה —
הוא יהיה **התקדים הראשון**, וזו סיבה טובה להחליט על התנהגות הכשל בכובד ראש.

**`serverFetch` (`lib/server-fetch.js`):** timeout 8s, retry רק על
`ECONNRESET`/`UND_ERR_SOCKET`. הוא זורק על כשל רשת — ומאז MEH-1754 (PR #2514)
ה-throw הזה כבר לא נבלע במסלול ה-slug. **במסלול הזה הוא עדיין נבלע**
(`page.js:11-13`).

---

## 6 · התנהגות כשל ב-SSR — ההכרעה שהכרטיס מבקש

| אפשרות | מה המבקרת רואה | מה המפעילה לומדת | הערכה |
| -- | -- | -- | -- |
| `.parse()` — זורק, העמוד 500 | עמוד שגיאה במקום עמוד עסק תקין | Sentry + סטטוס | ❌ **לא.** שדה SEO פגום יפיל עמוד שנראה מצוין למשתמשת. חוסר-פרופורציה. |
| `safeParse` + `notFound()` | 404 | כלום | ❌ **בשום אופן.** זו בדיוק מחלקת MEH-1754 — 404 מסכן אינדוקס. |
| `safeParse` + render raw + log | עמוד תקין | Sentry עם ה-issues | ✅ **מומלץ.** |
| `safeParse` + render partial | עמוד חלקי | Sentry | ⚠️ מיותר כאן — הצרכן היחיד הוא JSON-LD, ו"חלקי" שם הוא בדיוק מה ש-raw נותן. |

### ההמלצה

**`safeParse` + לוג ל-Sentry + להמשיך עם ה-raw** — ובמסלול א' בלבד.

הנימוק: הצרכן היחיד של מסלול א' הוא JSON-LD ומטא-דאטה. **JSON-LD פגום גרוע
מ-JSON-LD חסר, אבל שניהם עדיפים על עמוד שלא נטען.** parse שזורק כאן היה הופך
בעיית SEO שקטה לתקלת זמינות רועשת — החלפה גרועה. `safeParse` שמדווח נותן
למפעילה בדיוק את מה שחסר היום (שקט מוחלט) בלי לשלם במשתמשת.

**למסלול ב' (`useProducerData.js:35`) ההמלצה שונה ואינה חלק מהכרטיס הזה** —
שם ה-parse משפיע על מה שמרונדר, שם התקדים של `FavoritesClient` (parse פר-שורה,
שורה פגומה נזרקת) הוא הרלוונטי, ושם צריך להיזהר מ-`.loose()` מול strict
(MEH-1713).

---

## 7 · מה שנמצא אגב, ולא היה בכרטיס

`if (!res.ok) return null` + `catch { return null }` חוזר ב-**ארבעה** מסלולי
SSR נוספים:

| קובץ | שורה |
| -- | -- |
| `app/[locale]/producer/[id]/page.js` | `:10`, `:12` |
| `app/[locale]/events/[id]/page.js` | `:21`, `:23` |
| `app/[locale]/group-buys/[id]/page.js` | `:15`, `:17` |
| `app/[locale]/experiences/[id]/page.js` | `:17`, `:19` |

**אבל התוצאה שונה מ-MEH-1754, ולכן זו אינה אותה חומרה.** ב-`[slug]/page.js`
ה-`null` הפך ל-`notFound()` → 404 → סיכון אינדוקס. כאן `page.js:66-76` **אינו
קורא `notFound()`** — הוא מרנדר את השלד, וה-fetch של הלקוח מביא את התוכן.
בשלושת האחרים הבדיקה היא `if (!entityName)`, שלא נבדקה כאן לעומק.

**אני מציינת זאת כדי לא לחזור על טעות שכמעט עשיתי בעצמי:** בסקירה ראשונה
סימנתי את הארבעה כ"אותו פגם בדיוק", ורק קריאת ה-default export הראתה שהתוצאה
שונה. הכרטיס MEH-1754 כתב ש-`/producer/{id}` "בריא" — **זה מדויק לגבי ה-404,
ולא מדויק לגבי הבליעה.**

---

## 8 · Definition of Done — מצב

- [x] מפת מסלול הנתונים, file:line לכל צרכן — §1
- [x] רשימת השדות הנצרכים; **אין** שדה נצרך שחסר בחוזה — §2
- [~] בדיקת שבע ההישנויות — **נענתה מבנית, לא אחת-אחת.** המגבלה מוצהרת ב-§4
- [x] הכרעת התנהגות כשל, עם מה שהמבקרת רואה בכל אפשרות — §6
- [x] דפוס קיים ב-repo — אותר וצוטט; **אין server component שמפרסר** — §5
- [x] הכרעה על ארבע ההצהרות המתות — §3, והיא שונה ממה שהכרטיס ציפה לה
- [x] אפס שינויי runtime
- [x] **STOP** לפני הוספת parse

## 9 · הצעד הבא המומלץ

1. **לתקן את הכרטיס:** `ContactCard` אינו יושב מתחת ל-`page.js:9`. היעד
   ל-parse שנוגע לארבעת השדות הוא `useProducerData.js:35`.
2. `safeParse` + Sentry ב-`page.js:9` — קטן, ותיקון של שקט SEO.
3. **כרטיס נפרד** ל-`useProducerData.js:35` — שם ההכרעה קשה יותר וההשפעה על
   המשתמשת ישירה.
