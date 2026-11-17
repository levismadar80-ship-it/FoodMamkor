**התשובה:** מקור האמת צריך להישאר בית העסק עצמו. הדרך הזולה והחוקית: תזכורת בוואטסאפ עם כפתור «עדיין נכון» לפני יום משלוח, ותג «אושר ע״י בית העסק · לפני N ימים» ליד הזמינות. סריקה של אתר/אינסטגרם/גוגל רק **מציעה** שינוי לאדמין — לא מפרסמת. מחיר, רישיון וסגירה תמיד מחכים לאישור בקליק.

# מידע עדכני ומקור אמת לכל נתון

> **דוח מחקר בלבד** — לא שונה קוד. ההחלטות של ספיר ([decisions.md](../../.claude/rules/decisions.md)).
> נכתב 17/11/2026 מול `origin/staging` ‏(`e43e137`). אין כאן ייעוץ משפטי: מה שלא נקרא במקור רשמי מסומן «לא אומת».
> הדמיות מיקום (סכמטיות): [`qa-artifacts/research-2026-11-17/t1-freshness/`](../../qa-artifacts/research-2026-11-17/t1-freshness/)

> **בדיקת כפילויות (17/11):** Linear: «זמינות», «עודכן לאחרונה», «סריקה» → אין מחקר קודם. קרובים: MEH-2697 (תזכורת שנתית «עדיין נכון?» לתגים מוצהרים — אותו דפוס, לתגים), MEH-3299 (פרטי קשר ממקורות ציבוריים), MEH-3211 (סיכום שבועי). GitHub: אין PR או דוח על הנושא.

---

## 1. מה יש היום בקוד

| נתון | איפה | איך מתעדכן |
|---|---|---|
| זמינות (`accepting_orders` / `on_vacation`) | `backend/app/models/models.py:440-446` | בית העסק בלוח הבקרה; חופשה מסתיימת לבד (`vacation_until`, ‏`:447`) |
| שעות פתיחה — טקסט חופשי | `models.py:448` | בית העסק |
| חלון קבלת הזמנות + חריגים לפי תאריך | `models.py:467` (`order_window`), ‏`:492` (`special_hours`) | בית העסק |
| מלאי למוצר | `backend/app/models/catalog.py:116` (`in_stock`) | בית העסק |
| «עודכן לאחרונה» — **תאריך אחד לכל הדף** | `models.py:538` (`updated_at`, ‏NULL כן) · מוצג בשורת ההערות: `frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx:869-872` | כל עריכה |
| דירוג גוגל | `backend/app/routers/google_rating.py:1-25` | נשלף חי בכל בקשה, **לא נשמר** (תנאי גוגל) |
| קבלת הודעות וואטסאפ | `backend/app/routers/whatsapp_webhook.py:1-25` | webhook חתום HMAC; שומר הודעות נכנסות, לא מפרש |
| שליחת תבניות וואטסאפ | `backend/app/services/whatsapp.py`, ‏`whatsapp_templates.py` | קיים (התראות מועדפים, `routers/alerts.py:36-37`) |
| סיכום שבועי במייל לבעלים | `models.py:681-686`, ‏`services/weekly_owner_summary.py` | כבוי מאחורי דגל (MEH-3211) |

**הפער:** אין מקור ותאריך **לכל נתון**. יש תאריך אחד לכל הדף, והוא זז גם כשמשנים תמונה —
אז הוא לא אומר אם השעות או המחירים נבדקו. ‏`bio_generator.py:7-10` כבר מתעד שסריקת אינסטגרם
מ-Railway נכשלה (אינסטגרם חוסם כתובות של שרתי ענן).

## 2. איך האתרים הגדולים עושים את זה

| אתר | מה עושה | מקור |
|---|---|---|
| **Wolt** | בעל העסק מכבה מוצר שאזל באפליקציה (Listing manager → Disable item). תפריט שמחובר לקופה נערך **רק בקופה**. | [Wolt Merchant — Manage menu](https://merchant.wolt.com/en/isl/learning-center/manage-menu) |
| **Google Business Profile** | כשמקורות מדווחים שהמידע של הבעלים שגוי, הפרופיל מקבל «עדכונים מגוגל» שהבעלים רואה ליד המידע המקורי, ויכולה לשלוח מחדש או לדחות. עריכה של הבעלים נבדקת בדרך כלל תוך 10 דקות, לפעמים עד 30 יום. חלון של 4 ימים לאישור הצעת גולשת: דיווח משני מספטמבר 2026. | [Manage Google updates](https://support.google.com/business/answer/3480441?hl=en) · [Edit status](https://support.google.com/business/answer/3038311?hl=en) · [4 ימים (משני)](https://www.digitalapplied.com/blog/google-business-profile-suggested-edits-4-day-deadline) |
| **Too Good To Go** | בית העסק משנה כל יום כמה שקיות יש; לוח זמנים קבוע מראש ב-MyStore, «ימים מיוחדים», וביטול מראש כשאין עודף. | [TGTG Business FAQ](https://www.toogoodtogo.com/en-ie/business/faq) · [MyStore schedule](https://www.toogoodtogo.com/en-ie/blog/your-too-good-to-go-schedule) |
| **TripAdvisor** | הבעלים מעדכנת שעות ופרטים ב-Management Center. | [Tripadvisor for Restaurants](https://www.tripadvisor.com/ForRestaurants/r4271) |
| **Yelp** | שעות מיוחדות; «סגור זמנית» מציג באנר אדום עם תאריך חזרה; עסק סגור יורד בהדרגה מהתוצאות. | [Yext — Yelp closed behavior](https://hitchhikers.yext.com/docs/listings/yelp-closed-behavior/) (תיעוד אינטגרציה, לא Yelp עצמה) |
| **Untappd** | שתי שכבות: «מקומות מאומתים» (בתפריט שלהם) מול «כל המקומות» (משתמשים סימנו ב-15 יום האחרונים). | [Untappd Find It](https://help.untappd.com/hc/en-us/articles/360040808131--How-to-use-the-Find-It-feature) |

הדפוס המשותף: **מה שבית העסק אמר** מוצג אחרת ממה שאחרים אמרו או שנאסף אוטומטית, וחלק
מהשינויים (שעות, סגירה) עוברים דרך הבעלים.

## 3. ערוצי עדכון — מה אפשרי

**הודעת וואטסאפ אחת.** מחיר לפי הודעה מ-1/7/2025; הודעה מבית העסק פותחת חלון של 24 שעות
שבו תשובות חינם, ותבנית «utility» בתוך החלון חינם ([Meta — Pricing](https://developers.facebook.com/docs/whatsapp/pricing)).
תזכורת מתוזמנת תגיע כמעט תמיד **מחוץ** לחלון, ולכן היא תבנית בתשלום. מחיר לישראל: **לא אומת** —
ברשימת המחירים הניתנת להורדה מאותו דף. התשובה מגיעה ל-webhook הקיים; כפתורי תשובה מהירה
חוסכים פענוח טקסט חופשי.

**תזכורת לפני יום משלוח.** יש כבר בקוד את הימים (`order_window`, ‏`special_hours`) — אפשר
לגזור «יום לפני» בלי שדה חדש. *הוסק, לא נבדק בריצה.*

**חיבור לקופה.** Wolt מראה שזה עובד אצל פלטפורמת משלוחים; לבתי עסק קטנים במהמקור (חוות,
מאפיות ביתיות מורשות) רוב אין קופה עם API. **לא נבדקו** Tabit / Beecomm / קספית. לא כדאי לתכנן סביב זה עכשיו.

## 4. סריקה שבועית — מה מותר

| מקור | מצב | מקור |
|---|---|---|
| אינסטגרם | Basic Display API נסגר ב-4/12/2024. נשאר רק API לחשבון עסקי **שמחבר את עצמו** לאפליקציה (הסכמת הבעלים). סריקה בלי חיבור אינה דרך רשמית, ומ-Railway היא גם לא עובדת (`bio_generator.py:7-10`). | [Meta, 4/9/2024](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api) |
| גוגל (Places) | מותר לשמור `place_id`; שאר תוכן Places אסור לשמור (הקוד כבר עובד כך, `google_rating.py:9-13`). | הקוד מצטט ToS §3.2.3(b); הדף עצמו **לא נקרא מחדש** היום |
| Google Business Profile API | לבעלים/מנהלים של המיקום בלבד. | **לא אומת** |
| האתר של העסק | מותר טכנית; לכבד robots.txt ולהזדהות. | [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309) (לא נקרא היום) |

## 5. הצד המשפטי בישראל (לא ייעוץ)

- **תיקון 13 לחוק הגנת הפרטיות** (בתוקף מ-14/8/2025). פרטי קשר של עוסק יחיד הם מידע אישי. סקירה
  של TechPolicy: אין בסיס «אינטרס לגיטימי» כמו ב-GDPR, וחובת ההודעה (סעיף 11) לא ברורה כשהמידע
  לא נאסף מהאדם עצמו. [סקירה (לא טקסט רשמי)](https://techpolicy.org.il/wp-content/uploads/2024/10/Overview-of-Amendment-No-13.pdf).
- **הרשות להגנת הפרטיות חתמה** על ההצהרה המשותפת המסכמת של 16 רשויות על סריקה: מידע אישי
  נגיש לציבור עדיין מוגן, ו«רשות בחוזה» לסרוק לא הופכת את זה לחוקי.
  [ההצהרה](https://pcpd.org.hk/tc_chi/news_events/media_statements/files/ConcludingStatement_English_FINAL.pdf).
  (בהצהרה של 2023 ישראל לא הייתה בין החותמות.)
- **טיוטת הנחיית הרשות להגנת הפרטיות (28/4/2025)** על חוק הגנת הפרטיות ומערכות AI: כריית מידע אישי
  מהרשת בלי הסכמה מדעת היא פגיעה אסורה בפרטיות, גם כשהאדם פרסם את המידע בעצמו; ובעלי אתרים נדרשים
  למנוע כרייה אסורה מהאתר שלהם. ההקשר שם הוא אימון מודלים — לא בדיוק השימוש שלנו, אבל העיקרון חל.
  [gov.il — טיוטה](https://www.gov.il/BlobFolder/rfp/ai_reg/he/ai%20regu_draft.pdf) · ובנוסף טיוטת
  גילוי הדעת על **הסכמה** (2/2025): [gov.il](https://www.gov.il/BlobFolder/rfp/consent2025/he/consent2025.pdf).
- **פסיקה:** לפי סקירה של עורך דין (6/2025, משני) אין בישראל חוק או פסק דין מנחה שאוסר סריקה באופן
  גורף; חוק המחשבים (1995) אוסר שיבוש, וסריקה לא בהכרח משבשת. בית משפט השלום (2004) קבע שאין
  בחוק הגדרה מספקת ל«חדירה» ([law.co.il](https://www.law.co.il/computer-law/2004/02/29/default-slug-60/)).
  זכויות יוצרים על מאגרי נתונים עובדתיים: **לא אומת.**
- כבר יש במאגר כרטיס פתוח על פרטי קשר ממקורות ציבוריים במדיניות הפרטיות (MEH-3299, In Progress).

המסקנה המעשית: **נתון שבית העסק מסר בעצמו** בטוח יותר משפטית וגם נכון יותר. סריקה מתאימה
רק כ«רמז» שאדמין בודקת — ולא לשמור ממנה פרטים אישיים.

## 6. מקור ותאריך לכל נתון

schema.org מגדיר `dateModified` ו-`validFrom`/`validThrough` לשעות (לא נקרא היום, ידוע מהמפרט).
לא נמצא תקן תעשייתי ל«מקור לכל שדה»; הצעה (לא מחקר): טבלה אחת
`(producer_id, field, source, confirmed_at, confirmed_by)` עם `source ∈ {owner, admin, crawl_suggestion}`.
זה שינוי סכמה → Alembic → RED, ומחכה להחלטה.

## 7. אפשרויות

**א — תזכורת וואטסאפ עם כפתור «עדיין נכון» + תג תאריך ליד הזמינות**
- בעד: הכי קרוב למה ש-Wolt ו-TGTG עושים — בית העסק הוא המקור. לחיצה אחת. נשען על webhook ותבניות שכבר קיימים. חוקי בלי שאלות.
- נגד: עלות לכל הודעה (מחיר ישראל לא אומת); תבנית צריכה אישור Meta; בית עסק שלא עונה נשאר עם תאריך ישן.

**ב — סריקה שבועית שמציעה שינויים לאדמין**
- בעד: תופסת שינויים שבית העסק שכח לדווח (סגירה, מחיר חדש באתר שלו). מגן על אמינות המגזין בלי לחכות לבעלים.
- נגד: אינסטגרם לא נגיש רשמית; גוגל אסור לשמור; עומס על האדמין; שאלה משפטית פתוחה (תיקון 13 + הצהרת הסריקה).

**ג — «עודכן» לכל קטע (שעות, מחירים, משלוחים) במקום תאריך אחד**
- בעד: הקוראת יודעת בדיוק מה ישן. Google ו-Untappd מבדילים מקור.
- נגד: דורש עמודה/טבלה חדשה (Alembic); יותר טקסט קטן בדף.

**ד — להשאיר כמו שזה**
- בעד: אפס עלות; לפני ההשקה יש מעט בתי עסק ואפשר לבדוק ידנית.
- נגד: תאריך אחד שזז בכל שינוי תמונה מטעה; אין מנגנון שמזכיר.

## 8. המלצה, לפי סדר

| # | מה | עלות | אבטחה/פרטיות | מתי |
|---|---|---|---|---|
| 1 | **א**, שלב 1: תבנית utility אחת («האם המידע עדיין נכון? כן / לעדכן») יום לפני יום הזמנות, רק לבתי עסק ש-opt-in לוואטסאפ | פיתוח 1–2 ימים · Meta לפי הודעה | webhook כבר חתום HMAC; לאמת שהמספר שמשיב הוא של בית העסק | אחרי ההשקה, כשיש ≥20 בתי עסק פעילים |
| 2 | **ג** בגרסה קטנה: «אושר ע״י בית העסק · לפני N ימים» רק ליד הזמינות (הדמיה א׳) | עמודה אחת `availability_confirmed_at` + Alembic (RED) | אין | יחד עם 1 |
| 3 | **ב** רק לאתר של העסק (לא אינסטגרם/גוגל), כרמז לאדמין, בלי לשמור פרטים אישיים | 2–3 ימים | לבדוק עם עו״ד לפני; לכבד robots.txt | לא לפני שיש תקלות אמיתיות של מידע ישן |
| — | מחיר, רישיון, סגירה: **תמיד** אישור בקליק (של בית העסק או האדמין) | — | — | עיקרון |

**הדמיות:** א׳ שורה מתחת לעובדות · ב׳ שורה בכל קטע · ג׳ רק בשורת ההערות (כמו היום, מפורט).
קבצים: `a-header-status-{375,1440}.webp`, `b-per-section-…`, `c-fine-print-only-…`.
ההדמיות סכמטיות: production ו-staging חסומים לרשת מה-sandbox הזה, ואין `node_modules` לבנייה מקומית.

## מקורות

- [Wolt Merchant — Manage menu](https://merchant.wolt.com/en/isl/learning-center/manage-menu)
- [Google Business Profile — hours](https://support.google.com/business/answer/10417060)
- [Untappd — Find It](https://help.untappd.com/hc/en-us/articles/360040808131--How-to-use-the-Find-It-feature)
- [WhatsApp Business Platform — Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- [Meta — Instagram Basic Display API update](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api)
- [Joint concluding statement on data scraping](https://pcpd.org.hk/tc_chi/news_events/media_statements/files/ConcludingStatement_English_FINAL.pdf)
- [Overview of Amendment 13 (TechPolicy)](https://techpolicy.org.il/wp-content/uploads/2024/10/Overview-of-Amendment-No-13.pdf)
- [RFC 9309 — robots.txt](https://www.rfc-editor.org/rfc/rfc9309)
