# מהמקור — Manual Testing Checklist
> עדכון: אפריל 2026 | מתעדכן אחרי כל PR

---

## MEH-1045 — bot hardening: fast-404 ל-catch-all + robots.txt + localeDetection:false

- [ ] **עמוד עסק אמיתי נטען** — פתחו עמוד slug של עסק קיים (מובייל) — **תוצאה מצופה:** העמוד נטען רגיל, ללא שינוי.
- [ ] **נתיב סורק לא מגיע ל-backend** — פתחו `/wp-admin` — **תוצאה מצופה:** עמוד "לא נמצא" מיידי (הערה: הסטטוס הוא 200 soft-404 עם `noindex` — התנהגות streaming קיימת מראש; נתיבים עם נקודה כמו `/.env` מחזירים 404 אמיתי). ב-Network אין קריאת `/api/producers/by-slug/...`.
- [ ] **localeDetection כבוי** — דפדפן באנגלית (Accept-Language: en) פותח `/` — **תוצאה מצופה:** נחיתה על העברית (ברירת המחדל) בלי redirect ל-`/en`; מעבר ידני ל-`/en` עדיין עובד.
- [ ] **robots.txt** — פתחו `/robots.txt` — **תוצאה מצופה:** שורת Sitemap מצביעה על `https://mehamakor.online/sitemap.xml`; חסימות GPTBot/CCBot/וכו' מופיעות; `User-agent: *` עדיין Allow.

## MEH-995 — /join: דף הצטרפות כבית עסק

- [ ] **הדף חי** — פתחו `/join` (מובייל 375px) — **תוצאה מצופה:** hero עם "העסק שלכם. עמוד משלו.", eyebrow זהב "לבתי עסק מקומיים", כפתור "מצטרפים" יחיד + "חינם להצטרף" מתחתיו; אין אזכור פרימיום/עמלות ב-hero.
- [ ] **4 צעדים** — גללו ל"איך זה עובד" — **תוצאה מצופה:** ספרות Cormorant ‏01–04 שלמות (ללא חיתוך גם ב-320px), 4 כותרות+טקסט, קישור "לתהליך הקבלה המלא" → `/about/process`.
- [ ] **FAQ teaser** — סוף הדף — **תוצאה מצופה:** "כמה זה עולה?" עם "חינם להצטרף ולהופיע. אין עמלות על עסקאות — לעולם.", קישור "לכל השאלות" → `/about/for-businesses`.
- [ ] **CTA → wizard** — לחצו "מצטרפים" — **תוצאה מצופה:** נחיתה ב-`/register/producer` (מסך "לפני שמתחילים" של MEH-994).
- [ ] **Footer** — בכל עמוד — **תוצאה מצופה:** "הוסיפו את העסק שלך" מוביל עכשיו ל-`/join` (לא ישירות ל-wizard).
- [ ] **Testimonial placeholder** — **תוצאה מצופה:** משבצת עדות עם טקסט מסביר-עצמו ("כאן תופיע עדות אמיתית…") — לא עדות שנראית אמיתית.

## MEH-991 — design-parity sweep (Chunk 2, PRs #1468/#1472/#1476/#1477/#1479)

בדיקה על מובייל + דסקטופ (Vercel preview לכל קבוצה).

- [ ] **G2 ProducerCard (#1472)** — כרטיס עסק עם 3+ תגי אמון → התג השלישי מתקפל ל-"+N" · שלד טעינה (skeleton) פינות חדות עם פעימת opacity עדינה (לא shimmer) · לב שמור = מעגל קרם · Tab במקלדת → טבעת focus על תמונת הכרטיס + על השם — `כרטיס עסק ברשת /producers`
- [ ] **G3 בית (#1476)** — כותרת ה-hero כבדה יותר (900) · חיפוש = כרטיס קרם עם שדה לבן + כפתור ריבוע ירוק · אריח קטגוריה לא מתקרב (zoom) ב-hover, השם מקבל קו תחתון זהב · אריח "ירקות" = ענף+עלים (לא עלה בודד) · בלוק "היכרות" §10 = תמונה 4:5 עם צ'יפ כיתוב על התמונה + eyebrow זהב · מספרי הזהב (קטגוריות/how-it-works) באות נטויה אמיתית — `/` (דף הבית)
- [ ] **G4 ניווט (#1477)** — סרגל תחתון מחובר: לשונית חשבון מציגה את השם הפרטי שלך (מקוצר עם … אם ארוך), "חשבון" כשמנותקים · לוגו בפוטר = חותם קרם-מדורג (לא כתם לבן שטוח) על רקע ירוק כהה — כל עמוד
- [ ] **G5 (#1479)** — עסק שסגור עכשיו: נקודת סטטוס + "סגור" באפור (fg-muted), לא אדום — `/[slug]` (עמוד עסק, שעות פתיחה) · שדה אימייל בהתחברות מציג `name@example.com` — `/login`

---

## MEH-994 — /register/producer: מסך "לפני שמתחילים" (pre-flight)

- [ ] **מסך פתיחה לפני הטופס** — פתחו `/register/producer` (לא מחוברות) — **תוצאה מצופה:** במקום טופס החשבון מופיע מסך "לפני שמתחילים": כותרת העמוד + subtitle נשארים, ואז צ'קליסט "מה כדאי להכין" (אימייל, סיפור קצר, 2–3 תמונות, רישיון יצרן אם נדרש), שורת משך "בערך 10 דקות", בלוק "מה קורה אחרי" עם קישור ל-`/about/process`, וכפתור "מתחילים" אחד.
- [ ] **CTA → פריים 01** — לחצו "מתחילים" — **תוצאה מצופה:** נכנסים לפריים ACCOUNT הרגיל (stepper 01–04 ללא שינוי; ה-pre-flight לא נספר כצעד).
- [ ] **מסלול upgrade** — משתמשת מחוברת פותחת `/register/producer` — **תוצאה מצופה:** ה-pre-flight מוצג גם כן, אבל **בלי** שורת "כתובת אימייל ליצירת חשבון"; "מתחילים" מוביל ישר ל-DETAILS.
- [ ] **קישור התהליך** — לחיצה על "איך תהליך הקבלה עובד" — **תוצאה מצופה:** ניווט ל-`/about/process`.
- [ ] **ללא זכירת מצב** — רעננו את העמוד אחרי "מתחילים" — **תוצאה מצופה:** ה-pre-flight מופיע שוב (אין localStorage flag — by design).

## MEH-970 chunk 2-lite — /map near-me pill + empty-near-me guard (mobile)
- [ ] **כפתור "קרוב אליי" יחיד** — פתחו `/map` במובייל — תוצאה: גלולת "קרוב אליי" צפה אחת על המפה (פינה ימנית-תחתונה, מעל ה-bottom sheet); **אין** כפתור צלב (crosshair) נוסף בשורת חיפוש העיר; חיפוש העיר תופס את כל הרוחב.
- [ ] **קרוב אליי — יש עסקים בקרבת מקום** — לחצו על הגלולה ואשרו גישה למיקום — תוצאה: המפה עפה למיקומכם (זום 13) עם סמן מיקום; אין toast.
- [ ] **empty-near-me (אין עסקים ברדיוס 25ק"מ)** — לחצו על הגלולה ממיקום ללא עסקים בקרבת מקום — תוצאה: toast "אין עדיין עסקים באזורך — הנה הקרובים" + המפה מתרחקת לתצוגת ברירת המחדל (`[32.4,34.95]` זום 8) ומציגה את **כל** העסקים (לעולם לא מפה ריקה).
- [ ] **דחיית גישה למיקום** — לחצו על הגלולה ודחו את בקשת המיקום — תוצאה: נפתח חלון חיפוש העיר (LocationModal), לא toast מת.

## MEH-815 — עמוד עסק: Tinted Masthead למצב ללא תמונות

עסק **ללא תמונות גלריה** (`producer.images` ריק). פתחי את עמוד העסק (375px מובייל).

- [ ] **Masthead במקום הפלייסהולדר** — עסק בלי תמונות — **תוצאה מצופה:** במקום קופסת האמוג'י+ראשי-תיבות הישנה מופיע hero טקסטואלי: שם העסק (Frank Ruhl Libre שחור/900) על רקע קרם עם גוון ירוק עדין (6%). אין אמוג'י.
- [ ] **שם פעם אחת בלבד** — אותו עסק — **תוצאה מצופה:** שם העסק מופיע פעם אחת (ב-masthead, ככותרת h1); אינו חוזר שוב מתחת בכותרת ProducerHeader. הקטגוריה/עיר/תיאור/תגיות כן נשארים מתחת.
- [ ] **מונוגרם מ·ה** — פינה עליונה (צד end, נגדי לכפתור המועדפים) — **תוצאה מצופה:** סימן מותג מ·ה קטן בזהב, עמום, לא דומיננטי, ללא התנגשות עם הלב.
- [ ] **כפתור מועדפים** — פינה עליונה start — **תוצאה מצופה:** כפתור הלב נשאר ופועל (top-start), נפרד מהמונוגרם.
- [ ] **גובה קצר מהגלריה** — השוו לעסק עם תמונות — **תוצאה מצופה:** ה-masthead נמוך יותר מקרוסלת התמונות (h-52).
- [ ] **Regression: מצב עם תמונות** — עסק עם תמונה אחת+ — **תוצאה מצופה:** הגלריה/קרוסלה זהה לחלוטין למצב הקודם (אפס שינוי, שם h1 בכותרת כרגיל).

---

## MEH-853 — /register/producer frame 01 (DETAILS): city + address

- [ ] **city autocomplete** — בפריים DETAILS (אחרי שם העסק/טלפון), הקלידי 2+ תווים בשדה "יישוב" — **תוצאה מצופה:** נפתח dropdown של ערים; בחירה ממלאת את השדה; ה-✕ מנקה אותו (reuse של CitySearch, MEH-213 — אין טקסט חופשי).
- [ ] **city בpayload** — מלאי יישוב + השלימי הרשמה — **תוצאה מצופה:** ב-DevTools Network, ה-POST ל-`/auth/register/producer` נושא `"city": "<העיר>"`.
- [ ] **address free-text** — שדה "כתובת" מקבל טקסט חופשי (לא חובה) — **תוצאה מצופה:** נשמר ב-`form.address` ונשלח כ-`"address"` ב-payload.
- [ ] **שני המסלולים** — גם בהרשמה חדשה וגם במסלול upgrade (משתמשת מחוברת) — **תוצאה מצופה:** city+address נשלחים בשניהם (ה-body משותף מעל ענף `!isUpgrade`).
- [ ] **Regression** — OAuth עדיין נוחת על DETAILS; declarations עדיין חוסמות submit; שדה רישיון עדיין מופיע ל-ירקות/פירות — **תוצאה מצופה:** ללא שינוי (freeze).

---

## MEH-964 chunk 1A — producer dashboard nested-route shell

לוח הניהול הפך ל-hub-and-spoke עם `layout.js` משותף (tab nav + שער הזדהות אחד) ו-Overview רזה. נכנסות כבעלת עסק (role=producer).

- [ ] **שער הזדהות** — משתמשת לא-producer (או לא מחוברת) על כל `/producer/dashboard/*` → הפניה ל-`/login`
- [ ] **Tab nav קבוע** — שורת הטאבים (סקירה / עריכה / כלים) נשארת מקובעת למעלה במעבר בין הטאבים; הטאב הפעיל מודגש (`aria-current="page"`)
- [ ] **סקירה** (`/producer/dashboard`) — ברכה + באנרי סטטוס + כרטיס השלמת פרופיל + מתג זמינות + AnalyticsSection נשארים; אין כפול ואין רגרסיה
- [ ] **עריכה** (`/producer/dashboard/edit`) — 3 טפסי העריכה (ביו AI / שאלות מותאמות / ערוצי קשר) עובדים זהה לקודם (שמירה ב-PUT /producers/me)
- [ ] **כלים** (`/producer/dashboard/tools`) — גריד הקישורים המהירים; "הוסיפי אירוע" → `/producer/dashboard/events/new`; "צפי בעסק" → `/producer/{id}`
- [ ] **תובנות** — הטאב **לא** מופיע עדיין ב-1A (נוסף ב-1B); אין טאב מת / "בקרוב"
- [ ] **נייד (375px)** — שורת הטאבים נקראת ללא horizontal scroll; כל טאב נפתח תקין
- [ ] **/en** — תוויות הטאבים באנגלית (Overview / Edit / Tools); אין מחרוזות מפתח גולמיות

## MEH-964 chunk 1B — KPI strip on Overview + תובנות tab

ה-Overview קיבל רצועת 4 KPI נעולה + שורת המרה, והאנליטיקה העמוקה עברה לטאב חדש "תובנות". נכנסות כבעלת עסק (role=producer).

- [ ] **רצועת KPI (סקירה)** — 4 קלפים ב-2×2, סדר RTL ימין→שמאל: פניות בוואטסאפ → צרי קשר → דירוג → צפיות; **זהה בנייד ובדסקטופ**
- [ ] **ללא דלתות/חצים** — אין מגמה/חץ ליד מספר; תווית חלון אחידה "7 הימים האחרונים" בשלושה הקלפים (דירוג מציג "{N} ביקורות")
- [ ] **שורת המרה** — מתחת לרצועה, שקטה/מוצללת (לא קלף): "X% מהצופות פנו אלייך" (מונה = וואטסאפ בלבד)
- [ ] **תג "בעלת עסק השבוע"** — נשאר ב-Overview כשמתקיימים התנאים (profile_strength≥80 + rank=1)
- [ ] **תובנות** (`/producer/dashboard/insights`) — הטאב הרביעי מופיע; מציג את הקלפים החלוניים (צפיות/חיפושים/וואטסאפ/צרי קשר) + עוקבים/דירוג + 2 הגרפים (קו צפיות + ערים מובילות)
- [ ] **אין כפילות** — רצועת ה-KPI מופיעה רק ב-Overview, לא ב-תובנות (אנטי-MEH-961/963)
- [ ] **נייד (375px)** — 4 הטאבים: אם צרים מדי יש גלילה אופקית (overflow-x-auto), בלי חיתוך; רצועת ה-2×2 נקראת
- [ ] **/en** — תווית הטאב "Insights"; ה-KPI באנגלית (WhatsApp leads / Contact clicks / Rating / Views); אין מחרוזות מפתח גולמיות

## MEH-288 — ProfileCompletenessCard on producer dashboard

כרטיס "השלמת פרופיל" בראש `/producer/dashboard`, מעל קלפי ה-analytics. נכנסות כבעלת עסק (role=producer).

- [ ] **State red** — עסק חסר עיר / מיקום / פרטי קשר → כותרת "הפרופיל שלך חסר פרטים קריטיים" + טבעת אדומה + כפתור "השלימי פרופיל →" שמוביל ל-`/settings`
- [ ] **State yellow ≤70%** — עסק עם עיר+מיקום+קשר אבל בלי קטגוריה/תמונה → כותרת "הפרופיל שלך X% מוכן", שורת "השלב הבא:" מציגה את השדה החסר הראשון
- [ ] **State yellow >70%** — חסר רק שדה אחד (למשל תמונה) → כותרת "כמעט שם — X% מוכן" + "רק N פרטים עד שהפרופיל מלא"
- [ ] **State green** — כל השדות מלאים → הכרטיס מתכווץ לשורה אחת "✓ הפרופיל מלא" (לא נעלם)
- [ ] **נייד (375px)** — הכרטיס נקרא, הטבעת + הכותרת לא נשברות; אין horizontal scroll
- [ ] **a11y** — קורא-מסך מכריז על אחוז ההשלמה (role=progressbar) ועל ה-CTA ("השלימי את הפרופיל שלך")
- [ ] **/en** — אותו כרטיס באנגלית (Your profile is X% ready / Complete profile) — אין מחרוזות עבריות גולמיות
- [ ] **Regression** — קלפי ה-analytics, חוזק פרופיל, וכל שאר ה-dashboard נשארים מתחת לכרטיס ללא שינוי
- [ ] **MEH-964 1C — activity pulse בסקירה** — עסק עם פניות וואטסאפ ב-7 הימים האחרונים → מתחת ל-KPI strip כרטיס פעילות: שורת hero ("N פניות חדשות בוואטסאפ — פתחי כדי לענות"), עד 2 שורות אירועים אנונימיות (פנייה בוואטסאפ · צפייה בפרופיל — בלי שמות, בלי עיר, בלי זמן יחסי), כפתור אחד "פתחי וואטסאפ לענות" → wa.me. אפס וואטסאפ אבל יש צפיות → רק שורת צפייה, בלי hero ובלי CTA. אפס הכל → "עוד אין פעילות — שתפי את העמוד כדי להתחיל". אין שורת ביקורות (נדחה ל-MEH-966).
- [ ] **MEH-1002 — שדה "תיאור קצר" (שישי)** — עסק מלא בלי תיאור (גם tagline וגם סיפור ריקים) → הכרטיס מציג "כמעט שם — 83% מוכן" והצ'קליסט (6 שורות) מסמן "תיאור קצר" כחסר; מילוי אחד מהשניים (tagline או ביו) → הכרטיס מתכווץ ל"הפרופיל מלא". חסר תיאור לבדו אף פעם לא הופך את הכרטיס לאדום. באדמין: העסק מקבל נקודה צהובה עם "תיאור קצר" ב-tooltip.

## MEH-773 Chunk B — DB integrity constraints (backend)

- [ ] דיווח כפול על עסק — לדווח על אותו עסק פעמיים (אותו משתמש) — הדיווח השני מחזיר **409** עם הודעה "כבר דיווחת על בית עסק זה" (היה 400/אנגלית); המודאל ב-ReportButton מציג את ההודעה
- [ ] הפניה כפולה (referral) — לקרוא ל-`/referral/claim` פעמיים עם אותו קוד — שתי הפעמים **200**; השנייה מחזירה `referral already claimed` (אידמפוטנטי, לא 409)
- [ ] מחיקת עסק עם נתונים נלווים — עסק עם OTP token + בקשת תו כשרות + משתמש מקושר → מחיקה דרך אדמין מצליחה (אין 500); הילדים נמחקים והמשתמש מאבד את `producer_id` (NULL)
- [ ] קיבולת רכש קבוצתי — רכש עם `max_participants=2`, להצטרף עם 3 משתמשים שונים → השלישי מקבל **400** "קבוצת הרכש מלאה" (הספירה מדויקת תחת נעילת השורה)
## MEH-805 — post-login redirect (3 senders → ?redirect=)
- [ ] **Favorite gate** — לא מחוברת, לחצי ❤ על כרטיס בית עסק → toast "התחברי", לחצי על הלינק → אחרי login חוזרת לעמוד הקודם (לא לדף הבית). איך: `/login?redirect=%2F<slug>` ב-URL.
- [ ] **Login modal** — טריגר ל-LoginPromptModal, לחצי "היכנסי" → אחרי login חוזרת ליעד.
- [ ] **פרסום חוויה** — `/experiences/new` כשלא מחוברת → redirect ל-login → אחרי login נוחתת על `/experiences/new` (לא על `/`).
- [ ] **Regression** — `/register/producer` (כבר היה תקין) עדיין מחזיר ל-`/register/producer` אחרי login.

---

## MEH-841 — comparison moved home→/about + layout A + copy refresh (supersedes MEH-525)

- [ ] **/about — רצועת השוואה חדשה** — פתחי `/he/about`, גללי בין הציטוט (Pull-quote) ל-Benefits → סקשן "ההבדל / מה שמשתנה בדרך": ציר אנכי עם 3 נקודות זהב, כל תחנה = שורה ירוקה גדולה (Frank-Ruhl) + שורת "בסופר —" אפורה קטנה. ללא צל, ללא אייקונים, קרם + קו שיער. RTL — הנקודות בצד ימין (start), טקסט מימין לשמאל
- [ ] **/about — copy מדויק** — 3 השורות: "את יודעת בדיוק מי מאחורי זה / בסופר — שם על אריזה, אם בכלל" · "קרוב אלייך, מגיע טרי / בסופר — מי יודע מאיפה ומתי" · "ישירות מול מי שמייצרת / בסופר — עוד פריט בעגלה". ללא נקודה בסוף כותרות
- [ ] **דף הבית — טיזר** — במקום הטבלה הישנה (אחרי "איך זה עובד") יש טיזר ממורכז: eyebrow "ההבדל" + כותרת "מה שמשתנה בדרך" + קישור "גלו את ההבדל" → מוביל ל-`/about`. אין יותר טבלת סופר|מהמקור בהום
- [ ] **EN mirror** — `/en/about` + `/en/` — הטקסט עדיין בעברית (HE-mirror, TODO i18n EN), RTL תקין

## Overnight design batch 2026-06-12/13 (PRs #1073–#1080)

- [ ] רצועת אמון (MEH-524) — דף הבית עם ≥5 עסקים ב-/stats — רצועה בקרם עם מספרים בזהב נטוי: "N בתי עסק שהצטרפו עד היום · M קטגוריות · מכל רחבי הארץ"; מתחת לסף — "מתחילות עכשיו · בכל רחבי הארץ"; אף פעם לא "0"
- [ ] רצועת השוואה (MEH-525) — גלילה אחרי "שלושה צעדים" — טבלת סופר|מהמקור, 3 שורות, קווי שיער בלבד, ללא צל; RTL תקין גם ב-EN
- [ ] איך זה עובד (copy-Δ #1080) — eyebrow "איך זה עובד" + כותרת "שלושה צעדים" + צעדים מצאי/צרי קשר/קנייה — ללא נקודה בסוף כותרות
- [ ] בלוק עסקים (copy-Δ #1080) — "יש לך עסק? בואו אלינו" + 3 שורות גוף + כפתור "הוסיפו את העסק שלך"
- [ ] פוטר (copy-Δ #1080) — tagline בלי "אליך" ובלי נקודה; ניוזלטר בלי נקודה; שורה תחתונה "© 2026 מהמקור" בלי 🌿
- [ ] תגיות BadgeRow (MEH-730) — עמוד עסק + כרטיס — צ'יפים ירוקים עם טקסט קרם, צ'יפ זהב עם טקסט לבן, נייטרלי על surface-card
- [ ] גיליון חשבון (MEH-730) — אייקון Storefront + ↗ בגוון gold-on-dark החדש על הירוק הכהה
- [ ] TrustBadge tooltip (MEH-792) — לחיצה על תגית tier בעמוד עסק פותחת tooltip (היה title שלא עבד במובייל)
- [ ] Hero חוויות + רכישות קבוצתיות (MEH-797) — תמונות Cloudinary נטענות, טקסט קריא על הסקרים ב-375

## MEH-534 — /about/process "תהליך הקבלה" (S11 Direction D)

New standalone editorial page at `/about/process`. he copy locked; en is draft
(⏳ pending Sapir). Badge shown is illustrative (no live producer). Test on
mobile widths **375 / 360 / 390** and desktop.

- [ ] **Route renders** — פתחי `/he/about/process` ו-`/en/about/process` — שני הדפים נטענים (SSG), כותרת הטאב = "תהליך הקבלה | מהמקור" / "Our Acceptance Process | Mehamakor"
- [ ] **Hero** — H1 `כל בית עסק כאן עובר דרכנו — היכרות אישית.` עם "היכרות אישית" בזהב נטוי (Cormorant) — ללא חיתוך, RTL נכון
- [ ] **4 steps** — מובייל: רשימה אנכית עם עיגולי מספר 01–04; דסקטופ: 4 עמודות. אייקונים: מטוס/שיחה/סיכה/חנות. כיתוב "תג מאומת שלב נפרד" מופיע מתחת לשלבים
- [ ] **What's checked** — 3 כרטיסים (זהות · סיפור · שיחה) על רקע `background-alt`, מספרי זהב 01–03
- [ ] **Badge section** — צ'יפ "מאומת" עם אייקון חותם + טקסט tooltip "רישיון הוגש ונבדק בתאריך 5.6.2026" (התאריך LTR לא מתהפך); בלוק "אין תג מאומת? זה לא אומר פחות" עם kicker זהב
- [ ] **Matrix — group A** — 8 קטגוריות (בשר/חלב/לחם/מוכנים/מותססים/משקאות/שוקולד/דבש), כולן תג "מאומת"; שורת דבש = "שלושה רישיונות יחד…"
- [ ] **Matrix — group B** — 8 קטגוריות, כל אחת "מוצהר או מאומת" חוץ מ**נרות וארומה** = "מוצהר" בלבד + הערה "אין מסלול לתג…"; ירקות/פירות מציגים שורת "מוצהר: הצהרה שזו תוצרת…"
- [ ] **Closing** — ציטוט ספיר `אני רוצה לדעת ממי אני קונה…` נטוי, eyebrow "מהמקור", קרדיט "— ספיר"
- [ ] **CTA** — כפתור "ספרו לנו על העסק" → `/register/producer`; טקסט משני "ממשיכים לטופס ההרשמה"
- [ ] **Footer link** — "תהליך הקבלה" מופיע בעמודת הניווט בפוטר → מוביל ל-`/about/process`
- [ ] **Cross-link from /about** — בתחתית עמוד `/about` יש קישור "כך אנחנו מכירות כל בית עסק" → `/about/process`
- [ ] **RTL + tap targets** — כל הסקשנים מיושרים RTL, אין גלישה אופקית ב-360px, קישור CTA ≥44px, focus ring נראה

---

## MEH-685 — Toast semantic icon API (Category D2 emoji strip)

All toasts now render a Phosphor icon (no emoji). Icon sits at the **start** of
the toast (right side in he/RTL), inheriting the white text color.

- [ ] **Favorite — save (first time)** — לחצי ❤ על עסק (פעם ראשונה במכשיר) — toast עם
  אייקון לב מלא (HeartStraight) + "נשמר! כל המועדפים שלך מחכים בעמוד המועדפים שבתפריט", בלי אימוג'י
- [ ] **Favorite — save (repeat)** — שמירה נוספת — toast לב מלא + "נשמר למועדפים"
- [ ] **Favorite — remove** — הסרה ממועדפים — toast אייקון ✓ ברירת־מחדל + "הוסר מהמועדפים"
- [ ] **Follow** — מעקב אחרי עסק — toast פעמון (Bell) + "מעכשיו תקבלי עדכונים…", בלי 🔔
- [ ] **Share / copy link** — העתקת קישור (ShareButton) — toast אייקון Check + "הקישור הועתק"
- [ ] **Review saved** — שליחת ביקורת — toast כוכב (Star) + "הביקורת שלך נשמרה", בלי ⭐
- [ ] **Publish neighbor product** — פרסום מוצר שכן — toast עלה (Leaf) + "המוצר פורסם!", בלי 🌿
- [ ] **Under review** — מוצר שסומן בבדיקה — toast זכוכית מגדלת (MagnifyingGlass) + "…בבדיקה", בלי 🔍
- [ ] **Error toast** — כשל רשת/פעולה — toast אדום + אייקון WarningCircle
- [ ] **Info + action (session expiry)** — אחרי פג תוקף JWT — toast info + אייקון Info +
  לינק "התחברי" שעובד
- [ ] **RTL position (he)** — בכל ה־toasts: האייקון בצד ימין (start), צמוד לטקסט עם gap, לבן
- [ ] **EN locale** — אותם toasts ב־/en — אייקונים זהים, טקסט אנגלי בלי אימוג'י

## Friday-strip i18n fix (סרגל שישי)

- [ ] בחלון שוק שישי (ד׳ 18:00–ו׳ 14:00, או עקיפת אדמין) + יש בתי עסק עם משלוח היום — סרגל "בתי עסק עם משלוח היום" בראש דף הבית — תוצאה: טקסט אמיתי (לא נתיבי מפתח כמו group_buys.friday_delivery.title), badge "🛒 היום" על הכרטיסים
- [ ] אותו סרגל ב-`/en` — תוצאה: "Businesses delivering today" + "today"

## MEH-788 — /register split-editorial (תמונה + טופס)

- [ ] כותרת "הצטרפי לקהילה" — תוצאה: סקייל זהה לכותרת /login (32px/900, לא ענקית), שורת שלוש התכונות (מפה·לב·כוכב) לא מופיעה
- [ ] `/register` בדסקטופ ≥1024px — שני פאנלים: טופס מימין (START), תמונת ארגז תוצרת משמאל (END) — תוצאה: כמו /login, התמונה מכסה את הפאנל המלא
- [ ] overlay "טרי · מקומי · מהמקור" בתחתית התמונה — תוצאה: קריא על השכבה הירוקה הכהה
- [ ] `/register` במובייל 375/360/390 — רצועת תמונה למעלה (~30vh) + הטופס מתחת — תוצאה: אין גלילה אופקית, הטופס שמיש
- [ ] הרשמה מלאה (שם+אימייל+סיסמה+תנאים) — תוצאה: מסך "בדקי את המייל" כרגיל (ללא פאנל תמונה — מכוון)
- [ ] `/en/register` — overlay "Fresh · Local · From the source" — תוצאה: אנגלית, אותו עיצוב

## MEH-788 — hero דף הבית: תמונת תוצרת + Ken Burns

- [ ] בית `/he` — ה-hero מציג את תמונת התוצרת (Cloudinary) ברוחב מלא עם דריפט איטי — תוצאה: לא תמונת הסטוק הישנה, תנועה עדינה בלי קפיצות
- [ ] כותרת + תת-כותרת + CTAs קריאים מעל התמונה ב-375/360/390 — תוצאה: טקסט לבן קריא על השכבה הירוקה, אין אזור "מסונוור"
- [ ] חיפוש hero: להקליד 2+ תווים — תוצאה: ה-dropdown נפתח מלא וגולש מעבר לקצה ה-hero (לא נחתך)
- [ ] הגדרות מכשיר → reduce motion — תוצאה: התמונה סטטית (אין דריפט), הכל עדיין קריא
- [ ] גלילה אופקית ב-375px — תוצאה: אין overflow אופקי

## MEH-731 — navbar homepage-state (locale-path) + verify-banner relocation

- [ ] בית `/he` בראש (לפני גלילה) — navbar **שקוף** + לוגו/קישורים בהירים מעל ה-hero — תוצאה: לא cream pill
- [ ] בית `/en` בראש — אותו מצב transparent (התיקון עובד גם ב-locale השני) — תוצאה: transparent
- [ ] בית אחרי גלילה >80px — הופך ל-cream pill — תוצאה: מעבר נכון
- [ ] עמוד פנימי (`/about`, `/map`) — cream pill כברירת מחדל — תוצאה: pill כהה-דיו
- [ ] קישור `גלי` בעמוד הבית — קו תחתון זהב פעיל — תוצאה: underline מופיע (היה שבור)
- [ ] BottomNav (מובייל) בעמוד הבית — tab הבית מודגש — תוצאה: highlight מופיע (היה שבור)
- [ ] verify-banner: משתמש מחובר לא מאומת — banner צהוב מתחת ל-hero (לא בתוך ה-pill הצף) — תוצאה: ה-pill נשאר נקי; banner נראה + כפתור resend עובד
- [ ] verify-banner בעמוד פנימי + בגלילה — עדיין מוצג — תוצאה: נוכח בכל עמוד

---

## MEH-643 chunk 4 — Navbar floating-pill (FloatingNavbar v5)

### Desktop (≥768px)
- [ ] בית `/` למעלה — navbar שקוף מעל ה-hero, דיו בהיר, לוגו לבן — איך לבדוק: לטעון `/` — תוצאה: pill שקוף, טקסט בהיר קריא
- [ ] גלילה מעל 80px — navbar הופך ל-cream pill צף (border + צל יחיד, ללא קפיצת-צל ב-hover) — תוצאה: מעבר חלק 420ms
- [ ] עמוד פנימי (`/about`, `/map`) — cream pill כברירת מחדל (לא שקוף) — תוצאה: pill כהה-דיו על cream
- [ ] קישור פעיל = קו תחתון זהב (`גלי` ב-`/`, `מפה` ב-`/map`) — תוצאה: underline זהב בלבד
- [ ] אורח: ghost `כניסה לחשבון` + green `הוסיפו עסק ↗` — תוצאה: שניהם מופיעים
- [ ] מחובר (consumer): avatar dropdown + green CTA נשאר — תוצאה: dropdown profile/settings/logout
- [ ] מחובר (producer/admin): **אין** `הוסיפו עסק` (MEH-669) — תוצאה: CTA מוסתר
- [ ] search icon + `/` shortcut + LanguageToggle עובדים — תוצאה: search נפתח, שפה מתחלפת

### Mobile (375px)
- [ ] hamburger over-hero = glass יחיד (`bg-white/15 backdrop-blur`) — תוצאה: כפתור מטושטש קריא מעל התמונה
- [ ] פתיחת drawer = warm-dark (`green-900`) — קישורי Frank Ruhl 24px + ספרות זהב `01·02·03` — תוצאה: drawer כהה, מספרים זהב
- [ ] drawer: green `הוסיפו עסק` + ghost-on-dark `כניסה לחשבון` (אורח) — תוצאה: שתי כפתורים full-width
- [ ] drawer מחובר: favorites + admin (אם admin) + logout, restyled כהה — תוצאה: כולם נוכחים וקריאים
- [ ] search button במובייל עובד — תוצאה: נפתח `/search`
- [ ] email-verify banner (משתמש לא מאומת) עדיין מופיע מתחת ל-pill — תוצאה: banner צהוב + resend

---

## MEH-671 — Producer-signup smoke (now automated)

The 5-step producer-signup smoke is now a GitHub Action
(`.github/workflows/staging-smoke.yml` + `.github/scripts/staging_smoke.py`,
`workflow_dispatch` only). **The manual checklist below is the fallback** when
the Action can't run (no secrets, Railway CLI issue, or you want to verify by
hand). Trigger the automated one via Actions → "Staging smoke" → Run workflow.

What the automation asserts (and what to check manually if it's down):
- [ ] `POST /auth/register/producer` with a fresh `smoke+{id}@mehamakor.online` → **200**
- [ ] New row appears in `/admin/producers` (admin login)
- [ ] Railway log shows `[WHATSAPP] Producer welcome template sent` (not `… FAILED` / `… send failed`)
- [ ] Railway log shows `[RISK] scored producer=` (not `… ANTHROPIC_API_KEY not set` / `… unparseable` / `… crashed`)
- [ ] Admin badge for the row shows a numeric `risk_score` 0–100 (not `אין מידע`)
- [ ] **Cleanup**: after the run, `SELECT count(*) FROM users WHERE email LIKE 'smoke+%@mehamakor.online'` → **0** (the Action's always() step does this via a users-first CTE)

---

## MEH-669 — Admin producer-lockout fix

Run on Vercel preview before merging to staging.

### Test 1 — Admin blocked on password upgrade path

- [ ] Log in as admin (`sint12345@gmail.com` or any account with `role='admin'`)
- [ ] Type `/register/producer` into the address bar → **expected:** automatic redirect to `/admin` (no form ever rendered)
- [ ] In DevTools console, send a direct POST: `fetch('/auth/register/producer', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('token')}, body: JSON.stringify({producer_name:'X',phone:'0501234567',category_ids:[],primary_contact_method:'whatsapp'})}).then(r => r.json().then(j => console.log(r.status, j)))` → **expected:** `403 {"detail":"מנהלת מערכת לא יכולה להירשם כבית עסק. אנא צרי חשבון נפרד עם כתובת אימייל אחרת."}`
- [ ] After both checks: refresh `/admin` → **expected:** admin dashboard loads normally; role still `"admin"` in `/auth/me`

### Test 2 — Admin blocked on OAuth Step 0

- [ ] (Only if admin has linked Google) Click "Sign up as producer with Google" from `/register/producer` step 0 → **expected:** 403 with the same Hebrew copy; admin lands back on /admin (no Step-2 token issued)

### Test 3 — Regression: consumer can still upgrade to producer

- [ ] Log in as regular consumer (any non-admin, non-producer account)
- [ ] Navigate to `/register/producer` → **expected:** form renders normally, no redirect
- [ ] Submit a valid producer signup → **expected:** 200, role flips to `"producer"`, redirects to `/producer/dashboard`

### Test 4 — Regression: anonymous can still sign up as producer

- [ ] Log out completely (clear localStorage)
- [ ] Navigate to `/register/producer` → form renders
- [ ] Complete step 1 (email + name + password + producer fields) → **expected:** 200, OWASP anti-enumeration RegisterAck shape (no `access_token`), verification email sent

### Test 5 — Frontend CTAs hidden from admins

- [ ] Log in as admin → check Header (mobile drawer), Footer (CTA panel "יש לך עסק?"), and `/producers` empty state → **expected:** no "הוסיפי עסק" / "הוסיפי את העסק שלך" link visible anywhere
- [ ] Log in as consumer → all 3 surfaces SHOULD show the CTA
- [ ] Log out → all 3 surfaces SHOULD show the CTA (anonymous can still register)

---

## MEH-669 recovery — for Smadar's local terminal only

**Affected account at time of writing:** `sint12345@gmail.com` (Sapir's staging admin).

Recovery is a data fix, not a schema change — does NOT require Alembic.

```sql
-- 1) READ-ONLY inspect first. Capture the producer_id → call it $PID.
SELECT id, email, role, producer_id, is_producer
FROM users
WHERE email = 'sint12345@gmail.com';

-- 2) Restore admin access (single UPDATE — no cascade).
--    This step alone is sufficient to unlock /admin.
UPDATE users
SET role = 'admin',
    producer_id = NULL,
    is_producer = false
WHERE email = 'sint12345@gmail.com';

-- 3) (Optional) Delete the orphan producer row.
--    CASCADE will clean ProducerCategory, DeliveryArea, ProducerReview,
--    ProducerFollower, ProducerPageView, ProducerWhatsAppClick, etc.
--    (all FK'd to producers.id with ondelete=CASCADE).
DELETE FROM producers WHERE id = '$PID';
```

**Run order matters:** `users.producer_id → producers.id` has no `ondelete=` (default NO ACTION). Running step 3 before step 2 raises a FK violation. Run step 2 first, always.

**Production deny-list note:** `.claude/hooks/check-bash-safety.sh` blocks any Bash command containing `$DATABASE_URL_PRODUCTION`. Run psql from your own Git Bash terminal, not from a Claude Code session (per `.claude/rules/security.md` § production safety).

### Audit query for other affected admins

By design pre-fix admins now have `role='producer'`, which makes them indistinguishable from real producers. The narrowest filter that catches the bug class:

```sql
-- Producers with status=pending_whatsapp whose linked user was created
-- BEFORE the producer row (= upgrade path, not new signup).
SELECT u.id, u.email, u.role, u.created_at AS user_created,
       p.id AS producer_id, p.created_at AS producer_created
FROM users u
JOIN producers p ON u.producer_id = p.id
WHERE p.status = 'pending_whatsapp'
  AND u.created_at < p.created_at;
```

Cross-check the returned emails against the original admin allowlist (whoever Smadar promoted manually). Any hit = an admin that lost their role via this bug and needs the recovery SQL above.

---

## MEH-641 PR-A — auth chrome noindex verification

**Pages to verify (View Source in browser):**
- /he/login, /he/register, /he/contact, /he/search → must show `<meta name="robots" content="noindex, nofollow"/>` (or comma-space variant)
- /en/login, /en/register, /en/contact, /en/search → same

**Regression check:**
- /he/about, /he/map, /he/, /he/terms, /he/privacy → must NOT show `noindex` (default index,follow or no robots meta)

---

## Anti-enumeration registration smoke test (MEH-328)

**Run on the staging preview URL after PR #696 merges to staging.** Load-bearing for the upgrade-path regression — Tests A-C verify the new OWASP behavior, Test D verifies the upgrade path is unchanged, Test E verifies out-of-band notification.

### Setup

- Open the staging URL in an anonymous browser window.
- Open DevTools (`F12`) → Application → Local Storage → the site's origin.
- Open DevTools Network tab. Filter on `auth/register`.

### Test A — Consumer flow, new email

1. Navigate to `/he/register`.
2. In DevTools console: `localStorage.clear()` then refresh.
3. Submit the form with a fresh email (e.g. `meh328-a-<timestamp>@example.com`), a strong password (12+ chars), any name.
4. Expect:
   - Success screen headline: **"בדקי את תיבת המייל שלך 📬"**
   - Body: **"אם האימייל פנוי, נשלחה אלייך הודעת אימות. אנא בדקי את תיבת הדואר."**
   - Helper: **"לא קיבלת? בדקי בספאם או נסי שוב בעוד דקה."**
   - CTA: button **"חזרה לדף הראשי"** → routes to homepage.
   - `localStorage.getItem('token')` → **`null`**.
   - URL does NOT auto-redirect to `/producer/dashboard` or `/`.
   - Network: `POST /auth/register` → `200`, body `{"detail": "אם האימייל פנוי..."}`. No `access_token` field.

### Test B — Consumer flow, existing email (collision)

5. Refresh the page. Submit the SAME email again with different password/name.
6. Expect: **identical screen to step 4 — pixel for pixel.** No "already registered" chip. No different copy. Network response body matches byte-for-byte.

### Test C — Producer non-upgrade, new email

7. `localStorage.clear()` → refresh.
8. Navigate to `/he/register/producer` (NOT logged in).
9. Complete wizard steps 1 + 2 with a fresh email + producer details. Submit on step 2.
10. Expect:
    - Step 3 renders the **same inbox-check UI as Test A** (📬 emoji, headline, body, helper, "חזרה לדף הראשי" button).
    - `localStorage.getItem('token')` → **`null`**.
    - Network: `POST /auth/register/producer` → `200`, body `{"detail": "אם האימייל פנוי..."}`. No `access_token`, no `whatsapp_sent`.
    - Step 3 does NOT show the old "הצטרפת!" + dashboard CTA.

### Test D — Producer upgrade (LOAD-BEARING — regression risk for MEH-328 Chunk B)

11. Log in as an existing consumer (no producer attached to the account).
12. Navigate to `/he/register/producer`. The wizard should auto-skip step 1 (account form) — you should land on step 2 with the producer details form.
13. Complete the wizard and submit.
14. Expect:
    - Step 3 renders the **OLD success UI**: `CheckCircle` icon + headline **"הצטרפת!"** + WhatsApp-aware paragraph + "מה הלאה?" bullet list + button **"לדשבורד שלי ←"** + share button.
    - `localStorage.getItem('token')` → **non-null JWT** (the token from the upgrade response).
    - Network: `POST /auth/register/producer` → `200`, body includes `access_token` + `whatsapp_sent`.
    - Clicking "לדשבורד שלי ←" routes to `/producer/dashboard` and you're authenticated.

### Test E — Duplicate-attempt email arrives

15. Check the inbox of the EXISTING email used in Test B.
16. Expect a Hebrew email:
    - Subject: **"ניסיון רישום במהמקור — את כבר רשומה"**
    - Body opens with **"היי {your name}, מישהו ניסה להירשם למהמקור עם הכתובת שלך."**
    - For a password account: body says **"את כבר רשומה אצלנו עם סיסמה — אם זו את, היכנסי כאן: …"** + link to `/login`.
    - For a Google/Apple account: body says **"את כבר רשומה אצלנו דרך {Google|Apple} — אם זו את, היכנסי כאן: …"** + link to `/login`.
    - Footer: **"בברכה, צוות מהמקור"**.

### Failure signals — STOP and file a hotfix if any of these fire

- ❌ **Test D shows the inbox-check UI instead of the dashboard CTA** → upgrade-path branch detection is broken (`didUpgrade` state didn't flip). Possible root cause: response no longer carries `access_token` on the upgrade path, or `"access_token" in res.data` predicate is wrong.
- ❌ **Test A or C renders different UI than Test B's collision response** → success-screen rendering bug. The whole point of MEH-328 is that the user cannot distinguish branches.
- ❌ **Network response body for `/auth/register` (non-upgrade) carries an `access_token` field** → backend regression. Should be `{"detail": ...}` only.
- ❌ **Test E email never arrives (within 5 min)** AND `RESEND_API_KEY` is configured on Railway → background task dispatch broken. Check Railway logs for `[EMAIL]` warnings.

### Out of scope for this smoke

- `/auth/register/producer/oauth` — out of scope for the entire MEH-328 ticket.
- `/auth/forgot-password` — separate MEH-191 flow (already OWASP-compliant pre-MEH-328).
- `/auth/login` — separate ticket (timing-leak follow-up filed).

---

## Stats counter reframe + skeleton (MEH-607)

Bundles F4 (copy reframe) + F10 (CLS-fixing skeleton). New copy: *"גליון {month} — N בתי עסק · M קטגוריות · מכל רחבי הארץ"* — editorial-cadence framing per synthesis §5.2 Option A. Dynamic month name via `Intl.DateTimeFormat('he-IL', { month: 'long' })`. F10: while `/stats` hasn't returned, a skeleton with matching `bg-primary text-white py-4` dimensions reserves height → zero CLS between loading and the real counter.

- [ ] Hebrew copy renders — visit `/he` → stats bar reads *"גליון מאי — N בתי עסק · M קטגוריות · מכל רחבי הארץ"*. Month name is the **current Hebrew month** (in May → "מאי"; in June → "יוני"). "מאומתים" word is **absent**.
- [ ] Skeleton on first paint — hard-reload `/he` with Network throttled to "Slow 3G" → for the first few hundred ms the stats slot shows the green section with a pulsing white pill (no numbers yet). When `/stats` resolves the pill is replaced by the real counter **with zero layout jump** (no content below shifts).
- [ ] 375px wrap — open Vercel preview at exactly 375px viewport → counter wraps cleanly if it wraps at all. Watch for orphan words (a single word alone on its own line). Synthesis §5.3 acceptance: month+counter on line 1, categories+geography on line 2 if wrap happens.
- [ ] Empty-DB state — if `/stats` returns `{ producers_count: 0 }` → after the skeleton dismisses, the stats section is **hidden** (no green bar). Acceptable launch-week behavior; not a CLS regression vs pre-MEH-607 (was also hidden).

---

## HomepageMiniMap above the fold (MEH-604)

Moves the mini-map preview from section #7 (after HolidayBanner) to section #2 (immediately after Hero). Adds an SSR-able skeleton placeholder so the slot reserves height before JS hydrates (CLS fix), and defers Leaflet bundle eval 200ms post-FCP via `setTimeout` + chained `requestIdleCallback` so it lands outside the LCP measurement window. Also adds OSM tile-shard preconnects (`a/b/c.tile.openstreetmap.org`) in the locale layout `<head>`.

- [ ] Section order — visit `/he` on mobile → scroll order is: Hero → **map** → Friday strip (if Fri) → stats → Location banner → Holiday banner → Categories. Map is the **second** visible block, not section #7.
- [ ] Skeleton on first paint — hard-reload `/he` with Network throttled to "Slow 3G" → for the first ~200ms the map slot shows the skeleton (pulsing `bg-light` + `MapTrifold` icon + "טוענת מפה..."). The slot is **the same height** as the rendered map — no layout jump when the live map appears.
- [ ] Tile preconnect in DOM — DevTools → Elements → `<head>` → 3 lines present: `<link rel="preconnect" href="https://a.tile.openstreetmap.org">` (also `b.`, `c.`). All have `crossOrigin="anonymous"`.
- [ ] Leaflet load timing — DevTools → Performance → record initial page load → main thread should be free of Leaflet/`react-leaflet` script eval for the first ~200ms after FCP. Map markers appear after the defer window.

---

## /map legend — disable empty-viewport categories (MEH-722)

Desktop only (≥md) — the collapsible category legend at the map's bottom-start corner. A category with 0 businesses in the **current viewport** renders disabled instead of clicking into an empty list. Count is pre-category-filter (`allProducers ∩ committedBounds`), recomputed on pan.

- [ ] Empty category grays out — `/he/map` desktop → open the legend (squares button) → pan/zoom to an area where a category has no businesses → that row is **grayed (low opacity) and not clickable** (cursor not-allowed, no hover highlight). תוצאה מצופה: שורה מושבתת, לא מובילה לרשימה ריקה.
- [ ] Non-empty category unchanged — same legend → a category that **does** have businesses in view stays clickable and filters the map as before. תוצאה מצופה: לחיצה מסננת כרגיל.
- [ ] Recompute on pan — click a category with results, then pan to an area where it has 0 → row updates to disabled state on the pan (not stuck from first render). תוצאה מצופה: עדכון על תזוזת מפה.
- [ ] Active category drops to 0 — activate a category, then pan until it has 0 in view → row is muted **but still clickable** (clicking it deactivates / shows all again, so you're not trapped in an empty filter). תוצאה מצופה: עדיין ניתן לכבות, אין מסך-ריק-תקוע, אין קריסה.

---

## Hide /neighbor pre-launch (MEH-598)

Brand LOCK enforcement — `/neighbor` route + nav links + homepage kitchen section removed from public surface. Page files preserved per MEH-543 revival path. AI chat + producer dashboard + `HomeProductCard` label LOCK leaks deferred to MEH-599 (see PR description for E1-E6 mapping).

- [ ] Header nav (desktop ≥768px) — visit `/`, `/about`, `/map`, `/events` → top nav shows 3 items: גלה / מפה / אודות. "מהשכן" link **absent**.
- [ ] Footer nav — scroll to footer on any page → 5 items: גלה / מפה / אירועים / אודות / FAQ לבתי עסק. "מהמטבח של השכן" link **absent**.
- [ ] BottomNav (mobile <768px) — visit `/` on mobile → 3 tabs visible: בית / מפה / פרופיל. "מהשכן" tab **absent** (was 4 tabs, now 3).
- [ ] Direct route redirect — visit `https://staging.mehamakor.online/neighbor` (or `/he/neighbor`) → redirects to `/` (locale-prefixed root via next-intl middleware).
- [ ] Direct route on mobile — same as above on mobile browser → no broken intermediate render, clean redirect.
- [ ] Homepage section absence — visit `/` → between `<HomeHowItWorks>` (איך זה עובד) and the parallax divider, the "מהמטבח של השכן" home-products marquee is **absent**. Page flows directly from "איך זה עובד" → parallax → events preview.
- [ ] DOM grep — load any page → DevTools → Search for "/neighbor" in DOM → returns 0 (excluding code comments not rendered).
- [ ] No console errors — DevTools console on `/`, `/neighbor` redirect target, mobile + desktop → no `Missing message: home.kitchen.heading` or similar i18n warnings.

---

## Producer license number (MEH-530)

Conditional-required field on `/register/producer` Step 2 + admin `ProducerForm`. Required when one of: לחמים ואפייה / מותססים וכבושים / מוצרים מוכנים / בשר / דגים / חלב וגבינות / שוקולד וממתקים בוטיק / יין, בירה ומשקאות / **דבש (MEH-743)** (MEH-927: "בשר ודגים" split into "בשר" + "דגים", both license-required). Optional + collapsed otherwise. Format warning is inline (`^\d{7,10}$`) and **never blocks submit**.

- [ ] Register bakery WITH license — בחרי קטגוריה "לחמים ואפייה" → שדה "מספר רישיון יצרן (חובה)" מופיע מיד עם helper text "ייצור מזון בקטגוריה זו דורש רישיון יצרן ממשרד הבריאות". הזיני 1234567 → submit מצליח (200 OK + redirect לדשבורד).
- [ ] Register bakery WITHOUT license — אותו flow, השאירי ריק → submit מציג שגיאה אדומה "מספר רישיון יצרן חובה לקטגוריה זו" (422 מה-backend).
- [ ] Register vegetables — בחרי "ירקות ופירות" בלבד → שדה השתוקק לא מופיע, במקומו toggle "יש לי רישיון יצרן ↓". לחיצה → השדה נפתח אופציונלי. submit ללא ערך → 200 OK.
- [ ] Register vegetables + bakery (mixed) — בחרי שתי קטגוריות → השדה הופך ל"חובה" אוטומטית עם helper text.
- [ ] Format warning — בשדה (בכל path) הזיני "abc" → טקסט כתום inline "מספר רישיון יצרן הוא 7-10 ספרות". לחיצי על submit — **submit עובר** למרות האזהרה (manual-approval flow). 1234567 → אין warning.
- [ ] Max length — נסי להזין 21 ספרות → input נחתך ל-20 (`maxLength={20}`).
- [ ] Admin form — `/admin/producers/new` → "קטגוריות ותגיות" Section → בחרי "בשר" (או "דגים") → השדה מופיע inline עם "(חובה)". POST 422 אם ריק; POST 201 + הערך נשמר אם מלא.
- [ ] Admin edit existing producer — `/admin/producers/[id]/edit` של יצרן עם רישיון → השדה אוטומטית פתוח עם הערך הנוכחי (לא toggle).
- [ ] Admin pending queue — `GET /admin/producers/pending` (DevTools Network tab) → JSON כולל `producer_license_number` (זה ה-`ProducerAdminOut` החדש).
- [ ] Public detail page (privacy guard) — `/[slug]` של יצרן עם רישיון → JSON מ-`GET /producers/{id}` כולל `has_producer_license: true` אבל **לא** את המספר עצמו.

### MEH-1046 — pagination בטבלת /admin/users
- [ ] ברירת מחדל 25 — `/admin/users` (500+ משתמשים); **תוצאה מצופה:** 25 שורות בלבד, "עמוד 1 מתוך N", "הקודם" מושבת, המונה למעלה עדיין מציג את הסך הכולל.
- [ ] "הבא" מתקדם — לחצי "הבא"; **תוצאה מצופה:** 25 השורות הבאות; בעמוד האחרון "הבא" מושבת.
- [ ] בורר גודל עמוד — שני ל-50/100; **תוצאה מצופה:** מספר השורות משתנה וחוזרים לעמוד 1.
- [ ] שינוי פילטר מאפס — עברי לעמוד 2 ואז שני role או הריצי חיפוש; **תוצאה מצופה:** חוזרים לעמוד 1 עם התוצאות המסוננות.
- [ ] פעולות שורה בעמוד 2 — חסימה / תפריט ⋮ / דיאלוג אישור; **תוצאה מצופה:** עובדים כרגיל, והחסימה לא מחזירה לעמוד 1.
- [ ] נייד — הפקדים נשברים לשתי שורות (flex-col) בלי גלישה אופקית.

### MEH-1040 — dialog מודאלי למחיקת ביקורת ב-/admin/reviews
- [ ] אין confirm() native — `/admin/reviews` → לחצי "מחקי" על ביקורת; **תוצאה מצופה:** נפתח dialog מודאלי (overlay כהה + כרטיס לבן, אותו visual כמו מחיקת קטגוריה ב-MEH-1023) — **לא** חלון confirm של הדפדפן.
- [ ] שמות בדיאלוג — **תוצאה מצופה:** הטקסט "למחוק את הביקורת של <משתמשת> על <עסק>?" עם השמות האמיתיים מהשורה.
- [ ] ביטול = אין מחיקה — לחצי "ביטול" (או Escape); **תוצאה מצופה:** הדיאלוג נסגר, הביקורת נשארת, לא נשלח DELETE.
- [ ] אישור = מחיקה — לחצי "מחקי" בדיאלוג; **תוצאה מצופה:** נשלח `DELETE /reviews/{id}`, הדיאלוג נסגר, השורה נעלמת + toast הצלחה. בזמן המחיקה שני הכפתורים מושבתים ("במחיקה...").
- [ ] כשל מחיקה — (סימולציה: ניתוק רשת) **תוצאה מצופה:** toast שגיאה, הדיאלוג נשאר פתוח.

### MEH-1023 Chunk B — dialog מודאלי למחיקת קטגוריה ב-/admin (טאב "תוכן")
- [ ] אין confirm() native — `/admin` → טאב "תוכן" → "קטגוריות" → לחצי "מחקו" על קטגוריה; **תוצאה מצופה:** נפתח dialog מודאלי (overlay כהה + כרטיס לבן, אותו visual כמו דיאלוג האישור ב-/admin/users) — **לא** חלון confirm של הדפדפן.
- [ ] שם הקטגוריה בדיאלוג — **תוצאה מצופה (עודכן ב-MEH-1034):** הטקסט הוא "מחיקת '<שם הקטגוריה>' — N בתי עסק משויכים" עם השם האמיתי והמספר האמיתי של בתי העסק המשויכים.
- [ ] ביטול = אין מחיקה — לחצי "ביטול"; **תוצאה מצופה:** הדיאלוג נסגר, הקטגוריה נשארת ברשימה, לא נשלח DELETE.
- [ ] אישור = מחיקה — לחצי "מחקו" בדיאלוג; **תוצאה מצופה:** נשלח `DELETE /admin/categories/{id}`, הדיאלוג נסגר, הרשימה מתרעננת בלי הקטגוריה. בזמן המחיקה הכפתור מציג "מוחקים…" ומושבת.
- [ ] הערה — ~~מספר בתי-העסק המשויכים לא מוצג~~ **טופל ב-MEH-1034:** הדיאלוג מציג את ה-count. מחיקת קטגוריה עדיין מנתקת אותה מכל בתי-העסק המשויכים (FK CASCADE).

### MEH-1034 — producer_count לקטגוריות ב-/admin (טאב "תוכן")
- [ ] Count בכל שורה — `/admin` → טאב "תוכן" → "קטגוריות"; **תוצאה מצופה:** בכל שורת קטגוריה מופיע "N בתי עסק" (0 לקטגוריה ריקה).
- [ ] Count בדיאלוג המחיקה — לחצי "מחקו" על קטגוריה עם בתי עסק משויכים; **תוצאה מצופה:** הדיאלוג מציג "מחיקת '<שם>' — N בתי עסק משויכים" עם המספר הנכון.
- [ ] API — DevTools Network → `GET /admin/categories`; **תוצאה מצופה:** כל שורה כוללת `producer_count`. ה-endpoint הציבורי `GET /categories` מחזיר `producer_count: null` (לא נשבר).

### MEH-1027 Chunk A — תפריט פעולות (overflow menu) ב-/admin/producers
- [ ] Kebab במקום inline — `/admin/producers` — איך לבדוק: בעמודת "פעולות" יש ⋮ בכל שורה; **תוצאה מצופה:** "השהה/הפעל", "שגריר", "סטורי" ו"מחקו" כבר לא inline — רק בתוך התפריט. "עריכה" (+"צפה" כשיש slug) נשארים inline.
- [ ] שורה ממתינה (pending) — סנני `pending`; **תוצאה מצופה:** "✓ אשר" + "בקשת השלמה" + "עריכה" inline ליד ⋮; בתפריט רק "מחקו" (אין השהה/שגריר/סטורי לעסק לא-מאושר).
- [ ] שורה מאושרת — **תוצאה מצופה:** בתפריט: השהה · שגריר (☆/⭐) · 📸 סטורי · מחקו (אדום, danger).
- [ ] סטורי מהתפריט — ⋮ → "📸 סטורי"; **תוצאה מצופה:** ה-StoryCardCanvas נפתח מתחת לשורה בדיוק כמו קודם (התנהגות ללא שינוי — רק המיקום זז).
- [ ] שגריר מהתפריט — ⋮ → "☆ שגריר" על עסק מאושר; **תוצאה מצופה:** trust tier מתעדכן כמו קודם (toggle זהה, רק מהתפריט).
- [ ] מחיקה מהתפריט — ⋮ → "מחקו"; **תוצאה מצופה:** עדיין `confirm()` native בשלב זה — שדרוג ל-dialog מודאלי הוא Chunk B (לא במהדורה זו).
- [ ] פתיחה/סגירה — לחיצה שנייה על ⋮ / לחיצה בחוץ / Escape סוגרים (Escape מחזיר פוקוס ל-⋮); בשולי הטבלה התפריט עשוי להיחתך ע"י מסגרת הטבלה (תכונה מוכרת של התפריט, זהה ל-/admin/users).
- [ ] נייד (iOS Safari + Chrome) — ⋮ נפתח ונסגר בטאץ'; הפעולות עובדות מהתפריט.

### MEH-1023 Chunk A — תפריט פעולות תפקיד (overflow menu) ב-/admin/users
- [ ] Kebab במקום inline — `/admin/users` — איך לבדוק: בעמודת "פעולות" של כל שורה יש כפתור "חסום" inline + כפתור שלוש-נקודות (⋮); **תוצאה מצופה:** "העלי לאדמין"/"הסירי הרשאות" כבר לא כפתורים inline — הם רק בתוך התפריט הנפתח.
- [ ] פתיחה/סגירה — לחצי על ⋮; **תוצאה מצופה:** תפריט נפתח לכיוון ההתחלה (ימין ב-RTL). לחיצה שנייה על ⋮ / לחיצה מחוץ לתפריט / מקש Escape → נסגר (Escape מחזיר פוקוס ל-⋮).
- [ ] Promote דרך התפריט — על משתמש שאינו אדמין פתחי ⋮ → "העלי לאדמין"; **תוצאה מצופה:** נפתח **אותו** דיאלוג אישור קיים; אישור → המשתמש הופך לאדמין (ללא שינוי בזרימה).
- [ ] Demote דרך התפריט — על אדמין רגיל (לא ראשי, לא את עצמך) פתחי ⋮ → "הסירי הרשאות" (אדום); **תוצאה מצופה:** דיאלוג אישור, אישור → הורדה מאדמין.
- [ ] אדמין ראשי (super-admin) — בשורת `levismadar80@gmail.com`; **תוצאה מצופה:** אין תפריט ⋮ (או ריק) — אין מה להציג; ה-tooltip של המנעול (🔒) עדיין מופיע בעמודת "תפקיד".
- [ ] השורה של עצמך (אדמין) — **תוצאה מצופה:** אין "הסירי הרשאות" בתפריט (isMe guard) — לא ניתן להוריד את עצמך.
- [ ] נגישות מקלדת — Tab ל-⋮ → Enter/Space פותח → פריטי התפריט נגישים ב-Tab, `aria-expanded` מתחלף.
- [ ] נייד (iOS Safari + Chrome) — התפריט נפתח מעל/מתחת לשורה בלי לגלוש מהמסך; טאץ' מחוץ לתפריט סוגר.

### MEH-1011 Chunk 2 — בקשת השלמה (admin UI)
- [ ] כפתור בקשת השלמה — `/admin/producers` (סנני `pending`) — איך לבדוק: בשורת עסק ממתין יש כפתור "בקשת השלמה" ליד "✓ אשר"; **תוצאה מצופה:** לחיצה פותחת מודל "בקשת השלמה מבית העסק" עם textarea + 2 צ'יפים מהירים.
- [ ] שליחת בקשה — במודל, לחצי צ'יפ "חסרה תמונה…" → הטקסט ממלא את ה-textarea → "שלחו בקשה"; **תוצאה מצופה:** toast הצלחה, המודל נסגר, ובשורה מופיע badge "ממתין להשלמה" + תאריך (התאריך מיושר LTR, לא נשבר ב-RTL). מייל נשלח לבעלת העסק (לוג/Resend).
- [ ] 422 auto-open — עסק ממתין **ללא תמונה** → לחצי "✓ אשר"; **תוצאה מצופה:** במקום toast שגיאה סתמי — נפתח מודל בקשת השלמה עם "חסרה תמונה — יש להעלות לפחות תמונה אחת" ממולא מראש + toast מידע "לא ניתן לאשר עדיין…". עסק בקטגוריית רישיון ללא מספר → prefill "חסר מספר רישיון יצרן".
- [ ] ניקוי trail — לאחר שהעסק העלה תמונה → "✓ אשר" מצליח (200); **תוצאה מצופה:** ה-badge "ממתין להשלמה" נעלם (approve מנקה `requested_changes`).
- [ ] **MEH-1051 WhatsApp לבעלת העסק** — שלחי בקשת השלמה לעסק ממתין **עם טלפון**; **תוצאה מצופה:** בנוסף למייל מגיעה הודעת WhatsApp מתבנית `producer_changes_requested_v1` עם שם העסק + הטקסט שהוזן בשורה אחת (בלי ירידות שורה). עסק **בלי טלפון** → הבקשה עדיין מצליחה (200), רק מייל, ולוג `[WHATSAPP] Producer changes_requested SKIPPED`.
- [ ] feedback ריק — במודל השאירי ריק → "שלחו בקשה"; **תוצאה מצופה:** toast שגיאה "יש לפרט מה נדרש להשלים." והבקשה לא נשלחת.
- [ ] Owner self-fetch — login כיצרן עם רישיון → `GET /producers/me` (DevTools) → המספר מופיע (`ProducerAdminOut` swap).
- [ ] Owner self-edit (renewal) — `PUT /producers/me` עם `producer_license_number: "9999999"` → 200 + המספר התעדכן.
- [ ] RTL mobile — פתחי את `/register/producer` במובייל אמיתי → label בעברית, input dir="ltr" (ספרות), warning inline ימינה, toggle "יש לי רישיון יצרן ↓" עם חץ נכון.
- [ ] **MEH-743 honey required** — בחרי "דבש" → השדה "מספר רישיון יצרן (חובה)" מופיע inline. submit ללא ערך → 422 "מספר רישיון יצרן חובה לקטגוריה זו". submit עם 1234567 → 200 OK.
- [ ] **MEH-743 olive-oil only optional** — בחרי "שמנים" בלבד → השדה לא מופיע, במקומו toggle אופציונלי. submit ללא ערך → 200 OK.

---

# Verification Protocol — 3-Tier Division of Labor

לפני כל verification of merged work או pre-merge PR, ה-3 tiers הבאים פועלים בסדר.
ה-rule הבסיסי: **כל tier בודק רק מה ש-tier הקודם לא יכול**. ספיר מבחינת mobile רק
לדברים שדורשים real-device perception.

## Tier 1 — Claude (chat assistant)

לפני בקשה מ-CC או מ-Smadar, Claude בודק content ישירות:

**Tools:**
- `web_fetch` על `https://staging.mehamakor.online` (production-ish state)
- `Vercel:web_fetch_vercel_url` על branch previews
  → bypasses Vercel Deployment Protection auth-block automatically
  → לא צריך לכבות protection ידנית
- `Vercel:get_access_to_vercel_url` — fallback אם web_fetch fails

**Claude מאמת automatically:**
- [ ] Strings present/correct (translations, Q7 plurals, brand voice)
- [ ] RTL `dir="rtl"` + `lang="he"` ב-html element
- [ ] ARIA labels (`aria-label`, `aria-describedby`)
- [ ] Meta tags (description, keywords, og:*, twitter:*)
- [ ] hreflang alternates (per Wave 6 SEO requirements)
- [ ] Tailwind responsive classes present (md:, lg:, sm:)
- [ ] RSC payload structure (component hierarchy, locale, messages namespace)
- [ ] Specific link hrefs (CTA targets, nav links)

**מה Claude לא יכולה (גם דרך web_fetch):**
- JS-dependent UI (Leaflet map render, modal states, dropdown opens)
- Animations / transitions
- Computed CSS (post-render width/height)
- Real interaction state (hover, focus, active)

## Tier 2 — Claude Code (CC)

CC רץ אחרי Tier 1 — לכל מה ש-Tier 1 לא יכול אבל אינו דורש human eyes.

**Capabilities:**
- bash + filesystem
- Playwright (אם הוגדר ב-repo) — JS render, screenshots, interaction
- Build/test execution (npm, pytest, jest)
- /adversarial-review, custom .claude/ scripts

**CC מאמת automatically:**
- [ ] Build clean (npm run build)
- [ ] All test suites green (pytest, jest, playwright)
- [ ] Code-level grep patterns (forbidden imports absent, required present)
- [ ] /adversarial-review on central components
- [ ] EN/HE messages parity (jq diff)
- [ ] Residual hardcoded count (.claude/scripts/i18n-scan.py)
- [ ] Schema/migration consistency (alembic check)
- [ ] Playwright smoke: critical pages load, expected text present
- [ ] Playwright form submit: fetch fires (mock backend)
- [ ] Screenshots @ 375px / 768px / 1440px → /tmp/screenshots/
  (attach to report ONLY if regression visually suspected)

**CC's report MUST collapse ✅ items:**
- ✅ items → single summary line (e.g., "All 14 auto-checks passed")
- ❌ items → STOP, file:line + issue, await fix
- ⏳ items → clean checklist for Smadar (max 5-7 items, each <30 sec on phone)

**מה CC לא יכול (real-device-only):**
- Touch tap-feel (size measurable, feel isn't)
- Animation smoothness on real CPU/GPU/network
- Font anti-aliasing (varies by OS/device)
- Color rendering (real screen color profile)
- Perceived latency (felt-fast threshold)

## Tier 3 — Smadar (mobile real device)

ספיר's mobile session reserved exclusively for items above.
**רף:** כל פריט ב-Tier 3 חייב להיות testable ב-<30 שניות על הטלפון.
אם פריט לוקח יותר → CC יכול לאמת אותו, ספיר לא צריכה.

**Smadar's checklist template:**
- [ ] Touch target tap-feel @ 375px (BottomNav, filter chips, CTAs)
- [ ] Animation smoothness on real device (hero parallax, marquee, dropdowns)
- [ ] Font rendering on Frank Ruhl Libre headlines (anti-aliasing)
- [ ] Perceived latency on async actions (newsletter submit, login, search)
- [ ] RTL overflow @ narrow viewports (360px-375px range)
- [ ] Color contrast on real screen (category card overlays, footer links)

## Anti-patterns (forbidden)

- ✗ Claude לעולם לא תבקש מ-Smadar לאמת content — ה-content נבדק ב-Tier 1
- ✗ CC לעולם לא תבקש מ-Smadar לאמת test outcomes — CC רץ tests ב-Tier 2
- ✗ CC לא ימסור wall של ✅ checkmarks ב-final report — Smadar קוראת רק ❌ + ⏳
- ✗ Smadar לא תבדוק content בעצמה אם Claude לא ביקשה ← waste of mobile session

---

## Product price validation (MEH-295 backend)

> Backend-only checklist. Frontend form ships in Phase 3 PR. Endpoint: `POST /producers/me/products` + `PUT /producers/me/products/:id`. All POSTs require a producer-role JWT.

- [ ] POST `price_min=0` — איך לבדוק: `curl -X POST -H "Authorization: Bearer $JWT" -d '{"name":"בדיקה","price_min":0}'`; **תוצאה מצופה:** 422 — Pydantic `ge=1` rejects.
- [ ] POST `price_min=10001` — איך לבדוק: same shape, body `{"name":"בדיקה","price_min":10001}`; **תוצאה מצופה:** 422 — Pydantic `le=10000` rejects.
- [ ] POST `price_min=50, price_max=30` — איך לבדוק: `{"name":"בדיקה","price_min":50,"price_max":30}`; **תוצאה מצופה:** 422 — `model_validator` rejects with `price_max must be greater than or equal to price_min`.
- [ ] POST `price_min` only — איך לבדוק: `{"name":"בדיקה","price_min":50}`; **תוצאה מצופה:** 201; response body has `price_min: "50.00"` (string per Pydantic v2 Decimal serialization), `price_max: null`.
- [ ] POST `price_min` + `price_max` — איך לבדוק: `{"name":"בדיקה","price_min":50,"price_max":80}`; **תוצאה מצופה:** 201; both fields serialized as strings: `"50.00"` and `"80.00"`.
- [ ] PUT preserves legacy `price_range` — איך לבדוק: pick a row with non-null `price_range` (e.g. `"₪45/ק״ג"`); `PUT /producers/me/products/:id` with body `{"name":"שם חדש"}` only; **תוצאה מצופה:** 200; `price_range` value unchanged in DB.
- [ ] Staging schema sanity — איך לבדוק (after Railway redeploy): `psql $DATABASE_URL_STAGING -c "\d products"`; **תוצאה מצופה:** columns `price_min numeric(10,2)` + `price_max numeric(10,2)` both present and nullable; `price_range varchar(50)` still present (legacy fallback).

### ProductsSection mount in the edit tab (MEH-999 follow-up)

> The product-catalog editor (`ProductsSection`) was defined but never mounted (0 render sites). It is now a card in the producer **edit tab**. NOTE: the Phase-3 QA lines below say `/settings` → "מוצרים" — that path never actually rendered the section; use the edit-tab path (`/producer/dashboard/edit`) instead until those lines are refreshed.

- [ ] Section visible — איך לבדוק: התחברי כיוצרת → `/producer/dashboard/edit`; **תוצאה מצופה:** בתחתית העמוד, מתחת לכרטיסי הקטגוריות/תמונות/מיקום, מופיע כרטיס "מוצרים" עם כפתור "הוסיפו מוצר".
- [ ] Empty state — איך לבדוק: יוצרת ללא מוצרים; **תוצאה מצופה:** מופיע empty-state "מוצר ראשון = בית עסק חי" עם CTA "+ הוסיפו מוצר ראשון".
- [ ] Add/edit/delete end-to-end — איך לבדוק: הוסיפי מוצר (שם + מחיר), ערכי אותו, מחקי אותו; **תוצאה מצופה:** כל פעולה נשמרת מול `/producers/me/products` ומתעדכנת ברשימה מיידית (POST/PUT/DELETE).

### Phase 3 — frontend form + display (MEH-295 Phase 3)

> Manual QA on Vercel preview at mobile width 375px. Login as producer → the edit tab (`/producer/dashboard/edit`) → "מוצרים" section → "הוסיפו מוצר". (Historically read `/settings`; the section was never mounted there.)

- [ ] Add range — איך לבדוק: open form, name="טסט-טווח", price_min=50, price_max=80, submit; **תוצאה מצופה:** card נוסף לרשימה עם "₪50–₪80" ב-`text-accent`. Producer detail page shows same range with `font-medium`.
- [ ] Add single price — איך לבדוק: name="טסט-יחיד", price_min=45, price_max ריק, submit; **תוצאה מצופה:** card עם "₪45" בלבד.
- [ ] Legacy fallback — איך לבדוק: צפי ברשימת מוצרים שכבר קיימת ב-DB עם `price_range="₪45/ק״ג"` ו-`price_min=NULL`; **תוצאה מצופה:** card מציג את הטקסט הישן `"₪45/ק״ג"` ראו שפלא — fallback לעמודה הישנה. (אין need לעדכן ידנית; המוצר הישן ממשיך כמות שהוא עד עריכה עתידית.)
- [ ] Validation — empty min — איך לבדוק: try submit עם price_min ריק; **תוצאה מצופה:** "הכניסי מחיר" + לא נשלחה בקשה.
- [ ] Validation — min < 1 — איך לבדוק: הזיני 0 או 0.5 ב-min; **תוצאה מצופה:** "המחיר חייב להיות לפחות 1 ₪".
- [ ] Validation — over cap — איך לבדוק: הזיני 10001 ב-min או ב-max; **תוצאה מצופה:** "המחיר לא יכול לעבור 10,000 ₪".
- [ ] Validation — max < min — איך לבדוק: min=50, max=30; **תוצאה מצופה:** "מחיר עד חייב להיות גבוה ממחיר מ-".
- [ ] Labels persist — איך לבדוק: הקלידי טקסט בשם / תיאור / מחיר; **תוצאה מצופה:** התוויות מעל השדה נשארות גלויות (לא placeholder שנעלם). Bug-2 fix.
- [ ] Submit copy — נקבה — איך לבדוק: צפי בכפתור הסבמיט; **תוצאה מצופה:** "הוסיפי מוצר" / בזמן שמירה "מוסיפה...". לא "שמור" / "שומרת".
- [ ] RTL mobile — איך לבדוק: 375px, פתחי טופס מוצר חדש; **תוצאה מצופה:** ללא scroll אופקי, התוויות מיושרות לימין, שני שדות המחיר ב-grid 2-עמודות נכנסים.

### Dietary cleanup verification (MEH-479 — closes MEH-293)

> Smoke test on Vercel preview after MEH-479 merge. Confirms the destructive column drop didn't break the per-product flow that PR #2 wired up.

- [ ] Smoke — `\d producers` — איך לבדוק: `railway connect Postgres` (staging), `\d producers`; **תוצאה מצופה:** טור `gluten_free` / `vegan` / `lactose_free` כבר לא מופיעים. `grass_fed` / `organic_certified` עדיין שם.
- [ ] Smoke — fresh signup — איך לבדוק: `/register/producer` במובייל; **תוצאה מצופה:** הטופס לא מציג checkboxes לתזונה (כבר הוסרו ב-PR #2). הרשמה עוברת בלי 5xx (auth.py כבר לא כותב `gluten_free=` etc.).
- [ ] Smoke — add product with vegan checked → card badge — איך לבדוק: התחברי כיוצרת חדשה, `/settings` → "מוצרים" → "הוסיפי מוצר", סמני 🥦 טבעוני, שמרי. פתחי `/producers`; **תוצאה מצופה:** ה-card שלך מציג badge "טבעוני" (`has_vegan_products` aggregated מ-`Product.is_vegan` דרך `attach_badge_fields`).
- [ ] Smoke — `?vegan=true` filter — איך לבדוק: `/producers?vegan=true`; **תוצאה מצופה:** רק יוצרות עם לפחות מוצר אחד מסומן `is_vegan=TRUE` מופיעות. URL contract של ה-chip לא השתנה.
- [ ] Regression — admin form — איך לבדוק: `/admin/producers/new` או edit; **תוצאה מצופה:** עדיין אין checkboxes לתזונה (הוסרו ב-PR #2). שמירה עוברת בלי שדות הישנים (Pydantic schema cleaned ב-MEH-479).
- [ ] Regression — `/admin` listing — איך לבדוק: `/admin/producers`; **תוצאה מצופה:** טבלה לא תופסת 5xx (ה-`ProducerListOut` schema לא מבקש יותר את 3 השדות הישנים מה-DB).
- [ ] Regression — badge fixture stale — איך לבדוק: ה-jest test `MEH-479 guard — legacy producer.vegan alone does NOT trigger badge` מאומת ב-CI; **תוצאה מצופה:** ירוק (אם נכשל → רגרסיה ל-7-day overlap, להזעיק).

---

### Dietary checkboxes per product (MEH-293 PR #2)

> Manual QA on Vercel preview at mobile width 375px. Login as producer → `/settings` → "מוצרים". Backend live with `is_X` columns + `has_X_products` aggregated read (PR #1 already merged).

- [ ] Add form — sees 3 checkboxes — איך לבדוק: `/settings` → "מוצרים" → "הוסיפי מוצר"; **תוצאה מצופה:** מתחת לרשת המחיר (price_min / price_max) ולפני העלאת התמונה מופיעה כותרת "סימוני תזונה (אופציונלי)" + 3 checkboxes (🌾 ללא גלוטן, 🥦 טבעוני, 🥛 ללא לקטוז).
- [ ] Add form — 375px layout — איך לבדוק: באותו טופס במובייל (≤640px); **תוצאה מצופה:** 3 ה-checkboxes מסודרות בעמודה אחת (1-col), לא דחוסות.
- [ ] Add form — ≥640px layout — איך לבדוק: באותו טופס בדסקטופ (≥640px); **תוצאה מצופה:** 3 ה-checkboxes ב-3 עמודות (`grid-cols-3`).
- [ ] Add — vegan checked → POST body — איך לבדוק: סמני "🥦 טבעוני", השלימי שם + price_min, לחצי "הוסיפי מוצר"; **תוצאה מצופה:** ב-network tab, ה-POST `/producers/me/products` כולל `is_vegan: true, is_gluten_free: false, is_lactose_free: false`. ה-response מכיל `is_vegan: true`.
- [ ] Edit form — sees 3 checkboxes — איך לבדוק: לחצי Pencil ("ערכי") על מוצר קיים; **תוצאה מצופה:** הטופס inline כולל את אותו block של 3 checkboxes באותו מיקום (אחרי המחיר, לפני התמונה). אם המוצר נשמר עם `is_vegan=true`, ה-checkbox טעון מסומן.
- [ ] Edit — toggle off → PUT body — איך לבדוק: ערכי מוצר עם `is_vegan=true`, הסירי את הסימון, "שמרי שינויים"; **תוצאה מצופה:** ה-PUT body כולל `is_vegan: false`. השורה חוזרת ל-display mode.
- [ ] Card aggregation — איך לבדוק: אחרי הוספת מוצר עם `is_vegan=true`, פתחי `/producers` כצרכן; **תוצאה מצופה:** ה-ProducerCard של אותה בעלת עסק מציג badge "טבעוני" (זה מ-`has_vegan_products: true` שה-backend מחזיר).
- [ ] Card aggregation — toggle off — איך לבדוק: ערכי את המוצר היחיד עם `is_vegan=true` והסירי את הסימון; **תוצאה מצופה:** רענני `/producers` — ה-card כבר לא מציג badge "טבעוני" (כי `has_vegan_products` הפך ל-`false`).
- [ ] Filter on /producers — איך לבדוק: `/producers?vegan=true` (או דרך ה-chip); **תוצאה מצופה:** רק בעלות עסק עם לפחות מוצר אחד שמסומן `is_vegan=true` מופיעות. בעלות עסק עם 0 מוצרים נופלות (התנהגות מכוונת — MEH-293 fix).
- [ ] Register form — אין יותר checkboxes — איך לבדוק: `/register/producer`; **תוצאה מצופה:** לא מופיעים יותר 3 ה-checkboxes (gluten_free / vegan / lactose_free) או הכותרת "סימוני תזונה (אופציונלי)" ברמת בית העסק. הטופס מסתיים עם CategorySelector ועובר ל-Legal consent ישירות.
- [ ] Admin form — אין יותר checkboxes — איך לבדוק: `/admin/producers/new` או edit; **תוצאה מצופה:** הסטריפ של הצ'קבוקסים מציג רק `grass_fed` ו-`is_verified` (3 ה-dietary הוסרו). שמירה עוברת.
- [ ] Legacy producer (overlap) — איך לבדוק: בעלת עסק שנרשמה לפני MEH-293 ויש לה `producer.vegan=true` אבל אין מוצרים מסומנים; **תוצאה מצופה:** ה-card שלה עדיין מציג badge "טבעוני" (legacy fallback ב-`lib/badges.js` — `has_vegan_products || vegan`). הסרה ב-+7-day cleanup PR.

---

### Product Edit flow (MEH-470)

> Manual QA on Vercel preview at mobile width 375px. Login as producer with at least 2 existing products → `/settings` → "מוצרים".

- [ ] Open edit — איך לבדוק: לחצי על כפתור Pencil ("ערכי") ליד מוצר קיים; **תוצאה מצופה:** השורה מוחלפת בטופס עריכה inline (לא modal); השדות populated עם הערכים הנוכחיים (שם / תיאור / price_min / price_max / image_url).
- [ ] Edit name only — איך לבדוק: שני את השם, לחצי "שמרי שינויים"; **תוצאה מצופה:** השורה חוזרת ל-display mode עם השם החדש; price_range / price_min / price_max ללא שינוי בתצוגה.
- [ ] Legacy fallback edit — איך לבדוק: ערכי מוצר ישן עם price_range="₪45/ק״ג" ו-price_min=NULL; **תוצאה מצופה:** מעל הטופס מופיע ה-hint: "המחיר הקיים: ₪45/ק״ג (לא בפורמט החדש — הזיני מחיר מספרי לעדכון)". הזיני price_min=45, שמרי; **תוצאה:** התצוגה עוברת ל-"₪45" (פורמט חדש).
- [ ] Validation — min=0 — איך לבדוק: בעריכה הזיני 0 ב-price_min; **תוצאה מצופה:** "המחיר חייב להיות לפחות 1 ₪", לא נשלחה PUT.
- [ ] Validation — max < min — איך לבדוק: בעריכה min=50, max=30; **תוצאה מצופה:** "מחיר עד חייב להיות גבוה ממחיר מ-", לא נשלחה PUT.
- [ ] Cancel — איך לבדוק: לחצי "ערכי" על מוצר A, שני את השם, לחצי "בטלי"; **תוצאה מצופה:** הטופס נסגר, השם בתצוגה לא השתנה, אין PUT ב-network tab.
- [ ] Switch edit rows — איך לבדוק: לחצי "ערכי" על A (אל תשמרי), לחצי "ערכי" על B; **תוצאה מצופה:** A חוזר ל-display mode, B נפתח עם הערכים הנכונים שלו (לא של A).

---

## Producer status labels (MEH-294)

> Render-only Hebrew labels for `producer.status`. DB values unchanged (intentional per MEH-56). Source of truth: `frontend/lib/producer-status.js`.

- [ ] Admin chip — `pending_whatsapp` — איך לבדוק: `/admin/producers`, סנני לפי `pending_whatsapp`; **תוצאה מצופה:** chip קורא "ממתינה לאימות WhatsApp" עם רקע `bg-orange-100`.
- [ ] Admin chip — `pending` — **תוצאה מצופה:** "ממתינה לאישור האדמין", רקע `bg-yellow-100`.
- [ ] Admin chip — `approved` — **תוצאה מצופה:** "מאושר", רקע `bg-primary` (לבן טקסט).
- [ ] Admin chip — `rejected` — **תוצאה מצופה:** "נדחה", רקע `bg-red-100`.
- [ ] Admin chip — `inactive` — **תוצאה מצופה:** "לא פעילה", רקע `bg-gray-200`.
- [ ] Admin activity feed — איך לבדוק: `/admin` → סקציית "פעילות אחרונה"; **תוצאה מצופה:** ליד שם בית העסק מופיע `(label מתורגם)` ולא קוד גולמי.
- [ ] Dashboard companion copy — איך לבדוק: התחברי כיוצרת בסטטוס `pending_whatsapp` → `/producer/dashboard`; **תוצאה מצופה:** מתחת לכפתור "השלימי פרופיל ←" מופיעה שורה "לא קיבלת הודעה? השלימי את הפרופיל כאן — עריכת פרופיל"; "עריכת פרופיל" הוא link ל-`/settings`.
- [ ] Unknown status fallback — איך לבדוק (סנכרונית): אם ה-DB מחזיר קוד שלא במפה; **תוצאה מצופה:** chip מציג את הקוד הגולמי (לא `undefined`, לא קריסה).

---

## Password policy wire-up (MEH-306 sub-A backend)

> Backend behavior only — UI checklist + Hebrew error rendering ship with sub-B.

- [ ] Existing user login regression — איך לבדוק: התחברי עם user שנוצר לפני ה-PR (DB: `password_changed_at IS NULL`); **תוצאה מצופה:** 200 + JWT (MEH-305 fail-open path).
- [ ] Fresh signup floor — `POST /auth/register` עם `password` באורך 8 תווים → **422** עם `{"detail":[{"loc":["body","password"],"type":"string_too_short"}]}`. עם 12 תווים unique לא-deny-listed → **200**.
- [ ] Fresh signup deny-list — `POST /auth/register` עם `password=unbelievable` (12 תווים, ב-deny_list_10k) → **422** עם `detail.failures=["too_common"]`.
- [ ] /auth/check-password live preview — `POST /auth/check-password {"candidate":"unbelievable"}` → **200** עם `{"ok":false,"failures":["too_common"]}`.
- [ ] Reset reuse block — בקשי reset על account עם סיסמה `Foo!Bar123Bz`; פתחי את הקישור; שלחי `new_password=Foo!Bar123Bz` → **422** עם `same_as_current`.
- [ ] Reset session invalidation — login → קבלי JWT — בקשי reset → השלימי reset עם סיסמה חדשה → ה-JWT הקודם על `/auth/me` מחזיר **401** עם `session_invalidated_by_password_change`.
- [ ] Change password — `PATCH /users/me/password` עם current לא נכון → **403**; עם current ו-new זהים → **422** `same_as_current`; עם new < 12 → **422**; עם new תקין → **204** + `password_changed_at` מעודכן ב-DB.
- [ ] Forgot-password rate limit (per-email) — שלחי 6 בקשות `/auth/forgot-password` עם אותו email תוך פחות מ-15 דקות → 5 ראשונות **200**, ה-6th **429**.
- [ ] Forgot-password rate limit (per-IP) — שלחי 11 בקשות עם 11 emails שונים מאותה כתובת IP → 10 ראשונות **200**, ה-11th **429**.
- [ ] MEH-395 length-check bypass (security-critical) — `POST /auth/register {"password":"          aa"}` (12 raw chars, 2 post-strip) → **422** `string_too_short` (Pydantic BeforeValidator strips before min_length runs). אסור שהמערכת תיקבל ותhash את "aa".
- [ ] MEH-395 deny-list strip — `POST /auth/check-password {"candidate":"unbelievable    "}` (16 תווים: 12 + 4 רווחים) → **200** עם `{"ok":false,"failures":["too_common"]}` (Pydantic מחזיר "unbelievable", service מחזיק too_common).

---

## XSS sanitization sweep (MEH-329)

- [ ] HTML stripped server-side — איך לבדוק:
  1. בדף הרשמת בית עסק, הזיני בתיאור: `<script>alert(1)</script>תיאור עם הסבר`
  2. שמרי וצפי בפרופיל הציבורי
  3. **תוצאה מצופה:** הטקסט מוצג ללא אזהרת alert; ה-`<script>` נחתך ב-DB; רואים רק את הטקסט הנקי
- [ ] טופס "מהמטבח של השכן" — אותו דבר על `description` ו-`location_notes`
- [ ] טופס "צרי קשר" (`/contact`) — הזיני `<img src=x onerror=alert(1)>` בתוכן ההודעה; **תוצאה:** ההודעה נשמרת ב-DB ללא ה-tag

---

## ~~Recipe ingredient cascade (MEH-311)~~

> **MEH-587 (2026-05-15):** section removed — `recipes` and
> `recipe_ingredients` dropped (chunk 0/4). The cascade contract this
> section tested no longer has a surface to exercise. See CHANGELOG +
> migration `d7e3c9a82f5b`.

---

## MEH-51 — Trust Ladder + Kashrut Badges (PR #183)

- [ ] ProducerCard: tier 3 producer shows "✅ עסק מאומת" green pill — סמני `is_verified=true` בDB לעסק → ProducerCard צריכה להציג badge ירוק
- [ ] ProducerCard: tier 1/2 producer shows no badge — עסק עם phone_verified=false, is_verified=false → אין badge
- [ ] ProducerCard: tier 5 (ambassador=true) shows "🏅 שגרירת מהמקור" dark pill
- [ ] ProducerDetail: TrustBadge shows next to name in header badge row
- [ ] ProducerDetail: KashrutBadgeStrip shows below highlights strip when kashrut_badges non-empty — הוסיפי `kashrut_badges=["badatz"]` בDB → strip עם "בדצ׳ה" מופיע
- [ ] KashrutBadgeStrip: expiry warning pill shows when kashrut_expires_at within 30 days — שיני expires_at ל-7 ימים קדימה → "⚠️ תעודה פגה בקרוב"
- [ ] KashrutBadgeStrip: no strip rendered when kashrut_badges empty (no regression to kosher text)
- [ ] /register/producer: phone verification step 4 appears after submit if producer has phone
- [ ] /register/producer: "שלחי לי קוד" button → POST /producers/me/verify-phone (check Twilio logs or check DB phone_otp_tokens)
- [ ] /register/producer: correct OTP code → phone_verified=true in DB
- [ ] /register/producer: wrong OTP code → "קוד שגוי או פג תוקף" error message
- [ ] /register/producer: "אאמת מאוחר יותר" → skips to confirmation (step 5)
- [ ] /admin/kashrut: page loads with pending requests list — צרי בקשה דרך POST /producers/me/kashrut-request → מופיעה בטבלה
- [ ] /admin/kashrut: אשרי button → badge added to producer.kashrut_badges in DB + kashrut_verified_at set
- [ ] /admin/kashrut: דחי button → opens modal with notes input → reject saves notes to DB
- [ ] /admin/kashrut: filter by status (pending/approved/rejected)
- [ ] POST /admin/producers/{id}/set-ambassador → ambassador=true → trust_tier=5 in GET /producers response
- [ ] Rate limiting: 3 OTP sends per 10 min per producer, 5 confirms per minute

רשימת בדיקות ידניות על הסביבה החיה לפני שחרור לפרודקשן.
פורמט: `[ ] Test — איך לבדוק — תוצאה מצופה`

---

## Producer Detail Page (feature/meh-producer-detail-redesign, 2026-04-18)

- [ ] Mobile 375px: producer name visible above fold without scrolling — פתחי דף עסק ב-DevTools מובייל 375px → h1 נראה מבלי לגלול
- [ ] Mobile: inline CTA visible above fold — כפתור יצירת קשר נראה מיד מתחת לשם
- [ ] Mobile: scroll past CTA → sticky bar slides in — גלולי מתחת לכפתור → StickyContactBar מגלשת מלמטה
- [ ] Mobile: scroll back to CTA → sticky bar slides out — גלולי חזרה למעלה → הבר נעלמת
- [ ] Vacation state: banner visible, CTA muted, sticky bar muted — שיני `availability_status` ל-`vacation` בDB → banner ענבר ← כפתור ירוק כהה + "יחזרו בקרוב"
- [ ] No images: category emoji + initials placeholder (not leaf) — עסק ללא תמונות → placeholder 120px עם emoji + 2 אותיות ראשונות
- [ ] With images: first image loads eagerly — פתחי Network tab → `images[0]` נטען עם `priority` (preload link בhead)
- [ ] Desktop: no duplicate PrimaryContactButton — ב-lg viewport → CTA רק בsidebar, לא בcolumn הראשי
- [ ] Reviews: not fetched until section scrolls into view — פתחי Network tab → אין בקשה ל-`/reviews` בטעינה; מופיעה רק כשגוללים לביקורות
- [ ] Gallery dots: 44px tap targets on mobile — Inspect element → כל dot button `min-h-[44px] min-w-[44px]`
- [ ] Review dates: display correctly in RTL — ביקורת עם תאריך → התאריך מוצג ב-`dir="ltr"` (לא הפוך)
- [ ] contact_name shows in main column — עסק עם contact_name → "מאחורי העסק: [שם]" מתחת ל-short_description
- [ ] highlights strip shows correct chips — grass_fed=true → 🌾 מרעה חופשי; delivery_areas non-empty → 🚚 משלוח

---

## Legal pages (אפריל 2026)

- [ ] /privacy — פתחי בדפדפן — מכיל "תיקון 13" ושם Cloudinary/Google
- [ ] /terms — פתחי בדפדפן — מכיל "חוק רישוי עסקים" ו-18+
- [ ] /contact — מלאי טופס ושלחי — התגובה "תודה! נחזור אליך בקרוב 🌿"
- [ ] /contact — אחרי שליחה — מגיע אימייל ל-`CONTACT_EMAIL` (`levismadar80@gmail.com`) עם שם/אימייל/הודעה בגוף, `From:` גם הוא `levismadar80@gmail.com` (לא spoofed)
- [ ] /contact — אחרי שליחה — יש שורה ב-`contact_messages` עם הערכים הנכונים (בדקי דרך `/admin` או `psql`)
- [ ] /contact — שלחי 6 פניות ברצף מאותה IP — השישית מחזירה 429
- [ ] /contact — זמני השבת של SMTP (או SMTP_USER ריק) — הטופס עדיין מחזיר 200 וה-DB שומר את השורה (fail-open)
- [ ] /accessibility — פתחי בדפדפן — מכיל תאריך עדכון ופרטי קשר
- [ ] Footer — גללי למטה — 4 לינקים: מדיניות / תנאי / נגישות / קשר
- [ ] Cookie banner — כנסי בחלון פרטי — מופיע עם 2 כפתורים
- [ ] "רק הכרחיים" — לחצי — banner נעלם, analytics לא נטען
- [ ] Producer registration — נסי לשלוח בלי checkboxes — כפתור disabled (גם checkbox הרישיונות וגם checkbox תנאי השימוש חובה)
- [ ] DirectoryDisclaimer — כנסי לדף יצרן — disclaimer מוצג מעל כפתור הדיווח
- [ ] DirectoryDisclaimer — גללי את גריד "מהמטבח של השכן" — כל כרטיסייה מציגה את ה-disclaimer בתחתית

---

## Security — POST /producers auth (PR #33)

- [ ] `curl -X POST /api/producers -d '{...}' -H "Content-Type: application/json"` ללא Authorization — 401
- [ ] אותה קריאה עם JWT תקף — 201, שורה חדשה ב-`producers` עם `status=pending`
- [ ] `pytest tests/test_api.py::TestProducers -v` על staging — כל 9 הבדיקות ירוקות כולל 4 החדשות: `test_post_producers_requires_auth`, `test_post_producers_rejects_invalid_token`, `test_post_producers_with_auth_creates_pending_producer`, `test_post_producers_with_blocked_user_fails`
- [ ] הזרימה הציבורית `POST /auth/register/producer` עדיין עובדת ללא אימות (לא הושפעה מהתיקון)

---

## Events (קהילה — אירועים מקומיים)

- [ ] /events — נטען עם פילטרים לפי עיר + תאריך
- [ ] /events/new — טופס עם 12 שדות בעברית (שם, תיאור, עיר, תאריך, שעה, מחיר, קיבולת, קטגוריה, תמונה, אימייל יצירת קשר, וואטסאפ, סוג אירוע)
- [ ] שלחי אירוע בדיקה — מגיע pending ב-/admin/events
- [ ] אשרי — מופיע ב-/events הציבורי
- [ ] "נשארו X מקומות" — מופיע כשנשאר מקום
- [ ] אימייל ל-`ADMIN_EMAIL` — מגיע כשמוגש אירוע חדש
- [ ] אימייל למארח — מגיע כשמאושר/נדחה

---

## Filter chips — two-row layout (feature/meh-two-row-filter-chips, אפריל 2026)

### /map — mobile (375px)
- [ ] פתחי /map בחלון 375px — שורת קטגוריות מוצגת (כל · בשר ועוף · ...) ושורת תכונות מוצגת מתחתיה (🚚 משלוח אליי · ✓ מאומתים · ...)
- [ ] שתי שורות — edge-fade משני הצדדים (ימין + שמאל)
- [ ] גללי בשורת הקטגוריות שמאלה — גריד נגלל, הצ'יפ הראשון לא נכרת (סיום עם w-8 spacer)
- [ ] לחצי על "לחם ומאפה" (הצ'יפ בקצה שמאל) — הצ'יפ נצבע bg-primary **ומתגלל אוטומטית לתוך ה-viewport** (scrollIntoView)
- [ ] לחצי על "בשר ועוף" — הצ'יפ נצבע bg-primary; תחת שורת התכונות מופיע tag ירוק "× בשר ועוף" + קישור "× נקי הכל"
- [ ] לחצי על "🌿 אורגני" — tag נוסף "× 🌿 אורגני" מופיע ליד הקודם
- [ ] לחצי על × בתוך ה-tag "× בשר ועוף" — הסינון מוסר, הצ'יפ "בשר ועוף" כבה, "כל" שוב פעיל
- [ ] לחצי על "× נקי הכל" — כל הסינונים מאופסים, אזור ה-tags נעלם
- [ ] בדיקת responsive — פתחי ב-375 / 430 / 768 / 1024 / 1280px — בכל גודל אין צ'יפ שנכרת ללא fade נראה, הצ'יפ הפעיל תמיד גלוי

### /map — desktop
- [ ] פתחי /map — sidebar מציג שתי שורות צ'יפים (קטגוריה + תכונות) + שורת סיכום כשיש סינון פעיל

### /map — כשל הרשאת מיקום פותח חיפוש עיר (geo PERMISSION_DENIED)
- [ ] /map → לחצי על כפתור ה-GPS (🎯 "קרוב אליי") → **סרבי** להרשאת מיקום בדפדפן — איך לבדוק: בדפדפן/מובייל בחרי "Block"/"חסום" בבקשת המיקום — **תוצאה מצופה:** נפתח LocationModal (חיפוש עיר + ערים פופולריות), לא toast בלבד
- [ ] בחרי עיר ב-modal שנפתח (חיפוש או צ'יפ עיר פופולרית) — **תוצאה מצופה:** ה-modal נסגר, רשימת בתי העסק ב-/map מסוננת לפי אותה עיר (כמו היום, ללא geocoding/זום)
- [ ] /map → GPS → סרבי, ואז סגרי את ה-modal — **תוצאה מצופה:** אין בקשת הרשאה חוזרת אוטומטית (no re-prompt); הדפדפן לא שואל שוב מעצמו
- [ ] /map → GPS → סמלצי כשל טכני (timeout/מיקום לא זמין, לא סירוב) — איך לבדוק: DevTools → Sensors → Location: "Unavailable", או נתקי GPS — **תוצאה מצופה:** toast שגיאה בלבד ("המיקום שלך לא זמין" / "לקח יותר מדי זמן"), **ללא** פתיחת modal
- [ ] חזרי על הסירוב גם דרך כפתור ה-GPS בשורת הסינון (mobile sticky bar) וגם דרך ה-flow השני — שני ה-paths פותחים את אותו modal

### דף הבית — filters מעל גריד היצרנים
- [ ] פתחי דף הבית — שורת תכונות אחת (כשר · אורגני · משלוח · מאומת בלבד) עם edge-fade בצד שמאל
- [ ] לחצי "אורגני" — הצ'יפ נצבע; שורת סיכום "מסנן לפי: אורגני" מופיעה מעל הגריד
- [ ] הפעילי 2 צ'יפים — הסיכום מציג את שניהם מופרדים ב-·
- [ ] כבי את כל הצ'יפים — שורת הסיכום נעלמת

---

## Analytics — Producer + Admin dashboards (feature/producer-analytics, April 2026)

### Tracking infrastructure
- [ ] GET /producers/{id} — פתחי את עמוד היצרן פעם אחת — יש שורה חדשה ב-`producer_page_views` עם `viewer_ip_hash` שאינו null, `city` null (לא מחוברת), `referrer` null
- [ ] GET /producers/{id}?from=search — פתחי עם ה-param — שורה חדשה עם `referrer='search'`
- [ ] GET /producers/{id} עם Authorization header של משתמשת שלה city='תל אביב' — שורה חדשה עם `city='תל אביב'`
- [ ] `curl -H "User-Agent: Googlebot/2.1" /producers/{id}` — 200 תקין אבל **אין** שורה חדשה (bot filter)
- [ ] POST /producers/{id}/whatsapp-click — 200 + שורה ב-`producer_whatsapp_clicks`
- [ ] POST 11 קריאות ברצף מאותה IP — השישית עד ה-עשירית: 200; ה-11: 429 (rate limit 10/min)
- [ ] POST /producers/bad-uuid/whatsapp-click — 404, אין שורה

### Producer dashboard (/producer/dashboard)
- [ ] התחברי כיצרן — הדף מציג שם + כפתור זמינות היום + 6 כרטיסיות סטטיסטיקה + 2 תרשימים + 3 quick links
- [ ] כרטיסיית "צפיות בפרופיל" מציגה 3 מספרים: `last_7d / last_30d / total`
- [ ] כרטיסיית "הופעות בחיפוש" מציגה את אותו פורמט (רק צפיות עם `referrer='search'`)
- [ ] כרטיסיית "לחיצות ווטסאפ" מציגה 3 מספרים מ-`producer_whatsapp_clicks`
- [ ] כרטיסיית "עוקבות" מציגה את הספירה הכללית + `+X השבוע`
- [ ] כרטיסיית "דירוג ממוצע" מציגה מספר עם decimal + "מתוך X ביקורות"
- [ ] כרטיסיית "מוצרים פעילים במטבח" סופרת רק home_products של **המשתמשת המחוברת** עם `is_active=true`
- [ ] תרשים "צפיות ב-30 הימים האחרונים" — SVG line chart עם 30 נקודות, תוויות תאריך בהתחלה/אמצע/סוף
- [ ] תרשים "ערים מובילות" — horizontal bars עד 5 ערים; אם אין נתונים מציג טקסט fallback
- [ ] לחיצה על WhatsApp בעמוד יצרן (לא משלך) — ב-Network tab רואים POST /whatsapp-click sendBeacon נשלח לפני פתיחת חלון wa.me
- [ ] חזרה ל-/producer/dashboard — ספירת whatsapp_clicks עלתה ב-1

### Admin dashboard (/admin)
- [ ] סה״כ תצוגה: 4 stat cards ראשיים + 4 משניים (new_users_this_week, new_producers_this_week, total_events, total_experiences) + alert cards + 2 גרפים + פאנל בריאות שרת + פעילות
- [ ] "DAU — 30 ימים אחרונים" — line chart עם 30 נקודות, מבוסס `users.last_active_at`
- [ ] ערים מובילות (עד 10) — מצטבר מ-`producer_page_views.city` על פני **כל** היצרנים
- [ ] פאנל בריאות שרת מציג `response_time_avg_ms` ו-`requests_per_minute` + הערה "per-process בזיכרון"
- [ ] על בוט עם traffic בסיסי (curl /producers), ספירת `sample_count` עולה, avg וכו׳ מתעדכנים
- [ ] אחרי redeploy של Railway — הפאנל מתאפס (ok)

### Vacation mode toggle (/admin/settings) — MEH-509 PR2a
- [ ] מצב חופשה — /admin/settings → toggle on → set date → save → toast → refresh → state persists. Toggle off → toast → refresh → date cleared. — תוצאה מצופה: state persists, date cleared on deactivate.
- [ ] Activate without date — toggle on, leave date empty → save button disabled + inline red warning "חובה לציין תאריך חזרה כשמצב חופשה מופעל". — תוצאה מצופה: cannot submit until date is set.
- [ ] Server-side guard — DevTools Network tab → POST /admin/settings/vacation `{active: true, return_date: null}` → 422. — תוצאה מצופה: Pydantic model_validator rejects.

### AI risk-score badge (MEH-509 PR3 — admin only)
- [ ] Fresh signup — sign up a new test producer with phone via `/auth/register/producer` → wait ~10 seconds → `/admin/producers` — תוצאה מצופה: new row appears with color-coded risk badge (green ≤30 / yellow 31-70 / red >70 / grey "אין מידע" if Anthropic was down).
- [ ] Tooltip — hover the risk badge → תוצאה מצופה: tooltip surfaces the full Hebrew reasoning text (or "טרם דורג" if score is NULL).
- [ ] Direct endpoint — `curl -H "Authorization: Bearer <admin-jwt>" https://<staging>/admin/producers/<id>/risk-score` → תוצאה מצופה: `{"score": <0-100 or null>, "reasoning": "<hebrew or null>"}`.
- [ ] Auth gate — same curl without JWT → תוצאה מצופה: 401/403; with consumer-role JWT → 403.
- [ ] Fail-open smoke — temporarily unset `ANTHROPIC_API_KEY` in Railway staging, sign up a producer, restore the key. תוצאה מצופה: signup completes 200, badge shows grey "אין מידע", logs show `[RISK] ANTHROPIC_API_KEY not set — skipping score`.

### WhatsApp webhook receiver (MEH-509 PR2c)
- [ ] GET challenge in staging — `curl 'https://<staging-railway-url>/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=hello'` — תוצאה מצופה: `200 hello` (plain text). Wrong token → 403.
- [ ] Meta Console verify — Meta Developer Console → WhatsApp → Configuration → Edit Webhook → Callback URL `https://<staging-railway-url>/webhook/whatsapp` + Verify Token = the env value → click "Verify and save". תוצאה מצופה: ✅ green checkmark; if 403, double-check `WHATSAPP_VERIFY_TOKEN` matches exactly (no whitespace, no quotes).
- [ ] Subscribe to messages field — Meta Console → toggle "messages" subscription on.
- [ ] Real inbound smoke — send a WhatsApp message from your personal phone to `+972 55-255-3744`. Within ~5 seconds: `psql $DATABASE_URL_STAGING -c "SELECT id, from_phone, body, received_at, bot_replied FROM inbound_messages ORDER BY received_at DESC LIMIT 1;"` — תוצאה מצופה: row exists with your phone + message body + bot_replied=false.
- [ ] Forged signature rejection — `curl -X POST https://<staging-railway-url>/webhook/whatsapp -H 'X-Hub-Signature-256: sha256=deadbeef' -d '{}'` — תוצאה מצופה: 403, no new row.
- [ ] Production promotion — repeat steps 1-4 with the production Railway URL; only after staging smoke passes.

### After-hours watchdog (MEH-509 PR2b — gated off until PR2c webhook ships)
- [ ] Post-PR2c smoke — set `WATCHDOG_ENABLED=true` in Railway **staging** env. `psql $DATABASE_URL_STAGING -c "INSERT INTO inbound_messages (id, from_phone, body, received_at) VALUES (gen_random_uuid(), '+972500000099', 'אפשר להזמין?', now() - interval '5 minutes');"` at 22:00 IL — תוצאה מצופה: within 6 min the WhatsApp on `+972500000099` receives `after_hours_response_he`; `psql` shows the row with `bot_replied=true, bot_template_sent='after_hours_response_he'`. Then disable the env var in staging.
- [ ] Vacation routing — POST `/admin/settings/vacation {"active": true, "return_date": "2026-08-01"}` in staging; insert the same fake inbound row at 10:00 IL (within hours). תוצאה מצופה: vacation wins — the bot sends `vacation_response_he_v2` with `2026-08-01` as the body param, not `after_hours_response_he`.
- [ ] Within-hours skip — POST `/admin/settings/vacation {"active": false}` to clear vacation; insert a fake inbound at 10:00 IL. תוצאה מצופה: row stays `bot_replied=false` indefinitely (humans were expected to reply).
- [ ] Production promotion — only after staging smoke passes, set `WATCHDOG_ENABLED=true` in Railway production env. Watch Sentry for `[WATCHDOG]` warnings during the next 24h.

### Sidebar pending moderation badge
- [ ] צרי יצרנית חדשה עם status=pending + דיווח פתוח אחד + מוצר ביתי FLAGGED אחד + חוויה pending אחת
- [ ] /admin/dashboard — כרטיסיות alerts מפרטות את ה-4
- [ ] ב-sidebar על "לוח מחוונים" מופיע pill צהוב עם המספר 4
- [ ] מעבר ל-/admin/producers, ה-badge עדיין מופיע עם 4 (ה-layout טוען מחדש על כל שינוי pathname)
- [ ] אישור כל ה-4 → הרענון הבא: ה-badge נעלם

### Privacy invariant
- [ ] `SELECT viewer_ip_hash FROM producer_page_views LIMIT 10` — כל הערכים הם hex 64-תווים (SHA-256), אף אחד לא נראה כמו כתובת IP
- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='producer_page_views'` — אין עמודה `viewer_ip` בלי hash

---

## Experiences (קהילה — חוויות קולינריות)

> Experiences are **different** from Events: they go through a two-step
> moderation flow (Claude Haiku pre-check → admin approval) instead of
> a simple admin approval. The admin UI is a separate page at
> `/admin/experiences` with 5 tabs for each moderation state.

- [ ] /experiences — נטען עם פילטרים
- [ ] /experiences/new — טופס זמין למשתמשים מחוברים (ולא לאנונימיים)
- [ ] שלחי חוויה בדיקה — נכנסת ל-Claude Haiku pre-check; אם pass → `pending` ב-/admin/experiences; אם fail → `changes_requested` עם הסבר מהמודל
- [ ] /admin/experiences — 5 טאבים: "ממתינות לאישור" / "דרוש תיקון" / "מאושרות" / "נדחו" / "הכל"
- [ ] אשרי חוויה — מופיעה ב-/experiences הציבורי
- [ ] "בקשי שינויים" — אימייל למארח עם ההערות שלך מה-modal
- [ ] "דחי" — אימייל למארח עם סיבת הדחייה
- [ ] Claude Haiku לא זמין (ANTHROPIC_API_KEY ריק) — החוויה עוברת ישירות ל-`pending` (fail-open), הגשה לא נכשלת

---

## Registration forms — RTL + dashboard copy

RTL tests (Task 1) — verify on a mobile viewport (iOS Safari / Android Chrome), not only on desktop. The bug reproduces only on mobile.

- [ ] `/register` — פתחי במובייל — שדה "שם מלא" מיישר ימין ונכתב מימין לשמאל
- [ ] `/register` — שדה "אימייל" — עדיין LTR (תווים לטיניים, intentional)
- [ ] `/register` — שדה "סיסמה" — עדיין LTR (intentional)
- [ ] `/register` — שדה "עיר" (CitySearch) — RTL, placeholder "חפשי עיר..." מיושר ימין, התוצאות באוטוקומפליט RTL
- [ ] `/register` — שדה "טלפון" — עדיין LTR (intentional)
- [ ] `/register/producer` שלב 1 — שדה "שם מלא" — RTL
- [ ] `/register/producer` שלב 2 — שדה "שם העסק" — RTL
- [ ] `/register/producer` שלב 2 — textarea "תיאור העסק" — RTL
- [ ] `/register/producer` שלב 2 — שדה "עיר" — RTL
- [ ] `/register/producer` שלב 3 — שדות "עיר משלוח" ו-"יום משלוח" — RTL
- [ ] `/register/producer` שלב 2 — "אינסטגרם" / "אתר" — עדיין LTR (intentional)

Dashboard copy tests (Task 2):

- [ ] `/producer/dashboard` — שלום משתמשת — הטקסט מתחת לכותרת קורא "ברוכה הבאה לניהול העסק של [שם העסק]" (לא "דשבורד")
- [ ] `/producer/dashboard/events/new` — breadcrumb בראש הדף — הקישור הראשון קורא "ניהול העסק" (לא "דשבורד"), קליק מחזיר ל-`/producer/dashboard`
- [ ] Footer — עמודת "בתי עסק" — הלינק השלישי קורא "ניהול העסק" (לא "דשבורד"), ה-`href` עדיין `/producer/dashboard`
- [ ] `grep -rn 'דשבורד' frontend/` → אפס תוצאות (ניתן להריץ אוטומטית לפני merge)

---

## Map city search width + dropdown z-index

The width bug only shows on desktop (≥ `md` breakpoint, 768px+). Mobile was already correct (`w-full`). The z-index bug shows on `/map` specifically because Leaflet's panes (z-index 200–700) were covering the dropdown (z-50).

- [ ] `/map` על דסקטופ (חלון ≥ 768px) — הקלידי "ראשון לציון" בשדה החיפוש — הטקסט המלא נראה לגמרי, אין חיתוך (truncation) של התווים האחרונים
- [ ] `/map` על דסקטופ — הקלידי "ראש" — ה-autocomplete dropdown מציג "ראשון לציון" ו-"ראש העין" בשורה מלאה כל אחת, ללא טקסט קטוע או גלילה אופקית
- [ ] `/map` על דסקטופ — לחצי על "ראשון לציון" ב-dropdown — השדה מתמלא עם הערך המלא
- [ ] `/map` על דסקטופ — הקלידי "מעלה אדומים" ידנית — הטקסט המלא גלוי בשדה
- [ ] `/map` על מובייל (< 768px) — שדה החיפוש עדיין תופס את כל רוחב הפיד (`w-full`), לא התווסף regression
- [ ] `/map` — הקלידי "זכ" — ה-dropdown מצויר **מעל** המפה, רקע לבן אטום, אין טקסט ערבי/עברי של תוויות OSM שמבצבץ דרכו (z-index fix — לפני התיקון ה-dropdown היה מאחורי panes של Leaflet z-200 עד z-700)
- [ ] `/register` ו-`/register/producer` — שדה "עיר" — ה-dropdown עדיין עובד נכון (אין regression מה-z-[1000]), אין אלמנטים אחרים בעמוד שנחסמים על ידו

---

## Category card images — dairy + care

Both cards render on the homepage category grid (`frontend/app/page.js` `CATEGORY_CARDS` array). Each card is a `<motion.button>` with a `backgroundImage: url(…)` style and a 65% green overlay (`rgba(46,104,83,0.65)`) on top. A "plain green" card means the image URL 404'd — the overlay is showing through nothing. A card that looks OK but has a visible logo/text is the image loading fine but carrying branding.

- [ ] דף הבית — גלילי לגריד הקטגוריות — **חלב וגבינות** מציג תמונה אמיתית של גבינה (לא צבע ירוק אחיד) עם שכבת גוון ירוקה על גביה
- [ ] דף הבית — **חלב וגבינות** — אין טקסט/לוגו/סימן מסחרי גלוי בתמונה
- [ ] דף הבית — **טיפוח וסבונים** — מציג תמונה אמיתית של סבון/מוצר טיפוח ללא טקסט Act+Acre (או כל מותג אחר) גלוי מעבר לשכבת הגוון
- [ ] דף הבית — **טיפוח וסבונים** — אין טקסט/לוגו בתמונה
- [ ] דף הבית על מובייל — שני הכרטיסים נטענים נכון (אין broken-image icon או ריק)
- [ ] DevTools → Network — הטעינה של `photo-1771578742735-36009188c207` (dairy) ו-`photo-1600857544200-b2f666a9a2ec` (care) — שתיהן 200 OK, לא 404
- [ ] 4 הקטגוריות האחרות (בשר / ירקות / לחמים / שמנים) לא התשנו — regression guard

---

## iOS Safari parallax verification

Task 16 asked to add a `background-attachment: fixed` fallback for iOS Safari, but the hero and `ParallaxQuote` had already been refactored to Ken Burns CSS-transform animations in the April 8 PREMIUM_DESIGN commit, so no code fallback is needed. The refactor removed the bug described in the task. This checklist verifies the current Ken Burns pattern renders correctly on real iOS Safari (and Chrome iOS), which is what the task wanted us to confirm.

Test on a **real iOS device** (iPhone Safari + Chrome iOS preferred) — simulators are OK but don't always reproduce iOS-specific rendering quirks.

- [ ] דף הבית — iOS Safari — ה-hero הטעון (תמונת רקע) מציג את אנימציית ה-Ken Burns (pan/zoom איטי); התמונה לא קפואה/תקועה
- [ ] דף הבית — iOS Safari — כאשר גוללים את הדף למטה ה-hero נשאר חלק ואין jitter/stutter על הטרנספורמציה
- [ ] דף הבית — Chrome iOS — אותה בדיקה (Chrome iOS הוא Safari WebView תחת מכסה המנוע אבל שווה לאמת)
- [ ] דף הבית — שני בלוקי ParallaxQuote בין הסקשנים — Ken Burns רץ, הציטוט קריא מעל overlay ירוק 60%
- [ ] iOS Settings → Accessibility → Motion → **Reduce Motion: ON** — טוענים את הדף מחדש — אנימציות ה-Ken Burns נעצרות, התמונות סטטיות (זה התנהגות מכוונת לפי `@media (prefers-reduced-motion: reduce)` ב-globals.css:161)
- [ ] iOS Settings → Reduce Motion: OFF — אנימציות חוזרות לפעול אחרי רענון
- [ ] iPad בלנדסקייפ (lot > 768px) — אנימציות עדיין פעילות, אין regression מהסרת `.parallax-bg` המיותר
- [ ] `grep -rn 'background-attachment' frontend/` → רק הערות בקוד, אין שימוש פעיל (regression check — לוודא שה-class המת לא חזר)

---

## WhatsApp phone normalization

The bug was: 4 separate inline phone-normalization implementations across the frontend, each with its own subset of handled input formats. One of them (`ProducerCard.jsx` and its copy in `ProducerDetail.jsx`) had an order-of-operations bug where input with leading whitespace would output an unchanged local-format number. Fix: a single `normalizePhone()` helper in `lib/utils.js` with 19 unit tests, applied at all 4 call sites.

### Unit tests (run locally before merge)

- [ ] `cd frontend && node lib/utils.test.mjs` → `19 passed, 0 failed` ← pure Node, no Jest/Vitest needed

### End-to-end: the wa.me link actually works for every input format

For each of the formats below, set an approved producer's phone field (via `/admin/producers` edit or directly in the DB) and tap the WhatsApp button:

- [ ] Plain local format `"0501234567"` → `/producer/:id` → WhatsApp button opens `wa.me/972501234567` (not `wa.me/0501234567`)
- [ ] Dashes `"052-123-4567"` → `wa.me/972521234567`
- [ ] Parentheses `"(050) 123-4567"` → `wa.me/972501234567`
- [ ] E.164 with `+` `"+972501234567"` → `wa.me/972501234567` (no stray `+` in the URL)
- [ ] Dots `"050.123.4567"` → `wa.me/972501234567`
- [ ] **Leading whitespace** `" 0501234567"` → `wa.me/972501234567` (this was the ProducerCard/ProducerDetail order-of-operations bug — verify the fix on the producer card + the detail page)
- [ ] Already normalized `"972501234567"` → `wa.me/972501234567` (no double-prefix)

### All 4 call sites must be tested

The fix applies to **4 distinct UI surfaces** — verify each:

- [ ] **Homepage producer grid** → click the WhatsApp icon on a `ProducerCard` → correct wa.me URL
- [ ] **`/producer/:id` detail page** → click the big green WhatsApp button in the sticky contact sidebar → correct wa.me URL
- [ ] **`/map` mobile sheet card** → tap a producer marker (mobile) → pinned sheet card has a WhatsApp link → opens wa.me with correct number. (MEH-1010: the desktop mini-popup was retired — on desktop, marker click scrolls+highlights the sidebar card; WhatsApp CTA lives on the card.)
- [ ] **`/neighbor` home-product cards** → click the green WhatsApp CTA (the `WhatsAppButton` component) → correct wa.me URL

### Empty-input guards still work

- [ ] Producer with `phone: null` → no WhatsApp button rendered on ProducerCard, ProducerDetail, MapComponent popup, WhatsAppButton
- [ ] Producer with `phone: ""` → same: button hidden
- [ ] Producer with `phone: "abc"` (letters only) → `normalizePhone("abc") === ""` → button hidden

### Regression guards (grep-based, safe to automate)

- [ ] `grep -rn "replace(/\^0" frontend/` → zero matches outside `lib/utils.js` + `lib/utils.test.mjs` (no residual inline phone logic)
- [ ] `grep -rn "normalizePhone" frontend/` → exactly 4 imports (WhatsAppButton, ProducerCard, ProducerDetail, MapComponent) + 4 usages at the relevant call sites + 1 export in `lib/utils.js` + the test file

---

## Form submit loading state — 5 forms

A shared `ButtonSpinner` component (`frontend/components/ButtonSpinner.jsx`, wraps Phosphor `CircleNotch` + Tailwind `animate-spin`) is now used inside the submit button of every public form. Each form also kept `disabled={loading}` so double-submission is prevented before the spinner even needs to be visible.

Test each form on real mobile + desktop. The spinner should be visible for the network round-trip (usually 200–800ms on prod), then disappear on success OR on error.

### /login

- [ ] `/login` — fill email + password → tap "כניסה" → **button disables immediately** (can't tap again), spinner + "מתחברת..." show inside the button for the duration of the request
- [ ] `/login` — wrong password → after the server returns an error, button re-enables and the original text "כניסה" comes back, spinner hidden
- [ ] `/login` — slow-3G (DevTools network throttling) — verify spinner is visible for ~2+ seconds

### /register

- [ ] `/register` — fill all fields + agree to terms → tap "הצטרפי" → button shows spinner + "נרשמת..."
- [ ] `/register` — trigger a client validation failure (wrong password shape) → button doesn't go into loading state at all (validation happens before `setLoading(true)`)
- [ ] `/register` — server error (duplicate email) → button recovers to "הצטרפי"

### /register/producer

- [ ] `/register/producer` → progress through step 1 + step 2 → on step 3, check both compliance checkboxes → tap **"שלחי בקשה"** (NOTE: was "שלח בקשה" — masculine — before this PR; verify it's now feminine)
- [ ] `/register/producer` step 3 → during submit the button shows spinner + **"שולחת..."** (NOTE: was "שולח..." — masculine — before this PR; verify it's now feminine)
- [ ] `/register/producer` — server error (e.g. duplicate email at step 1 surfacing here) → button recovers to "שלחי בקשה"

### /about contact form

- [ ] `/about` → scroll to contact form → fill name/email/message → tap "שלחי" → button shows spinner + "שולחת..."
- [ ] `/about` — success → button disappears or recovers, success message below the form
- [ ] `/about` — server error → button recovers to "שלחי", error message shows

### Footer newsletter

- [ ] Any page → scroll to footer → enter email → tap "הצטרפי" → button shows spinner + **"מצטרפת..."** (NOTE: was the cryptic "..." before this PR — verify the new text)
- [ ] Footer — success → feminine Hebrew "welcome" message appears below
- [ ] Footer — rate-limit error (429, after 6 quick signups) → button recovers to "הצטרפי"

### Cross-cutting accessibility checks

- [ ] `prefers-reduced-motion: reduce` — the spinner's CSS `animate-spin` is a simple rotation, not a content-shifting animation, so it's fine to leave running even under reduced-motion per WCAG. Verify it doesn't cause any layout shift.
- [ ] Keyboard-only — tab to any submit button, press Enter, confirm button disables via the same loading branch
- [ ] Screen reader — the spinner has `aria-hidden="true"` so it doesn't announce; the button label + disabled state is what matters

### Regression guards (grep-based)

- [ ] `grep -rn 'שולח\.\.\.' frontend/` → zero matches (the masculine form should not exist anywhere)
- [ ] `grep -rn 'ButtonSpinner' frontend/` → 5 imports (login, register, register/producer, AboutClient, Footer) + 5 usages + 1 component file

---

## CSP — Vercel Live feedback widget on preview URLs (fix/csp-allow-vercel-live-preview)

Vercel injects `https://vercel.live/_next-live/feedback/feedback.js` into every preview deployment so reviewers can leave inline comments. The previous CSP in `next.config.js` didn't whitelist `vercel.live`, so Chrome blocked the script and spammed the console with CSP violation warnings on every preview page load — making it hard to spot real errors during testing.

The fix conditionally appends `vercel.live` (and Pusher, which the widget uses for realtime) to 6 CSP directives **only when `process.env.VERCEL_ENV === "preview"`**. Production CSP stays strict — `vercel.live` does not load in production and is not whitelisted there.

- [ ] Open any Vercel **preview URL** → DevTools → Console → reload → **zero** `"Loading the script ... violates the following Content Security Policy directive"` messages for `vercel.live`
- [ ] Same preview → bottom-left → Vercel feedback widget button loads and is clickable
- [ ] **Production** `mehamakor.online` → DevTools → Network tab → no requests to `vercel.live/*` at all (widget is not injected)
- [ ] Production → DevTools → Response Headers on any page → `Content-Security-Policy` does NOT contain `vercel.live` anywhere in its directives — regression guard that the conditional isn't leaking into prod
- [ ] `/login` Google OAuth still works (regression check — we touched the same CSP block as Google's GSI whitelist)
- [ ] Apple Sign-In button on `/login` still works (regression check — same reason)
- [ ] Unsplash images on the homepage category grid still load (regression check — `img-src` gained an entry so order/syntax matters)
- [ ] Cloudinary producer photos still render (regression check — `img-src` again)
- [ ] OpenStreetMap Leaflet tiles still render on `/map` (regression check — same directive)

### Local verification commands (run once before merging)

```bash
# Production CSP (strict, vercel.live should NOT appear)
node -e "const c=require('./frontend/next.config.js'); c.headers().then(h=>console.log(h[0].headers.find(x=>x.key==='Content-Security-Policy').value))"

# Preview CSP (vercel.live + pusher should appear on 6 directives)
VERCEL_ENV=preview node -e "const c=require('./frontend/next.config.js'); c.headers().then(h=>console.log(h[0].headers.find(x=>x.key==='Content-Security-Policy').value))"
```

---

## Chat widget — plain Hebrew (feature/chatbot-plain-hebrew-v2)

### Suggested prompts — order + copy
- [ ] Open the widget from desktop homepage — the 8 suggested prompts appear in this exact order: `איך נרשמים כבעלת עסק?` / `איך מוצאים עסקים קרובים אליי?` / `איך מפרסמים מוצר ביתי?` / `מה זה מהמקור?` / `האם האתר בחינם?` / `איך יוצרים קשר עם בית עסק?` / `מה זה "מהמטבח של השכן"?` / `כמה זמן לוקח האישור של העסק?`
- [ ] `איך מדווחים על בעיה?` and `האם ההרשמה בחינם?` and `כמה זמן לוקח האישור?` (bare, without "של העסק") should NOT appear anywhere in the prompt list

### Hardcoded answers — instant + plain Hebrew
- [ ] Click `איך נרשמים כבעלת עסק?` — instant response (no typing dots), text contains `"תוך יום-יומיים"` and `"העסק שלך"`, does NOT contain `"הפרופיל"` or `"מודרציה"` or `"אוטומטית"`
- [ ] Click `איך מוצאים עסקים קרובים אליי?` — instant response mentioning both המפה + דף הבית and the WhatsApp button
- [ ] Click `איך מפרסמים מוצר ביתי?` — instant response contains `"המוצר שלך"` and `"תוך שעות ספורות"`, does NOT contain `"מודרציה"` or `"הפרופיל"`
- [ ] Network tab: clicking any of the 3 canonical prompts does NOT fire a request to `/api/chat`

### Freeform questions — backend KB sections
- [ ] Type `מה זה מהמקור?` — response explains the directory concept + categories + map (may use slight model rephrasing but must not mention "מודרציה" / "פרופיל")
- [ ] Type `האם האתר בחינם?` — response confirms free for both buyers + sellers and mentions premium as optional
- [ ] Type `כמה זמן לוקח האישור של העסק?` — response mentions `"יום-יומיים"` and `"העסק"` explicitly
- [ ] Type `איך יוצרים קשר עם בית עסק?` — response mentions WhatsApp button + phone/Instagram/site
- [ ] Type `מה זה "מהמטבח של השכן"?` — response mentions neighbors cooking at home + review by team, does NOT use "מודרציה"

### Regression guards (grep-based)
- [ ] `grep -n 'מודרציה' backend/app/routers/chat.py` — every match must be either inside a `#` comment block or inside the meta-instruction `אל תשתמשי במונחים טכניים כמו "מודרציה"`; must NEVER appear inside a KB section like `**איך נרשמים...**`
- [ ] `grep -n 'הפרופיל' backend/app/routers/chat.py` — must only appear in the comment (`never say "הפרופיל מאושר"`) or the meta-instruction; must NEVER appear inside a KB section
- [ ] `grep -n 'מודרציה\|הפרופיל' frontend/components/ChatWidget.jsx` — must only appear in the `//` comment block above `HARDCODED_ANSWERS`; must NEVER appear inside any value of the `HARDCODED_ANSWERS` map
- [ ] Backend + frontend approvals of businesses must always say `"העסק שלך"`: `grep -c 'העסק שלך' frontend/components/ChatWidget.jsx` → ≥1; `grep -c 'העסק שלך' backend/app/routers/chat.py` → ≥1

---

## Eye toggle + inline form validation on /login + /register

Two tightly coupled tasks shipped in one PR. Task 7 = show/hide password button. Task 8 = inline onBlur validation with red borders, green checkmarks, error messages, and a submit button that's disabled until the form is valid.

### Password visibility toggle (task 7) — both pages

- [ ] `/login` — password field has a small eye icon on its left side (visual LEFT of the LTR input, which is the END of the RTL reading flow)
- [ ] `/login` — tap the eye → input type flips `password` → `text` → the typed characters become visible
- [ ] `/login` — tap again → flips back to `password` → characters become dots
- [ ] `/login` — icon changes: closed eye (`Eye`) when hidden, slashed eye (`EyeSlash`) when visible
- [ ] `/register` — same 4 checks on the password field there
- [ ] Keyboard — tab to the password field → tab again → focus lands on the eye button → press Enter → toggles
- [ ] Screen reader — button has `aria-label` that swaps between "הציגי סיסמה" and "הסתירי סיסמה" + `aria-pressed` reflects state

### Inline validation — /login (task 8)

- [ ] `/login` — load page — submit button is **disabled** (form is empty)
- [ ] Email field — tap then tap away without typing → no error (touched but empty is neutral)
- [ ] Email — type `foo` → tap away → red border + error `"האימייל לא תקין"` below the field
- [ ] Email — fix to `foo@bar.com` → red border gone, now green border + `"✓ תקין"` below
- [ ] Password — tap then tap away empty → no error
- [ ] Password — type `abc` → tap away → red border + error `"סיסמא חייבת להכיל לפחות 8 תווים"`
- [ ] Password — fix to `abcdefgh` (8 chars) → green border + `"✓ תקין"`
- [ ] Submit button — disabled until BOTH email is valid AND password is ≥8 chars — then enabled
- [ ] Server error path — submit with right-format-but-wrong-credentials → banner-level error appears → button re-enables

### Inline validation — /register (task 8)

- [ ] `/register` — load page — submit button is **disabled** (form is empty + terms not agreed)
- [ ] Name field — tap then tap away empty → red border + `"שם מלא הוא שדה חובה"`
- [ ] Name — type `שרה` → green border + `"✓ תקין"`
- [ ] Email — same pattern as /login (`"האימייל לא תקין"` error)
- [ ] Password — same pattern as /login (`"סיסמא חייבת להכיל לפחות 8 תווים"` error)
- [ ] Password — **strength indicator** appears below the input as soon as the user types anything:
  - 1 rule passes (e.g. `"abc"` — only len fails, no upper, no digit: **0 rules**) — strength bar shows no color, no label (field still effectively too short)
  - 1 rule passes (e.g. `"abcdefgh"` — len ✓, upper ✗, digit ✗) — label `"חוזק סיסמה: חלשה"` in red, 1/3 of the bar in red
  - 2 rules pass (e.g. `"Abcdefgh"` — len ✓, upper ✓, digit ✗) — label `"חוזק סיסמה: בינונית"` in amber, 2/3 of the bar in amber
  - 3 rules pass (e.g. `"Abcdefg1"` — all three ✓) — label `"חוזק סיסמה: חזקה"` in primary-green, 3/3 of the bar in primary
- [ ] Password — the existing rule checklist is still visible below the strength bar (one ✓/○ per rule)
- [ ] Phone — **optional field** — tap and tap away empty → no error, no green check (empty is fine)
- [ ] Phone — type `123` → tap away → red border + `"מספר טלפון לא תקין"`
- [ ] Phone — fix to `0501234567` → green border + `"✓ תקין"`
- [ ] City field (CitySearch) — no inline validation added (not in task 8 spec; field is optional)
- [ ] Submit button — disabled until ALL required fields pass AND terms checkbox is ticked:
  - Name non-empty ✓
  - Email valid format ✓
  - Password ≥8 chars ✓
  - Phone empty OR valid format ✓
  - Terms checkbox checked ✓

### Task-spec exactness — error message wording

The task spec dictates the exact Hebrew error text for each rule. Verify the strings match character-for-character:

- [ ] `grep -rn 'האימייל לא תקין' frontend/app/login frontend/app/register` → 2 matches (1 per page, in the inline validation block)
- [ ] `grep -rn 'סיסמא חייבת להכיל לפחות 8 תווים' frontend/app/login frontend/app/register` → 2 matches
- [ ] `grep -rn 'שם מלא הוא שדה חובה' frontend/app/register` → 1 match
- [ ] `grep -rn 'מספר טלפון לא תקין' frontend/app/register` → 1 match

### Accessibility checks

- [ ] Eye button has `aria-label` that swaps + `aria-pressed` that reflects state
- [ ] Invalid inputs have `aria-invalid="true"` (verify in DevTools Elements tab)
- [ ] Error messages are rendered in the same `<div>` as the input so screen readers pick them up
- [ ] `prefers-reduced-motion: reduce` — nothing in this PR adds animation, but verify the eye toggle still works smoothly under reduce-motion (it uses only a CSS `transition` on the icon color — no transform/opacity)

### Regression checks — do NOT break existing behavior

- [ ] `/login` Google OAuth button still works (we imported a new icon but didn't touch the OAuth block)
- [ ] `/login` Apple Sign-In button still works
- [ ] `/register/producer` step 1 still works — the `PasswordStrength` upgrade (tier indicator) propagates to its password field too. Verify the new tier bar renders there without layout breakage.
- [ ] `/register` → submit with invalid data server-side (e.g. email already exists) → error banner at the bottom of the form appears, submit button recovers
- [ ] `/register` → form validation AFTER clearing a field (e.g. type valid email then backspace to nothing) → red border appears (field is still touched, and the empty-string + touched state should reset to neutral or invalid per the logic). Actually for email: touched + empty → neither invalid nor valid (because `emailInvalid` requires `email.length > 0`). Expected: no red border, no green check, button disabled because `validateEmail("") === false`.

---

## Producer cards — 2-column mobile grid (task 9)

### Mobile 2-column layout (< 768px)
- [ ] Homepage — open on a mobile device / narrow viewport (< 768px) — producer cards display in **2 columns** instead of 1
- [ ] Homepage — gap between cards is tighter on mobile (~12px) vs tablet+ (~24px)
- [ ] Homepage — "עסקים חדשים ✨" section also shows 2-column grid on mobile
- [ ] `/map` — scroll down to the producer list below the map — same 2-column grid on mobile
- [ ] Tablet (768px–1023px) — grids stay 2-column (unchanged from before)
- [ ] Desktop (1024px+) — grids stay 4-column (unchanged from before)

### Shorter card images on mobile
- [ ] Mobile — card image height is **140px** (shorter than desktop)
- [ ] Desktop — card image height is **200px** (unchanged)
- [ ] Images are not squished or stretched — `object-cover` fills the shorter container

### Text truncation
- [ ] Long producer name (e.g. "חוות השקמה של משפחת אברהמי מרחובות") truncates with `…` instead of wrapping to a second line
- [ ] Long city + category line truncates with `…`
- [ ] Long top product name truncates with `…`

### Regression checks
- [ ] `/favorites` grid is **unchanged** — still 1-col on mobile, 2-col at md, 3-col at lg
- [ ] Card hover shadow + lift effect still works on desktop
- [ ] "מאומת" / "פרמיום" / "זמין היום" badges still visible on the image
- [ ] WhatsApp / phone / Instagram icon row in footer still clickable
- [ ] "מידע נוסף" CTA button still works

---

## Compliance fixes (ESLint + RTL + accessibility + disclosures)

### ESLint
- [ ] `cd frontend && npx eslint . --ext .js,.jsx` → 0 errors

### Skip navigation (IS 5568)
- [ ] Tab once from page load → "דלג לתוכן הראשי" link appears → Enter → focus jumps to main content

### Business disclosures
- [ ] Footer shows ח.פ., address, email

### RTL dir="ltr"
- [ ] Admin settings email input: cursor starts on left
- [ ] Footer newsletter email: cursor starts on left
- [ ] Experiences/new image URL: cursor starts on left

### Accessibility statement
- [ ] `/accessibility` — coordinator name "צוות מהמקור" visible
- [ ] Phone placeholder "להשלים" visible
- [ ] Link to gov.il accessibility authority present
- [ ] Date label: "תאריך בדיקה אחרונה" (not "עדכון אחרון")

### Admin tables RTL
- [ ] Admin tables use `text-end` (not `text-right`) — text aligns correctly in RTL

---

## Map z-index token system + UI bugfixes

### Z-index hierarchy (per CLAUDE.md)
- `tiles:0 → markers:400 → tooltips:500 → bottom-sheet:600 → legend:800 → controls:1000 → chat:9999`

### Bug fixes
- [ ] Mobile: bottom sheet open → zoom +/- still clickable above it (z-600 < z-1000)
- [ ] Desktop: hover marker → only ONE tooltip (no browser-native duplicate)
- [ ] Mobile: sheet content scrolls fully, "מידע נוסף" visible with padding
- [ ] Mobile: X close button stays at top-left during scroll → tap → closes
- [ ] Mobile: category legend NOT visible (hidden, filter chips serve this role)
- [ ] Desktop: legend visible at the map's bottom-LEFT (physical `bottom-4 left-4`, z-800 — geographic map overlay, rtl-ok; was misdocumented as "bottom-right" since #136, corrected in MEH-1009). With a top banner (email verification) the toggle must still be fully inside the viewport.

### Regression
- [ ] "חפשי באזור זה" button works (z-1000)
- [ ] "קרוב אלי" clickable with sheet open
- [ ] CitySearch dropdown above map tiles
- [ ] Map pan/zoom works above the sheet

### Mobile top-banner height reservation (MEH-1019)
_(Desktop top-banner case is covered by the legend assertion above, MEH-1009.)_
- [ ] Mobile WITH top banner — log in as an **unverified** user (email-verification banner shows atop `<main>`) → open `/he/map` on a phone → the map + bottom controls (קרוב אליי pill, bottom sheet) sit fully inside the viewport, no spill below the fold, page not scrollable past the map. תוצאה מצופה: המפה מסתיימת בדיוק בתחתית המסך.
- [ ] Mobile WITHOUT banner — verified user / logged out → `/he/map` layout unchanged (no double reservation, no gap). תוצאה מצופה: זהה לקודם.

---

## /map desktop — marker click = card-sync (MEH-1010)

- [ ] Marker click scrolls the matching card — `/he/map` desktop → click a producer marker → the sidebar scrolls the matching card into view (smooth) with a primary ring+border highlight. תוצאה מצופה: הכרטיס הנכון נגלל ומודגש; אין popup צף בתחתית המפה.
- [ ] Highlight survives zoom/pan — after selecting a marker, zoom out / pan → the card highlight stays until another selection. תוצאה מצופה: ההדגשה נשמרת; קליק על רקע המפה מנקה אותה.
- [ ] Cluster child — click a cluster (green circle+count) → it expands/zooms → click a child marker → same scroll+highlight. תוצאה מצופה: זהה למרקר בודד.
- [ ] Keyboard — Tab to a marker (focus ring) → Enter → same scroll+highlight flow. תוצאה מצופה: Enter שקול לקליק (MEH-765).
- [ ] Legend rows clickable — open the legend (squares button, bottom-left of map) → click a category row → the filter applies AND the panel stays open; click the map canvas → panel closes. תוצאה מצופה: אין "בליעת" קליקים.
- [ ] Mobile unchanged — 375px: marker tap still opens the bottom sheet with the pinned card; no legend visible. תוצאה מצופה: התנהגות זהה לקודם.

---

## Dynamic OG tags + share message (social sharing)

### OG tags on /producer/:id and /:slug
- [ ] View page source or `curl -s https://mehamakor.online/producer/1 | grep 'og:'` — `og:title` is the producer name (no "| מהמקור" suffix)
- [ ] `og:description` is the first 120 chars of producer description
- [ ] `og:image` is a Cloudinary URL with `w_1200,h_630,c_fill` transform
- [ ] `og:url` matches the configured production canonical (NEXT_PUBLIC_SITE_URL / SITE_URL / fallback per `frontend/app/sitemap.js` 3-tier resolution)
- [ ] Share a producer link on WhatsApp → preview shows producer photo + name + description snippet
- [ ] Share a slug URL (e.g. `/havat-hashikma`) → same preview quality

### Share button text
- [ ] Click share on producer page (desktop, no native share) → clipboard contains multi-line message:
  ```
  גיליתי את [name] במהמקור 🌿
  [first 80 chars of description]...
  ב[city] • [category]
  👉 [URL]
  ```
- [ ] Mobile: native share sheet opens with the formatted text
- [ ] Producer with no description → description line is omitted
- [ ] Producer with no city/category → location line is omitted

### Regression
- [ ] Producer page still loads and renders correctly
- [ ] WhatsApp share button still works separately
- [ ] JSON-LD structured data still present in page source

---

## Performance — Core Web Vitals (CWV audit)

### Image optimization (LCP)
- [ ] `grep -rn 'images.unsplash.com' frontend/app/ frontend/components/ | grep -v fm=webp | grep -v next.config | grep -v layout.js` → **0 matches** (all URLs include `&fm=webp`)
- [ ] `grep -rn 'images.unsplash.com.*w=600' frontend/app/page.js` → all 6 category cards include `&q=80&fm=webp`
- [ ] Network tab: hero image response header `Content-Type: image/webp` (when browser supports it)

### Layout shift (CLS)
- [ ] ProducerCard image container has explicit `h-[140px] md:h-[200px]`
- [ ] HomeProductCard image container has explicit `h-48`
- [ ] Category cards have explicit `height: 280px`
- [ ] Hero sections use `height: 100vh`
- [ ] No visible content jump on page load (manual check)

### Bundle size
- [ ] `npm run build` — homepage first load JS < 200kB
- [ ] Shared chunk < 90kB

---

## Component tests — vitest (automated)

### Running
- [ ] `cd frontend && npx vitest run --reporter=verbose` — all 33 tests pass
- [ ] Stop hook runs vitest automatically on every task completion

### ProducerCard — Phase A → B → C redesign (2026-04-18)
- [ ] **Anatomy** — image (1:1 mobile, 4:3 desktop) → name row with inline `★ rating · count` → location dot + city + distance → description line → max-2 pill row → footer (price + primary-method hint). No contact-icon row. No CTA link.
- [ ] **Image ratio** — resize viewport from 375→768→1280; image stays square on mobile, shifts to 4:3 at `lg` breakpoint. No letterboxing / stretching.
- [ ] **Cloudinary smart-crop** — for a Cloudinary source image, the URL has `c_fill,g_auto,ar_4:3` injected. Portrait producer photos don't crop heads off.
- [ ] **Rating gate** — producer with `reviews_count = 2` shows no rating; `reviews_count >= 3` shows `★ 4.5 · 12` in the name row, `dir="ltr"`.
- [ ] **Availability dot** — `is_available_today=true` → green; `availability_status="vacation"` → orange (overrides even if `is_available_today=true`); neither → no dot.
- [ ] **Description fallback** — `short_description` shown when present; else `top_product_name`; else row hidden. Descriptions past 80 chars get a trailing `…`.
- [ ] **BadgeRow fold** — producer with `is_verified + is_recommended + organic_certified + grass_fed` shows exactly 2 pills (verified + recommended) per the new 8-key priority.
- [ ] **Footer** — price truncates at `max-w-[120px]`; primary-method icon switches per `primary_contact_method` (whatsapp → WhatsappLogo, phone → Phone, website → Globe, email → EnvelopeSimple).
- [ ] **Heart — guest flow** — tap heart while logged out → heart fills red, snackbar appears with "שמרתי — התחברי לראות את כל המועדפים שלך" and a `התחברי` link. Tap link → `/login?next=<current-url>`. After login, snackbar "נשמר למועדפים ❤️" appears and the favorite is persisted server-side.
- [ ] **Heart — authed flow** — tap heart while logged in → heart fills, `POST /users/me/favorites/{id}` fires, toast "נשמר למועדפים ❤️". Tap again → unfills, `DELETE` fires, toast "הוסר מהמועדפים".
- [ ] **Heart — error revert** — disable network, tap heart → heart fills then reverts, error toast "משהו השתבש, נסי שוב".
- [ ] **Heart — own-card hide** — as a logged-in producer, navigate to a page showing your own producer card (e.g. `/favorites` if you favorited yourself, or admin → producers index). Heart is absent.
- [ ] **Heart — click doesn't navigate** — tapping the heart does NOT open the producer detail page.
- [ ] **RTL** — heart sits at `top-3 start-3` (physical right in Hebrew). Rating + distance numerics stay LTR via `dir="ltr"` spans, no parentheses flipping.
- [ ] **onClick preserved** — on `/map`, tapping a card body (outside heart / Link) still pans the map.
- [ ] **Skeleton** — while `producers` loads, `SkeletonProducerGrid` renders the exact-same anatomy (square→4:3 image + body rows + footer row) with shimmer. No CLS jump when real cards arrive.

### HomeProductCard (16 tests)
- [ ] Renders image when available, placeholder when null
- [ ] Price: null → empty, 0 → "🎁 במתנה", number → "₪X / unit"
- [ ] Neighborhood when available, city as fallback
- [ ] Allergens/quantity/seller shown only when present
- [ ] Moderation badge for FLAGGED status
- [ ] Organic badge only when is_organic=true

### FavoriteButton (4 tests)
- [ ] Returns null when no user logged in
- [ ] Shows 🤍 heart when logged in (unfavorited)
- [ ] Correct aria-label and aria-pressed

---

## Share button on producer page (task 14)

### Share button (copy link)
- [ ] `/producer/:id` — sticky sidebar has a share button with a **ShareNetwork** icon (not a Link icon)
- [ ] Click share button (desktop, no native share) → toast **"הקישור הועתק ✓"**
- [ ] Clipboard contains the producer page URL
- [ ] Mobile (with native share API) → native share sheet opens

### WhatsApp share
- [ ] WhatsApp share button visible in the sidebar
- [ ] Click → opens `wa.me` with text: **"גיליתי את [שם העסק] במהמקור — [URL]"**
- [ ] Text contains the correct producer name and URL

### Regression checks
- [ ] Other ShareButton consumers (if any) also get the updated icon + toast
- [ ] Producer detail page still loads and renders correctly

---

## Recently viewed businesses (task 13)

### localStorage persistence
- [ ] Visit any producer page (e.g. `/producer/1`) → open DevTools → Application → Local Storage → `recently_viewed` key contains `[1]`
- [ ] Visit a second producer → `recently_viewed` is `[2, 1]` (most recent first)
- [ ] Visit the same producer again → no duplicates, ID moves to front
- [ ] Visit 6 different producers → only the 5 most recent are stored

### Homepage "ביקרת לאחרונה" section
- [ ] Homepage — with at least 1 recently viewed producer: **"ביקרת לאחרונה"** section appears above the main producer grid
- [ ] Section shows small cards in a horizontal scroll row (image + name + city)
- [ ] Cards are 160px wide with 100px tall images
- [ ] Long producer names truncate with `…`
- [ ] Click a card → navigates to that producer's page
- [ ] Mobile: cards scroll horizontally

### Edge cases
- [ ] Clear localStorage (`recently_viewed`) → refresh homepage → section is hidden
- [ ] Fresh browser with no localStorage data → section is hidden (no empty state)
- [ ] If a stored producer ID no longer exists (deleted) → that card is silently skipped

### Regression checks
- [ ] Producer detail page still loads correctly (the useEffect doesn't break anything)
- [ ] Homepage producer grid still renders below the recently-viewed section
- [ ] Category cards + search + geolocation all still work

---

## Advanced filter chips — homepage + /map (task 12)

### Chip appearance (both pages)
- [ ] Homepage — below "בתי עסק מומלצים" heading, 4 filter chips: ✡️ כשר · 🌿 אורגני · 🚚 משלוח · ✅ מאומת בלבד
- [ ] `/map` — below the city search, same 4 chips
- [ ] Mobile — chips row is horizontally scrollable (no line wrap)
- [ ] Inactive chip: white bg, border, dark text
- [ ] Active chip: primary-green bg, white text

### Toggle behavior
- [ ] Click "כשר" → chip turns green → grid reloads with only kosher producers
- [ ] Click "כשר" again → chip turns white → grid reloads without kosher filter
- [ ] Multi-select: activate "כשר" + "אורגנ��" simultaneously → grid shows only kosher AND organic producers
- [ ] Network tab: `GET /producers?kosher=true&organic=true` fires (both params)

### Composability with other filters
- [ ] Activate "משלוח" chip → search a city in the search bar → both `has_delivery=true` and `delivery_city=` sent
- [ ] Activate "מאומת בלבד" chip → click a category card → both `verified=true` and `category=` sent
- [ ] "קרוב אלי" button → with "אורגני" active → `lat=&lng=&radius_km=15&organic=true` sent
- [ ] Clear category filter ("נקה סינון") → chip filters preserved

### Backend params (new)
- [ ] `GET /producers?organic=true` → only producers with `organic_certified=true`
- [ ] `GET /producers?kosher=true` → only producers with a non-empty `kosher` field
- [ ] Both compose with existing params (`lat`, `lng`, `radius_km`, `category`, `delivery_city`, `verified`)

### Regression checks
- [ ] Homepage search still works without any chips active
- [ ] Category card clicks still work
- [ ] `/map` city search + legend category filter still work
- [ ] "הצגי עוד" load-more button works after chip-filtered results

---

## "קרוב אלי" geolocation button on homepage (task 11)

### Button appearance
- [ ] Homepage hero section — below the search bar there's a **"קרוב אלי"** button with a Crosshair icon
- [ ] Button styled as a frosted-glass pill (semi-transparent white with backdrop blur)
- [ ] Button fades in with the rest of the hero content (Framer Motion stagger)

### Geolocation flow — permission granted
- [ ] Click "קרוב אלי" → browser asks for location permission
- [ ] While waiting: button shows **"מחפשת..."** with a spinning Crosshair icon + disabled state
- [ ] On success: page scrolls to the producer grid, which now shows only nearby producers (radius 15km)
- [ ] Network tab: `GET /producers?lat=...&lng=...&radius_km=15` fires

### Geolocation flow — permission denied
- [ ] Click "קרוב אלי" → deny the browser permission prompt
- [ ] Toast appears: **"אפשרי גישה למיקום בהגדרות הדפדפן"**
- [ ] Button returns to normal state (not stuck on "מחפשת...")

### Geolocation unavailable
- [ ] In a browser/context without geolocation API — same toast message appears

### Regression checks
- [ ] Search bar still works (type a city → Enter → producers filtered)
- [ ] Category card clicks still filter the grid
- [ ] "הצגי עוד" load-more button still works after geolocation filter

---

## /neighbor empty state (task 10)

### City-filtered empty state
- [ ] `/neighbor` — select a city with no products (e.g. an obscure city) — empty state appears
- [ ] Large emoji: **🏡** (house with garden) in a round `bg-light` container
- [ ] Heading: **"אין מוצרים באזור הזה עדיין 🌱"** (exact text)
- [ ] Subtext (logged in): **"היי את הראשונה לפרסם מוצר בית!"** (exact text)
- [ ] CTA button (logged in): **"פרסמי מוצר +"** — click opens the product form
- [ ] Subtext (logged out): **"התחברי כדי לפרסם מוצר משלך."**
- [ ] CTA button hidden when logged out

### General empty state (no city filter)
- [ ] `/neighbor` with no products at all — heading: **"אין עדיין מוצרים ביתיים 🌱"**
- [ ] Same emoji, subtext, and CTA behavior as above

### Regression checks
- [ ] `/neighbor` with products — grid renders normally, no empty state shown
- [ ] "הצגי הכל" button still clears city filter
- [ ] Mobile floating CTA button still works
- [ ] Disclaimer banner still visible above the grid

---

## RTL Layout Regression — logical vs. physical classes

Added with `feature/rtl-regression-protection`.

### Login page — eye toggle
- [ ] `/login` — password field — eye toggle button appears on the **right** side of the input (physical right, inside `dir="ltr"` input — intentional exception)
- [ ] Toggle shows/hides password

### Modal close buttons (start-3)
- [ ] Click favorite when logged out → LoginPromptModal opens → ✕ close button appears on the **top-right** of the modal (RTL inline-start = physical right)

### Admin sidebar (start-0)
- [ ] Log in as admin → `/admin` — sidebar appears on the **right** side; main content fills the left

### ProducerCard badges (start-3)
- [ ] Homepage — if a "פרמיום" or "זמין היום" badge appears on a card, it is in the **top-right** corner of the card image (inline-start in RTL = physical right)

### ESLint CI
- [ ] Open a PR to staging → GitHub Actions "Frontend lint" job runs and passes (exits 0 even with pre-existing warnings)
- [ ] After PR #137 merges → run lint locally; RTL warnings should be nearly zero

---

## Session Handoff

Added with `feature/session-handoff`.

- [ ] Start new session → Claude reads HANDOFF.md before any other file (Rule 1 step a)
- [ ] End of session → HANDOFF.md updated with: last PR number, current branch state, next task, any new decisions
- [ ] `/compact` fires mid-session → HANDOFF.md updated immediately before continuing work
- [ ] Open new session next day → "Next task" section matches what was left unfinished

---

## איך לעדכן מסמך זה
אחרי כל PR שמוסיף פיצ׳ר/עמוד חדש:
1. הוסיפי סקציה חדשה או הרחיבי קיימת בפורמט `[ ] Test — איך — מצופה`.
2. שימרי את הבדיקות קצרות — פעולה אחת, תוצאה אחת.
3. סמני ✅ רק אחרי שרצה הבדיקה על staging/production.

---

## MEH-213: Business location types + cities autocomplete (PR #242)

### Admin ProducerForm — "סוג העסק" section
- [ ] Create new producer → "סוג העסק" section shows 2 checkboxes: "חנות פיזית" (checked by default) + "משלוחים" (unchecked) — צור עסק button is enabled
- [ ] Uncheck both checkboxes → inline error "חייב לסמן לפחות אחד מהשניים" appears; save button becomes disabled
- [ ] Check "משלוחים" only → cascading section appears with "משלוחים לכל הארץ" checkbox + CitiesAutocomplete below it
- [ ] Check "משלוחים לכל הארץ" → CitiesAutocomplete disappears; save is enabled
- [ ] Uncheck "משלוחים לכל הארץ" with no cities selected → inline error "יש לבחור לפחות עיר אחת"; save disabled
- [ ] Type "תל" in CitiesAutocomplete → dropdown shows cities starting with "תל" (requires seeded cities table); click a result → city chip appears
- [ ] Click × on a city chip → chip is removed
- [ ] Keyboard: ArrowDown/Up navigates dropdown; Enter adds selected city; Backspace removes last chip when input is empty
- [ ] Save delivery-only producer (no physical, offers_delivery=true, delivery_nationwide=true) → producer created; confirm in DB

### ProducerDetail — 4 location modes
- [ ] Physical-only producer → MiniMap visible, Waze/Gmaps buttons visible, no DeliveryBlock
- [ ] Physical + delivery producer → MiniMap visible AND DeliveryBlock visible below
- [ ] Delivery-only + nationwide → no MiniMap, no Waze/Gmaps; DeliveryBlock shows "🚚 משלוחים לכל הארץ" badge
- [ ] Delivery-only + city list → no MiniMap; DeliveryBlock shows city chips
- [ ] Delivery-only + no area set → DeliveryBlock shows "משלוחים בתיאום מראש — צרי קשר לפרטים"
- [ ] DeliveryBlock WhatsApp button → tapping opens WhatsApp correctly; Network tab shows POST /producers/:id/whatsapp-click beacon

### ProducerCard — "משלוחים בלבד" badge
- [ ] Delivery-only producer in list grid → shows "🚚 משלוחים בלבד" chip in badge row
- [ ] Physical-only or physical+delivery producer → no "משלוחים בלבד" chip

### Geo-search (map) exclusion
- [ ] Open /map → delivery-only producer does NOT appear as a pin; physical producer at same coords DOES appear

### Admin completeness dot
- [ ] Delivery-only producer with delivery_nationwide=true but no lat/lng → completeness dot is green (not red)
- [ ] Delivery-only producer with offers_delivery=true but no cities and no nationwide → completeness dot is yellow with "אזורי משלוח" in tooltip

### GET /cities?q= endpoint
- [ ] After running seed script: GET /api/cities?q=תל → returns ["תל אביב-יפו", "תל מונד", ...] (Hebrew sorted)
- [ ] GET /api/cities?q= (empty) → returns up to 20 cities alphabetically
- [ ] GET /api/cities?q=xxxxnotacityxxx → returns []

---

## Smart Search — HeroSearch + /producers?q= (MEH-99, PR #199)

### Hero search pill — recent / trending dropdown
- [ ] Homepage — click the search pill without typing → if there are recent searches (localStorage `mehamakor_recent_searches`) → dropdown shows "חיפושים אחרונים" with up to 5 items; each click routes to `/producers?q=<term>`
- [ ] Homepage — click search pill with no recent searches → dropdown shows "חיפושים פופולריים" items from `GET /search/trending`
- [ ] Homepage — type a single character → no autocomplete fired (debounce requires ≥ 2 chars)
- [ ] Homepage — type 2+ chars → after 300ms debounce, dropdown shows grouped results: יצרנים / מוצרים / ערים / קטגוריות
- [ ] Homepage — keyboard nav: ArrowDown/Up cycles through all items in the flat list; Enter submits the highlighted item
- [ ] Homepage — type "חוו" → press Enter → navigates to `/producers?q=חוו`
- [ ] Homepage — successful search term is saved to `mehamakor_recent_searches` (max 5, most recent first)
- [ ] Network tab: `GET /search?q=...` fires at most once per 300ms burst (debounce guard)
- [ ] Network tab: rapid type-delete → old in-flight request is aborted (AbortController), no stale results

### /producers?q= results page
- [ ] Navigate to `/producers?q=עגבנייה` → heading **"תוצאות עבור: עגבנייה"** appears above the grid
- [ ] Active filter chip **🔍 עגבנייה** appears in the chip row; click × → clears `q`, heading and chip disappear, full grid reloads
- [ ] ProducerCard names and descriptions show matched text in **bold** (no yellow background — `bg-transparent font-bold text-primary`)
- [ ] `/producers?q=xxxnotexist` → empty state shows "לא נמצאו בתי עסק" with category pill shortcuts
- [ ] `/producers?q=` (empty q) → behaves as normal unfiltered grid (no heading, no chip)
- [ ] `GET /producers?q=50%` → backend handles `%` as literal character (wildcard escaping), returns correct results (no SQL crash)
- [ ] `GET /producers?q=ח_ל_ב` → `_` treated as literal underscore, not LIKE wildcard

### Rate limiting
- [ ] Fire > 60 requests to `GET /search?q=x` in 1 minute → 429 response
- [ ] Fire > 30 requests to `GET /search/trending` in 1 minute → 429 response

---

## Google OAuth / CSP (fix #173, 2026-04-19)

- [ ] /login — open DevTools Console → zero CSP violations when page loads
- [ ] /login — click "כניסה עם Google" → Google popup opens and completes without postMessage error
- [ ] /login — Network tab → `accounts.google.com/gsi/style` loads with status 200 (not blocked)

---

## MEH-287 — Producer registration WhatsApp welcome

- [ ] `/register/producer` → submit הרשמה תקינה עם טלפון אמיתי → תוך 60 שניות מתקבלת הודעת WhatsApp "ברוכה הבאה למהמקור 🌿" — ודאי ש-TWILIO_* vars מוגדרים ב-Railway
- [ ] Response של `POST /auth/register/producer` בDevTools → Network → מכיל `whatsapp_sent: true` (כשTwilio מוגדר) או `whatsapp_sent: false` (כשחסר)
- [ ] Staging ללא `TWILIO_WHATSAPP_FROM` מוגדר → הרשמה חוזרת 200 + `whatsapp_sent: false` → success screen מציג banner צהוב diagnostic: "לא קיבלת הודעת WhatsApp? ייתכן שמספר הטלפון שגוי, או שתוכלי להמשיך ולהשלים את הפרופיל ישירות מהדשבורד." (טקסט בלבד — ללא כפתור; CTA הראשי "לדשבורד שלי" נשאר למטה) — MEH-302 dedupe
- [ ] Railway logs בזמן ההרשמה ה-"חסרה" → `[WHATSAPP] Producer welcome SKIPPED — missing: TWILIO_WHATSAPP_FROM` ברמת ERROR (לא warning)
- [ ] הרשמה עם `whatsapp_sent: true` → success screen מציג את הטקסט המקורי "שלחנו לך הודעת WhatsApp..." ללא banner

---

## MEH-326 — JWT refresh token flow

### Case A — Silent refresh on access expiry
- [ ] Login on staging, note timestamp
- [ ] Wait 16 minutes (access TTL = 15min)
- [ ] Click any protected action (e.g. favorite a producer)
- [ ] EXPECT: Action succeeds. No "פג תוקף ההתחברות" toast.
- [ ] DevTools → Network → `/auth/refresh` returned 200 immediately before the retried action request

### Case B — Forced logout when refresh expired / missing
- [ ] Login on staging
- [ ] DevTools → Application → Cookies → delete `refresh_token` cookie
- [ ] Edit `localStorage.token` to garbage (or wait for access to expire)
- [ ] Click any protected action
- [ ] EXPECT: "פג תוקף ההתחברות" toast appears. Page redirects to `/login`.

### Case C — logout-all-devices stays authenticated on current device
- [ ] Login on staging in browser A; login on staging in browser B (same account)
- [ ] In browser A: call `POST /auth/logout-all-devices`
- [ ] EXPECT browser A: stays authenticated (new access token + rotated refresh cookie)
- [ ] In browser B: click any protected action
- [ ] EXPECT browser B: receives 401 on next refresh attempt → "פג תוקף" toast + redirect to `/login`

## MEH-291 Phase 3 — Unified availability card across 5 surfaces (May 2026)

### Producer dashboard (/producer/dashboard)
- [ ] Open dashboard while logged in as a producer — איך לבדוק: navigate to `/producer/dashboard` — תוצאה מצופה: a single "מצב זמינות" card replaces the previous two stacked cards ("זמינות היום" + "סטטוס זמינות").
- [ ] Click "פתוח להזמנות" — תוצאה מצופה: pill highlights, no vacation date input shown.
- [ ] Click "זמינה היום 🟢" — תוצאה מצופה: pill highlights, no vacation date input.
- [ ] Click "עמוסה השבוע 🟠" — תוצאה מצופה: pill highlights, no vacation date input.
- [ ] Click "בהפסקה ⏸" — תוצאה מצופה: pill highlights, vacation date input + "שמרו" button appear below — BEFORE any save (MEH-999 reveal). No network request fired yet.
- [ ] Click "שמרו" with the date empty — תוצאה מצופה: inline red error "בחרו תאריך חזרה כדי לעבור להפסקה"; no POST to `/producers/me/availability-state` (client-side guard, no 422 round-trip).
- [ ] Pick a future date + click "שמרו" — תוצאה מצופה: POST `{state:"on_vacation", vacation_until:...}` succeeds; refresh page → still on vacation with the same date.
- [ ] Switch back to "פתוח להזמנות" — תוצאה מצופה: vacation date cleared.

### ProducerCard badge dot
- [ ] /map or /producers list, look at a producer with `availability_state='available_today'` — תוצאה מצופה: green dot next to the location line.
- [ ] Producer with `full_this_week` — תוצאה מצופה: orange dot.
- [ ] Producer with `on_vacation` — תוצאה מצופה: NOT visible in default `/producers` listing (default-hide). Visible only on direct slug / favorites / explicit `?availability_state=on_vacation`.

### ProducerDetail banners (/producer/[id])
- [ ] Producer with `accepting_orders` — תוצאה מצופה: AvailabilityBadge "פתוח להזמנות"; no extra banner.
- [ ] Producer with `available_today` — תוצאה מצופה: AvailabilityBadge "זמינה היום 🟢"; no extra banner.
- [ ] Producer with `full_this_week` — תוצאה מצופה: amber banner "⏳ זמני תגובה ארוכים יותר השבוע" below the highlights strip.
- [ ] Producer with `on_vacation` — תוצאה מצופה: slate vacation banner "🌙 בית עסק זה בהפסקה כרגע" + return-date label. The full-this-week banner is suppressed.

### Admin form (/admin/producers/new + /admin/producers/[id])
- [ ] Open admin producer form — תוצאה מצופה: "מצב זמינות" section shows 4 radio pills matching dashboard labels.
- [ ] Choose "בהפסקה ⏸" — תוצאה מצופה: vacation date field appears below.
- [ ] Save form — תוצאה מצופה: PUT `/admin/producers/{id}` succeeds with `availability_state` in payload.
- [ ] Reload edit page — תוצאה מצופה: form pre-populates with the saved state.

### Friday delivery strip (homepage)
- [ ] Load homepage on a Thursday/Friday window — תוצאה מצופה: strip shows producers where `availability_state='available_today'` (Network tab: GET `/producers?availability_state=available_today&page_size=12`).

### Default `/producers` listing change
- [ ] Mark a test producer as `on_vacation` via the dashboard or admin form — תוצאה מצופה: producer disappears from the default `/producers` list.
- [ ] Hit `GET /producers?availability_state=on_vacation` directly — תוצאה מצופה: producer appears.
- [ ] Visit producer's direct slug URL — תוצאה מצופה: detail page still loads with the vacation banner.

## MEH-408 Phase 4 — DR drill (one-time, before MEH-408 closes)

Disaster-recovery drill — proves that a backup file in R2 actually
restores into a working Postgres DB. "You have a backup" is not true
until you have demonstrated the restore. Smadar runs this once;
record the outcome in HANDOFF.md.

Prereqs:
- PostgreSQL 18 client on PATH (`/c/Program Files/PostgreSQL/18/bin/`)
- `python` + `boto3` available locally (or run via the cron Docker image)
- R2 credentials in shell env (sourced from `.env.staging`)

Drill steps:

- [ ] **1. Find latest R2 backup.**
      `aws s3 ls s3://mehamakor-backups/ --endpoint-url $R2_ENDPOINT | tail -1`
      תוצאה מצופה: filename with today's or yesterday's date (cron just ran).

- [ ] **2. Create empty test DB locally.**
      `createdb mehamakor_dr_test`
      תוצאה מצופה: command exits 0, no errors.

- [ ] **3. Restore via the script.**
      `python scripts/restore_from_backup.py --latest postgresql://localhost/mehamakor_dr_test`
      תוצאה מצופה: exit 0, log lines show download + pg_restore + row-count table.

- [ ] **4. Verify row counts roughly match production.**
      Manually compare the script's row-count summary to production
      (Railway dashboard → Postgres → Data, or
      `psql $DATABASE_URL -tAc "SELECT count(*) FROM producers;"` from
      Smadar's terminal against the public proxy URL).
      תוצאה מצופה: counts match within ±1% (drift OK if backup is hours old).

- [ ] **5. Drop the test DB.**
      `dropdb mehamakor_dr_test`
      תוצאה מצופה: clean up the local artifact.

- [ ] **6. Log the result.**
      Add a one-liner to HANDOFF.md under MEH-408 Phase 4:
      `DR drill executed YYYY-MM-DD — restored mehamakor_<env>_<timestamp>.dump → row counts match — Phase 4 closed.`

## Cloudinary Orphan Cleanup (MEH-375)

Operator script: `backend/scripts/cleanup_cloudinary_orphans.py`

### Dry-run (read-only, safe)

From inside a Railway-deployed container (where `DATABASE_URL` resolves to the internal Postgres host):

    cd backend
    python -m scripts.cleanup_cloudinary_orphans

From a local machine (where the internal host is unreachable), override `DATABASE_URL` with the public proxy:

    DATABASE_URL="<DATABASE_PUBLIC_URL value>" python -m scripts.cleanup_cloudinary_orphans

Default behavior: lists Cloudinary assets under prefixes `mehamakor/` and `mehamakor/avatars/`, queries 8 DB image sources (`User.avatar_url`, `Producer.story_card_url`, `Product.image_url`, `HomeProduct.photo`, `Event.image_url`, `Experience.image_url`, `Producer.images[]`, `HomeProduct.images[]`), computes orphans via `secure_url` string equality, and prints a summary block to stdout.

Expected stdout output:

    ============================================================
    Cloudinary candidates (after filters): <M>
    DB-referenced URLs:                    <N>
    Orphans:                               <K>
    Orphan total bytes:                    <bytes> (<human-readable>)

    First 5 orphan public_ids:
      - mehamakor/...
      - ...
    Re-run with --apply to delete.
    ============================================================

Operational logs go to stderr (INFO/ERROR level). Capture separately with:

    python -m scripts.cleanup_cloudinary_orphans > out.log 2> err.log

### Abort conditions (do NOT proceed to --apply if any of these are true)

- Stacktrace in stderr or exit code != 0
- K (orphans) > 50% of M (Cloudinary candidates) — suggests `secure_url` format mismatch between DB-stored URLs and Cloudinary listing; investigate before deleting
- K = 0 with M > 0 and you expected orphans — filter logic may be too aggressive
- Sample public_ids do not start with `mehamakor/` — wrong prefix filter
- WARNING or ERROR lines in stderr beyond the standard INFO flow

### Apply mode (destructive)

Only after a clean dry-run with no abort conditions:

    python -m scripts.cleanup_cloudinary_orphans --apply --yes

`--apply` enables destructive mode. `--yes` skips the interactive confirmation prompt (required for cron/CI; omit for manual runs to get a "type yes to confirm" gate).

Expected stdout output:

    ============================================================
    Apply complete: deleted=<D> not_found=<NF> errors=<E>
    Status: CLEAN — exit code 0
    ============================================================

Where:
- `deleted` = number of assets successfully removed
- `not_found` = assets already gone (idempotent, not an error)
- `errors` = assets that failed to delete (Cloudinary API error)

Status values: `CLEAN` (errors=0), `PARTIAL` (errors>0 — some assets not deleted, re-run to retry).

### Verification (post-apply)

Re-run in dry-run mode immediately after `--apply`:

    python -m scripts.cleanup_cloudinary_orphans

Expected: `Orphans: 0`. If orphans remain, they were either uploaded after the `--apply` run or are in a prefix not covered by the default list.

### Options

- `--prefix PREFIX` — override default prefixes (can specify multiple times)
- `--min-age-hours N` — skip assets younger than N hours (default: 24). Prevents race with in-flight uploads.
- `--batch-size N` — Cloudinary delete batch size, max 100 (default: 100)

### Exit codes

- 0 — success (dry-run: computed cleanly; apply: CLEAN or PARTIAL with not_found only)
- 1 — error (DB connection failed, Cloudinary listing failed, or delete errors > 0)

### Known limitation

Story-card assets under `mehamakor/producers/*` are excluded from cleanup by the reserved-prefix reject list (`RESERVED_PUBLIC_ID_PREFIXES` in `cloudinary_utils.py`). When a producer is deleted, their story-card asset remains in Cloudinary as an untouchable orphan (~few KB each). Tracked for follow-up (R1: story-card orphan accumulation post-producer-delete).

---

# Autonomous PR pipeline (MEH-551)

תיעוד הסדר של pipeline autonomous PR — מה enabled, מה deferred, ומתי יופעל הבא.

## Phase 0 + 1 — OAuth & MCP wiring (DONE)

- ✅ `vercel` MCP — OAuth complete; CC can read deployment status, list previews, fetch build logs autonomously
- ✅ `sentry` MCP — OAuth complete; CC can run pre/post-merge issue-diff via `search_issues` + `analyze_issue_with_seer`
- Auth-token expiry: tokens last ~30 days. If MCP calls start failing silently, run `/mcp auth <server>` interactively (~30s)

## Phase 2 — `/autofix-pr` slash command (DEFERRED)

Built but not yet validated against a live CI failure. **Trigger to test:** when the next batch PR fails CI, run `/autofix-pr` instead of fixing manually. Until then `/autofix-pr` is unproven on this repo's failure modes.

## Phase 3 — Cloud Auto-Fix (DEFERRED)

Blocked by Phase 2. Cloud Auto-Fix wires `/autofix-pr` into a GitHub Action so failures fix themselves before Smadar even sees them. Don't enable until Phase 2 has at least 2 successful runs against real failures (not synthetic).

## Pro plan caveat — token inflation

Claude Code v2.1.100+ shows ~40% token inflation on Pro plans for slash commands that load multi-file context. **Use `/autofix-pr` selectively** — preferred for failure modes the 3 documented patterns can fix (package-lock drift, ESLint warnings, pre-commit filename bug). Don't auto-trigger on every CI failure or quota burns fast.

## Brand voice enforcement (MEH-472 hybrid)

Brand-voice grep canary lives inside `/batch` (created in MEH-344, `.claude/commands/batch.md`). Pipeline's autonomous loops route brand-sensitive copy through that grep before any commit:

- Functional UI → gerund (`בטעינה`, `מתעדכן`)
- CTAs → plural imperative (`הוסיפו`, `הצטרפו`) — never feminine `הוסיפי`/`הצטרפי`/`בואי`/`הזיני`
- Producer term → `בית עסק` only, never `יצרן/ית`

## Status summary

| Phase | Status | Next action |
|---|---|---|
| 0 — Pre-flight | DONE | — |
| 1 — MCP OAuth | DONE | — |
| 2 — `/autofix-pr` validation | DEFERRED | Run on next real CI failure |
| 3 — Cloud Auto-Fix wiring | DEFERRED | After Phase 2 succeeds 2x |

---

# Load testing (MEH-559)

One-time pre-launch baseline via k6. NOT in CI. Script: `scripts/load-test.js`. Full runbook + result template: [docs/research/k6-load-testing-baseline.md](./research/k6-load-testing-baseline.md).

## When to (re-)run

- [ ] Once, the week before public launch (the canonical MEH-559 run).
- [ ] After any major backend refactor of `backend/app/routers/producers.py`, `chat.py`, or `favorites.py`.
- [ ] After a Railway plan change (free -> hobby -> pro) — the latency numbers shift and the baseline must be re-anchored.
- [ ] After any Anthropic model swap on `/chat` (Haiku -> Sonnet, version bumps) — verify the `/chat` p95 still fits the SLA.

## Env vars required

- `BASE_URL` — default `https://staging.mehamakor.online`. **Do not point at production.**
- `VERCEL_BYPASS_TOKEN` — same value as `VERCEL_AUTOMATION_BYPASS_SECRET` in GitHub Actions (see `frontend/playwright.config.ts:38`).
- `PRODUCER_SLUG`, `PRODUCER_ID` — fetch a real pair from `/producers` first so the latency numbers aren't dominated by 404 paths.

## How to interpret

- p95 < 2000ms + error rate < 1% per endpoint = SLA met.
- `/chat` is expected to return mostly 429s — the rate-limiter trip is the intended observation.
- `favorites_unauth` is expected to return 401 on every request — measures auth-rejection latency.
- p99 > 5s or `X-Railway-Fallback: true` headers = Railway throttling; consider plan upgrade before launch.
| 4 — Documentation | THIS PR | — |

## UIS Pattern A (MEH-228) — admin double-submit protection

- [ ] `/admin/reports` — לחיצה כפולה מהירה על "השעה"/"אשר"/"הסר"/"שחזר" — תוצאה: הפעולה רצה פעם אחת, הכפתור מושבת בזמן הבקשה
- [ ] `/admin/users` — לחיצה כפולה על "חסום/בטל חסימה" — תוצאה: בקשה אחת, כפתור מושבת בזמן הריצה
- [ ] `/admin/content` (מוצרי בית מוסתרים) — לחיצה כפולה על "שחזר"/"מחק" — תוצאה: בקשה אחת
- [ ] `/admin/producers` — לחיצה כפולה על "אשר"/"השעה"/"שגרירה"/"מחק" — תוצאה: בקשה אחת, הכפתור מושבת
- [ ] כשל רשת על כל פעולת אדמין מהנ"ל — תוצאה: toast שגיאה בעברית (לא כשל שקט)

## /map producer card — distance from user (MEH-826 Gap 2)

מרחק חושב client-side (haversine) מ-GPS המשתמשת ל-lat/lng של בית העסק. ה-GPS נשמר ב-sessionStorage (כפתור "קרובים אליי") — אין fetch/backend.

- [ ] **GPS פעיל** — `/he/map` אחרי אישור מיקום → כל כרטיס בית עסק עם קואורדינטות מציג שורת מרחק, למשל `2.5 ק"מ ממך` — איך לבדוק: לאשר הרשאת מיקום → לפתוח את רשימת הכרטיסים — תוצאה מצופה: שורת מרחק עם המספר מיושר LTR (ספרה משמאל, "ק"מ ממך" אחריה), בלי שבירת bidi
- [ ] **אין GPS** — `/he/map` בלי אישור מיקום (או דחייה) → אף כרטיס לא מציג שורת מרחק — תוצאה מצופה: השורה נעלמת בחן, שאר הכרטיס תקין
- [ ] **/en** — אותו כרטיס באנגלית → המרחק עדיין בפורמט העברי המשותף (`formatDistance`), עקבי עם `ProducerCard`

## MEH-848 — error toasts collapsed to error.generic (i18n refactor)

11 הודעות שגיאה כלליות כפולות אוחדו למפתח אחד `error.generic`; `lib/errors.js` עבר ל-i18n. **Copy-only — הטקסט צריך להישאר זהה.** לבדוק שהטוסט/הודעת השגיאה עדיין מופיע בעברית תקינה (לא מפתח גולמי כמו `error.generic`).

- [ ] **התחברות נכשלת** — `/he/login` עם פרטים שגויים → הודעת "משהו השתבש, נסו שוב" (או ה-detail מהשרת) — לא מחרוזת מפתח
- [ ] **מועדף בכרטיס (ProducerCard)** — לחיצה על לב כשמנותקים/כשל רשת → טוסט "משהו השתבש, נסו שוב"
- [ ] **שליחת ביקורת נכשלת** (`ReviewsSection`) + **קבוצת רכש** (`GroupBuyDetailClient`) → אותה הודעה כללית
- [ ] **/en** — אותם מסכים באנגלית → "Something went wrong, try again" (לא מפתח גולמי, פריטי he/en זהים)

## /map list heading + subhead (MEH-826 Gap 3)

שורת הספירה ברשימת ה-`/map` (desktop split-view) נושאת את הקופי הנעול + subhead "קרוב אליך · {region}" מתחתיה. ה-h1 הסמנטי ("מפת בתי עסק") נשאר.

- [ ] **שורת ספירה** — `/he/map` desktop → מעל רשימת הכרטיסים מופיע "{N} בתי עסק מקומיים באזור" (לא "{N} בתי עסק" בלבד) — תוצאה מצופה: הקופי הנעול, עם המספר בצורת רבים/יחיד נכונה (0 → "אין בתי עסק מקומיים באזור", 1 → "בית עסק מקומי אחד באזור")
- [ ] **subhead** — בחרי עיר (או GPS פעיל) → מתחת לשורת הספירה מופיע "קרוב אליך · {שם העיר}" — תוצאה מצופה: subhead מוצג רק כשיש עיר/region; אין עיר → ה-subhead נעלם (בלי "·" תלוי)
- [ ] **h1 נשאר** — ה-h1 "מפת בתי עסק" עדיין בראש ה-pane (לא הוסר) — תוצאה מצופה: אין כותרת כפולה גלויה "בתי עסק" מוערמת
- [ ] **/en** — `/en/map` → "{N} local businesses in your area" + "Near you · {city}"

## MEH-992 — group-buy dashboard form clarity

טופס יצירת קבוצת רכש (`/he/producer/dashboard/group-buys` → "+ קבוצת רכש חדשה"). Copy חדש ב-he.json בלבד (functional/neutral, ADR-024); en.json לא נגעו.

- [ ] **₪ בשדות מחיר** — פתחי את הטופס → בשני שדות המחיר (רגיל + קבוצתי) מופיע ₪ בצד ימין של השדה, המספר מיושר לצדו — תוצאה מצופה: הסמל לא חופף לספרות; RTL תקין במובייל 375px
- [ ] **helper מחיר לפני שליחה** — הזיני מחיר קבוצתי ≥ מחיר רגיל (למשל 25 מול 20) → הטקסט "המחיר הקבוצתי חייב להיות נמוך מהמחיר הרגיל." הופך אדום וכפתור "צרו קבוצת רכש" מושבת — תוצאה מצופה: לא מגיעים ל-400 גולמי מהשרת; מחיר תקין (קבוצתי < רגיל) → ה-helper מהוסה והכפתור פעיל
- [ ] **helper מועד אחרון** — מתחת לשדה המועד האחרון מופיע "המועד האחרון להצטרפות, לפי שעון ישראל." — תוצאה מצופה: מבהיר מה המשמעות של התאריך + אזור הזמן
- [ ] **intro מושג** — מתחת לכותרת "קבוצת רכש חדשה" מופיעה שורה אחת שמסבירה מה זו קבוצת רכש (מספיק לקוחות → מחיר סיטונאי)

## MEH-997 — עמוד מודרציית מתכונים חדש (/admin/recipes)

ה-backend של מודרציית מתכונים (MEH-589) חי מאז האפיק של המתכונים, אבל עמוד האדמין מעולם לא נבנה — מתכון שהוגש ישב ב-pending בלי שום מסך שמציג אותו. העמוד החדש משקף 1:1 את `/admin/experiences`.

- [ ] **קישור בסיידבר** — התחברי כמנהלת → בסיידבר של האדמין מופיע "מתכונים" (אייקון לחם) בין "חוויות" ל"משתמשים" — תוצאה מצופה: לחיצה מובילה ל-`/admin/recipes`
- [ ] **תור ממתינים** — צרי מתכון כבעלת עסק (`/producer/dashboard/recipes`) → פתחי `/admin/recipes` כמנהלת → תוצאה מצופה: המתכון מופיע בטאב "ממתינים" עם סטטוס "ממתין" ו"לא פורסם"
- [ ] **badge בסיידבר** — כשיש מתכון ממתין → תוצאה מצופה: המונה ליד "לוח מחוונים" בסיידבר כולל אותו (pending_moderation_count)
- [ ] **אישור** — לחצי "אשרי" → תוצאה מצופה: toast "המתכון אושר ופורסם"; המתכון עובר לטאב "מאושרים"; מופיע בעמוד הציבורי של בית העסק
- [ ] **בקשת שינויים** — "שינויים" בלי הערה → נחסם ("יש למלא הערה"); עם הערה → המתכון עובר ל"דרוש תיקון" ובעלת העסק רואה את ההערה בדשבורד שלה
- [ ] **דחייה** — "דחי" עם סיבה → המתכון עובר ל"נדחו" ולא מופיע בעמוד הציבורי
- [ ] **טאבים** — מעבר בין 5 הטאבים (ממתינים / דרוש תיקון / מאושרים / נדחו / הכל) — תוצאה מצופה: כל טאב מסנן לפי הסטטוס שלו; טאב ריק מציג "אין מתכונים בסטטוס הזה"
- [ ] **מובייל 375px** — העמוד נטען, הטבלה נגללת אופקית בתוך הכרטיס, הטאבים נגללים — תוצאה מצופה: אין גלילה אופקית של העמוד כולו
