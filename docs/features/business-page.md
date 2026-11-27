# דף בית העסק

**מה הוא עושה.** המסך הציבורי של בית עסק: גלריה וסיפור, מוצרים, שעות פתיחה, אזורי משלוח, ערוץ יצירת קשר, תגים, ביקורות, ומה שבית העסק מפעיל (קבוצת רכישה, אירוע, מתכון, שקית). זה המסך שכל שאר האתר מוביל אליו.

**Routes**
* `frontend/app/[locale]/producer/[id]/` — הדף לפי מזהה. לבית עסק שיש לו slug, הכתובת הזאת היא הפניה קבועה (308) לכתובת שלו, `/{slug}` או `/en/{slug}`, עם ה-query (MEH-3708). ה-308 נוצר ב-`frontend/middleware.js`, והדף עצמו מפנה גם הוא למקרים שה-middleware מדלג עליהם. עם `?preview=1` הדף נשאר בכתובת המזהה, והטסטים שמחליפים את נתוני הדף משתמשים בזה.
* `frontend/app/[locale]/[slug]/` — אותו דף לפי slug; זו הכתובת הקנונית כשיש slug.
* `frontend/app/[locale]/p/[slug]/` — קישור קצר.
* `frontend/app/[locale]/business-gone/` — בית עסק שהוסר.

**404 אמיתי (MEH-3024).** ‏`/producer/<id>` של בית עסק שלא קיים, או שעדיין לא אושר, עונה 404 אמיתי מה-middleware ולא 200 עם «לא נמצא». בעלת עסק שעוד לא אושר לא מגיעה לשם: «צפייה בדף» בתפריט החשבון ובכרטיסי העריכה שולח אותה ל-`/producer/dashboard/preview`, כמו הקישור בראש לוח הבקרה.

**קבצים מרכזיים**
* `frontend/app/[locale]/producer/[id]/components/ProducerHeader.jsx` — כותרת, מצב חופשה. הלוגו של העסק (MEH-3611, `frontend/components/BusinessLogo.jsx`) ליד השם; בעסק בלי תמונות הוא בכותרת הצבעונית (`frontend/components/ImageGallery.jsx`).
* `frontend/app/[locale]/producer/[id]/components/ContactCard.jsx` — ערוץ הקשר הראשי, ‏WhatsApp מוכן מראש, והקישור של בית העסק לערוץ או לקבוצת WhatsApp, שנקרא בשם שלו («ערוץ וואטסאפ» / «קבוצת וואטסאפ») ולא «עדכונים», כי הפעמון היחיד בדף הוא עדכונים ממהמקור (MEH-3585). גם דף המארגן מציג אותו (MEH-3459), בלי שאלות מוכנות — הן בסעיף «שאלות נפוצות» של דף העסק (MEH-3460); השומר `frontend/__tests__/ContactCardOneOwnerGuard.test.js`.
* `frontend/app/[locale]/producer/[id]/components/StickyContactBar.jsx` — הפס הדביק בנייד.
* `frontend/components/WhatsAppQuestionChips.jsx` · `frontend/lib/quick-answers.js` — סעיף «שאלות נפוצות» (`#section-faq`) בגוף הדף, מתחת ל«משלוחים», ולא בכרטיס הקשר. כשסעיף המשלוח מוצג (`hasDeliverySection`) לא שואלים על משלוח. אין «איך מזמינים?» ואין «שאלה אחרת? צרו איתנו קשר», כי שתיהן רק חזרו על הכפתור (MEH-3460). כשיש בסעיף תשובה אחת בלבד בתוך הדף (משלוח או תשלום), היא פתוחה מההתחלה. שתיים או יותר סגורות עד לחיצה (MEH-3666). הכיתוב בשורות לא תלוי בעיר ששמרה המבקרת: «[עיר]» בשאלה של בעלת העסק נקראת כעיר של העסק, ועיר המבקרת נכנסת רק להודעת הוואטסאפ. שאלה שהיא בעצם שאלת המשלוח («אפשר משלוח ל[עיר]?») יורדת תמיד, עם עיר שמורה או בלי (`ownerQuestionPairs` ב-`frontend/lib/resolved-questions.js`, MEH-3857). כל קובץ שקורא את העיר השמורה רשום ב-`frontend/__tests__/SavedCityConsumersGuard.test.js`.
* `frontend/app/[locale]/producer/[id]/components/ProducerSections.jsx` — המוצר המוביל, שאלות ותשובות, עסקים דומים. הכותרת הקטנה «המוצר המוביל» מופיעה רק כשיש לידו עוד מוצר אחד לפחות. בעסק עם מוצר אחד הכרטיס נשאר, בלי הכותרת (MEH-3666).
* `frontend/components/ProductsSection.jsx` · `frontend/components/public/ProductSheet.jsx` — המוצרים והגיליון. בגיליון כפתור שיתוף שמוביל ישר למוצר (`?product=<id>`, MEH-3622).
* `frontend/components/public/ProductFacts.jsx` — מה בית העסק הצהיר על המוצר. רכיבים ואחסון בשורה סגורה «פרטים על המוצר»; שורת האלרגנים גלויה תמיד מתחת לכותרת שלה. מוצר שבית העסק לא אמר עליו כלום על אלרגנים לא מציג שורת אלרגנים; המשפט «יש לכם רגישות למזון? שאלו את בית העסק לפני ההזמנה.» מופיע פעם אחת מעל רשימת המוצרים, רק כשיש מוצר כזה (MEH-3585). כשאין רכיבים ואין אחסון, אין שורה (MEH-3450). ברשימת הרכיבים מודגשות המילים של אלרגנים שסומנו ב«מכיל» (MEH-3443).
* `frontend/components/ProductPrice.jsx` · `frontend/lib/product-price.js` — המחיר עם היחידה («80₪ לבקבוק», MEH-2936). המחיר ב-span של `dir="ltr"`, היחידה אחריו ומחוץ לו. התוויות ב-namespace ‏`price_unit`, שנשלח לכל דף.
* `frontend/components/PickupSchedule.jsx` — מתחת לנקודת איסוף: ימי האיסוף, שעת סגירת ההזמנה של הנקודה, ו«האיסוף הבא» (MEH-3512, החישוב ב-`frontend/lib/next-delivery.js`).
* `frontend/components/DeliveryTerms.jsx` · `frontend/components/NationwideZones.jsx` · `frontend/lib/delivery-time.js` — זמן המשלוח בימי עסקים, המינימום ושעת סגירת ההזמנות לעיר, לאזור ולעסק, והאזורים בתנאים אחרים של עסק ארצי (MEH-3511). הטסט `frontend/__tests__/DeliveryTermsMeh3511.test.jsx`.
* `frontend/components/AreaTermsRow.jsx` — שורה ברשימת המשלוחים: הערים שכל התנאים שלהן זהים בשורה אחת (אזור מוצג בשמו ואחריו הערים), והתנאים פעם אחת בשורה אחת עם «·» (MEH-3511, ספיר 20/11).
* `frontend/app/[locale]/producer/[id]/hooks/useProducerActivities.js` — האירועים, החוויות, קבוצות הרכישה והמתכונים של הדף, יחד (MEH-3819; המתכונים נוספו ב-MEH-3836). בכתובת `/{slug}` השרת קורא אותם עם בית העסק (`frontend/app/[locale]/[slug]/page.js`) והדף מגיע איתם, ולכן הם לא נדחפים מעל הביקורות והמשלוחים אחרי שהדף כבר הופיע. אם אחת הקריאות נכשלת, הדפדפן קורא אותן בעצמו. הדף ב-`/{slug}` שמור במטמון ויכול להיות ישן, ולכן אחרי הטעינה הדפדפן קורא את הרשימות פעם אחת נוספת. הרשימות מתחלפות רק אם משהו השתנה, וקריאה שנכשלת משאירה את מה שהגיע מהשרת. מספר הימים שנשארו בקבוצת רכישה מחושב מחדש בדפדפן אחרי הטעינה, כדי שעמוד ישן לא ישבור את הטעינה (`frontend/__tests__/ProducerActivitiesDaysLeftHydration.test.jsx`). ב-`/producer/<id>` הדף מחכה לכולן לפני שהוא מופיע. אזור הביקורות (`frontend/components/ReviewsSection.jsx`) מוצג עם הדף, עם שורות טעינה כמספר הביקורות שיופיעו (עד 3), בגובה של שורת ביקורת אמיתית (`SkeletonReviewRows` ב-`frontend/components/Skeleton.jsx`), עם מקום שמור לכפתור «הצג עוד» כשיש יותר מ-3 ביקורות, וכרטיס «כתיבת ביקורת» של אורח שמור במקומו, בלתי נראה, עד שמתברר מי הקוראת (MEH-3871: בלי זה אזור המשלוחים קפץ למטה מול קוראת שכבר גללה אליו. בעלת העסק בדף שלה רואה את המקום הזה נסגר פעם אחת). ובעסק שיש לו ביקורות הוא קורא את העמוד הראשון של `/reviews` עם הדף, בקריאה אחת משותפת עם הציטוט שמתחת לכותרת (`frontend/lib/reviews-page.js`, MEH-3836). בעסק בלי ביקורות הוא קורא רק כשהוא נכנס למסך. הטסטים `frontend/__tests__/UseProducerActivities.test.jsx` · `frontend/__tests__/SlugPageBotHardening.test.jsx` · `frontend/__tests__/ProducerDetailStickyBarAfterWait.test.jsx` (הפס הדביק בנייד עוקב אחרי כרטיס הקשר גם כשהדף הופיע אחרי ההמתנה).
* `frontend/lib/hours.js` — פענוח שעות ומצב «פתוח עכשיו».
* `frontend/app/[locale]/[slug]/loading.js` — מה שמופיע מהרגע שלוחצים על כרטיס ועד שהדף מגיע מהשרת: שלד בצורת הדף (תמונה, שם, שתי שורות, ובמחשב פירורי הלחם והכרטיס בצד), באותם מקומות כמו הדף האמיתי (`SkeletonProducerPage` ב-`frontend/components/Skeleton.jsx`). בנייד השלד שומר גם את השורה שמעל התמונה («→ חזרה», או «חזרה למפה» כשבאים מהמפה), כדי שהתמונה לא תקפוץ. לפני כן הופיע כאן ה-loader הכללי, שנראה כמו מסך ריק בחצי השנייה הראשונה (MEH-3983). דפי המתכונים מתחת לעסק שומרים את ה-loader הכללי (`frontend/app/[locale]/[slug]/recipes/loading.js`). הטסטים `frontend/__tests__/DetailPageLoading.test.jsx` · `frontend/e2e/flows/manual/nav-throttled.spec.ts` (אף פריים עם ה-loader הכללי במעבר מהבית לעסק, בטלפון איטי).
* `frontend/lib/contact-method.js` — הבעלים היחיד של «מה הכפתור הראשי ולאן הוא מוביל».
* `backend/app/routers/producers.py` — הפרט; `backend/app/services/producer_listing.py` — הרשימה.
* `backend/app/services/producer_detail.py` — הטעינה של דף העסק (לפי slug או id, כולל 410 לעסק שנמחק) והתשובה שלו; `backend/app/services/producer_catalog.py` — הספירה והעסק האקראי בקטלוג, ובדיקות הפרמטרים של הרשימה; `backend/app/services/kashrut_cert_proxy.py` — אילו תעודות כשרות מוצגות, והפרוקסי שמזרים אותן. ה-routes נשארים ב-`backend/app/routers/producers.py` (MEH-3559).
* `backend/app/services/delivery_waitlist_requests.py` — רשימת ההמתנה למשלוח בדף העסק: הצטרפות (כולל «אשמח לארח» ומייל האישור), אישור האירוח מהקישור, והסרה. הכללים עצמם ב-`backend/app/services/delivery_waitlist.py`, וה-routes נשארים ב-`backend/app/routers/producers.py` (MEH-3537).

**Flags.** אין. שקית הצלה בתוך הדף תלויה ב-`NEXT_PUBLIC_RESCUE_BAGS_ENABLED` — ראו [שקיות הצלה](./rescue-bags.md).

**טסטים**
* `frontend/e2e/flows/03-view-producer-detail.spec.ts` · `frontend/e2e/flows/manual/producer-detail.spec.ts`
* `frontend/e2e/flows/04-whatsapp-click.spec.ts` — לחיצת WhatsApp, זרימה קריטית (כלל 5).
* `frontend/e2e/visual/parity.spec.ts` — צילומי VRT של דף העסק. `producer-detail-disclosure-open` מצלם את הסעיף `#section-faq` עצמו, שאלה פתוחה, ולא את המסך כולו: מיקום הגלילה למסך משתנה מריצה לריצה (MEH-3460). ב-fixture יש תשובה אחת, ולכן היא פתוחה בלי לחיצה (MEH-3666).
* `frontend/e2e/flows/47-products-show-all.spec.ts` — רשימת מוצרים ארוכה וקיפול. רץ על בית העסק של ה-seed (`ruach-hasadeh`), לא על הראשון בפיד (MEH-3435).
* `tests/test_meh3385_producer_detail_product_order.py` — סדר המוצרים בדף העסק (לפי `position`, בלי מקום בסוף), טיוטות לא מופיעות, ואין מכפלה בין אוספים (MEH-3385).
* `tests/test_meh2602_producer_page_lists.py` · `tests/test_producer_contract_snapshot.py`
* `frontend/__tests__/ProductSheetShare.test.jsx` — קישור השיתוף של מוצר אחד (MEH-3622).
* `tests/test_meh3439_product_may_contain.py` · `frontend/__tests__/ProductSheetAllergens.test.jsx` — רכיבים, «מכיל», «עלול להכיל» ושורת «לא ציין» בגיליון המוצר (MEH-2662, MEH-3439).
* `tests/test_meh3444_product_storage.py` · `frontend/__tests__/ProductSheetAllergens.test.jsx` · `frontend/__tests__/ProductsSectionAllergens.test.jsx` — «אחסון ותוקף» בגיליון המוצר ובטופס בית העסק, כולל בדיקת ה-AI בעריכה של עסק מאושר (MEH-3444).
* `tests/test_meh3442_allergen_detail.py` — «גלוטן (כוסמין)», «אגוזים (שקדים)»: פירוט הדגן והאגוז, נשמר רק כשהאלרגן מסומן (MEH-3442).
* `tests/test_meh3445_allergen_reminder.py` — «אין במוצר אלרגנים מהרשימה»: הצהרה מפורשת, מתבטלת כשמסומן אלרגן, ולא נספרת בתזכורת בלוח (MEH-3445).
* `frontend/__tests__/AllergenHighlight.test.jsx` — מילים ברשימת הרכיבים שתואמות אלרגן שסומן ב«מכיל» מודגשות (`highlightAllergens` ב-`frontend/lib/allergens.js`); מילון קטן ושמרני, «עלול להכיל» לא מודגש (MEH-3443).
* `frontend/__tests__/ProducerSectionsMeh3585.test.jsx` — סל ההפתעה אחרי «קבוצות רכישה פתוחות» (קטלוג קודם, הצעות מתוארכות אחריו), באותו מבנה כרטיס כמו קבוצת רכישה, ושורת האלרגנים האחת מעל רשימת המוצרים (0 / 1 / רבים) (MEH-3585).
* `frontend/__tests__/OfferCardOneOwnerGuard.test.jsx` — כרטיס קבוצת רכישה וכרטיס סל הפתעה יוצאים מאותו רכיב, `frontend/components/ui/OfferCard.jsx`, באותו רוחב (MEH-3585).
* `frontend/__tests__/ProductSheetDetailsRow.test.jsx` — השורה «פרטים על המוצר»: סגורה כברירת מחדל, האלרגנים בכותרת שלה, ובלי שורה כשאין מה לקפל (MEH-3450).
* `tests/test_meh2936_product_unit.py` · `frontend/__tests__/ProductPriceUnit.test.jsx` — **השומר** של יחידת המחיר: רשימה אחת בשרת, בסכמות ובצד הלקוח, התווית מגיעה לדף ציבורי, ובקבוק/ארגז לא הופכים מחיר להערכה (MEH-2936).
* `frontend/__tests__/QuestionChipsSection.test.jsx` · `frontend/__tests__/quickAnswers.test.js` — «שאלות נפוצות» כסעיף בגוף הדף, בלי שאלת משלוח כשיש סעיף משלוח, ובלי «איך מזמינים?» (MEH-3460). תשובה אחת פתוחה, שתיים סגורות (MEH-3666).
* `frontend/__tests__/ProducerSectionsProducts.test.jsx` — הכותרת «המוצר המוביל» רק כשיש לידו מוצר נוסף (MEH-3666).
* `frontend/__tests__/SlugPageTestBusinessNoindex.test.jsx` · `tests/test_meh2952_is_test_exclusion.py` — עסק בדיקה (`is_test`) נפתח בכתובת הישירה עם `noindex` ובלי JSON-LD, ועסק רגיל נשאר בר-אינדוקס (MEH-2952 חלק 3).
* `frontend/__tests__/ProducerIdRedirect.test.js` — ‏`/producer/<id>` של עסק עם slug: ‏308 ל-`/{slug}` ול-`/en/{slug}`, ה-query נשמר, slug בעברית מקודד, בלי slug הדף נשאר, עסק חסר נשאר 404 (MEH-3708).
* `frontend/__tests__/MiddlewareProducerId404.test.js` — ‏`/producer/<id>` של עסק שלא קיים מחזיר 404 אמיתי מה-middleware (MEH-3024).

**מזהי רישום שזה מכסה.** `gallery_story`, `product_details`, `top_product`, `hours`, `vacation_mode`, `primary_cta`, `wa_prefill`, `product_wa`, `faq_answers`, `wa_group`, `nav_buttons`, `similar_businesses`.
