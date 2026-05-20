export const metadata = {
  title: "מדיניות פרטיות | מהמקור",
  description:
    "מדיניות פרטיות של מהמקור — אילו נתונים אנו אוספות, כיצד אנו משתמשות בהם, ומהן זכויותייך לפי חוק הגנת הפרטיות (תיקון 13, 2025).",
};

// MEH-630: site operator legal disclosure (Israeli commercial-site compliance).
const SECTIONS = [
  {
    id: "operator",
    title: "פרטי מפעיל האתר",
    body: (
      <>
        <p className="mb-3">
          <strong>מפעילת האתר:</strong> שנף טופז, עוסקת פטורה מס׳ 325120939.
        </p>
        <p className="mb-3">
          <strong>השם המסחרי:</strong> מהמקור / Mehamakor.
        </p>
        <p>
          <strong>ליצירת קשר:</strong>{" "}
          <a
            href="mailto:noreply@mehamakor.co.il"
            className="text-primary hover:underline"
            dir="ltr"
          >
            noreply@mehamakor.co.il
          </a>
        </p>
      </>
    ),
  },
  {
    id: "who",
    title: "1. מי אנחנו",
    body: (
      <>
        &quot;מהמקור&quot; (להלן: &quot;האתר&quot; או &quot;הפלטפורמה&quot;) היא
        פלטפורמת דירקטורי המחברת בין בתי עסק שמייצרים אוכל בריא ומוצרי טיפוח
        טבעיים לבין קונות וקונים בישראל. מדיניות זו מסבירה אילו פרטים אישיים אנו
        אוספות, כיצד אנו משתמשות בהם, עם מי אנו חולקות אותם, ומהן זכויותייך.
      </>
    ),
  },
  {
    id: "data",
    title: "2. אילו נתונים אנו אוספות",
    body: (
      <ul className="list-disc ps-6 space-y-2">
        <li>
          <strong>פרטי זיהוי והתקשרות:</strong> שם מלא, כתובת אימייל, מספר טלפון,
          עיר מגורים.
        </li>
        <li>
          <strong>פרטי עסק (למוכרות):</strong> שם העסק, תיאור, כתובת, קטגוריות,
          אזורי משלוח, קישורים חברתיים.
        </li>
        <li>
          <strong>נתונים טכניים:</strong> כתובת IP, סוג דפדפן, מערכת הפעלה, מזהה
          מכשיר.
        </li>
        <li>
          <strong>נתוני מיקום:</strong> מיקום מקורב (רק אם אישרת זאת בדפדפן),
          לצורך הצגת בתי עסק קרובים במפה.
        </li>
        <li>
          <strong>עוגיות (Cookies) ונתוני התנהגות:</strong> דפים שביקרת בהם,
          חיפושים, לחיצות, מוצרים שנצפו ועסקים שנשמרו במועדפים.
        </li>
        <li>
          <strong>תוכן שנוצר על ידך:</strong> פרסומים בסקציית &quot;מהמטבח של
          השכן&quot;, דירוגים, תגובות ופניות דרך טפסי יצירת קשר.
        </li>
      </ul>
    ),
  },
  {
    id: "why",
    title: "3. למה אנחנו אוספות את הנתונים",
    body: (
      <ul className="list-disc ps-6 space-y-2">
        <li>
          <strong>הפעלת השירות:</strong> אימות משתמשות, ניהול חשבון, הצגת עסקים,
          עיבוד הרשמות וחיבור בין קונות למוכרות.
        </li>
        <li>
          <strong>ניתוח ושיפור:</strong> הבנת השימוש באתר, שיפור החוויה, תיקון
          תקלות ופיתוח פיצ&apos;רים חדשים.
        </li>
        <li>
          <strong>התראות ותקשורת:</strong> הודעות חיוניות לגבי החשבון, אישור
          הרשמות, התראות אדמין, וניוזלטר (רק אם נרשמת).
        </li>
        <li>
          <strong>ציות לחוק:</strong> עמידה בדרישות חוק הגנת הפרטיות, טיפול
          בדיווחים ומניעת שימוש לרעה.
        </li>
      </ul>
    ),
  },
  {
    id: "third-parties",
    title: "4. צדדים שלישיים",
    body: (
      <>
        <p className="mb-3">
          אנו משתמשות בספקי שירות חיצוניים לצורך הפעלת הפלטפורמה. כל אחד מהם
          כפוף למדיניות פרטיות משלו:
        </p>
        <ul className="list-disc ps-6 space-y-2">
          <li>
            <strong>Cloudinary</strong> — אחסון ועיבוד תמונות שהועלו על ידי
            משתמשות.
          </li>
          <li>
            <strong>Google</strong> — Google OAuth להתחברות, Google Fonts,
            ושירותי אנליטיקה.
          </li>
          <li>
            <strong>Anthropic</strong> — מודלי AI לתמיכה, מיתון תוכן ושיפור
            החוויה.
          </li>
          <li>
            <strong>Twilio</strong> — הודעות WhatsApp להתראות אדמין וללקוחות.
          </li>
          <li>
            <strong>Vercel &amp; Railway</strong> — אחסון ושרתים.
          </li>
        </ul>
        <p className="mt-3">
          אנו <strong>לא מוכרות</strong> את המידע שלך לצדדים שלישיים למטרות
          שיווק.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "5. זכויותייך (לפי תיקון 13, 2025)",
    body: (
      <>
        <p className="mb-3">
          חוק הגנת הפרטיות מעניק לך את הזכויות הבאות. ניתן לממש כל אחת מהן ללא
          עלות, על ידי פנייה לכתובת{" "}
          <a
            href="mailto:levismadar80@gmail.com"
            className="text-primary hover:underline"
            dir="ltr"
          >
            levismadar80@gmail.com
          </a>
          :
        </p>
        <ul className="list-disc ps-6 space-y-2">
          <li>
            <strong>זכות עיון:</strong> לבקש לעיין במידע האישי שאנו מחזיקות
            עליך.
          </li>
          <li>
            <strong>זכות לתיקון:</strong> לבקש לתקן מידע שאינו מדויק, שלם או
            מעודכן.
          </li>
          <li>
            <strong>זכות למחיקה:</strong> לבקש את מחיקת חשבונך והמידע האישי שלך.
            ניתן לעשות זאת גם דרך הגדרות החשבון.
          </li>
          <li>
            <strong>זכות להתנגדות:</strong> להתנגד לעיבוד מידע למטרות שיווק או
            אנליטיקה מסוימות.
          </li>
          <li>
            <strong>זכות לניידות:</strong> לקבל עותק של המידע שלך בפורמט דיגיטלי
            נגיש.
          </li>
        </ul>
        <p className="mt-3">
          נטפל בפנייתך תוך 30 ימים. ניתן גם להגיש תלונה לרשות להגנת הפרטיות
          במשרד המשפטים.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "6. עוגיות (Cookies)",
    body: (
      <>
        אנו משתמשות בעוגיות הכרחיות לצורך שמירת החיבור לחשבון ופעולת האתר התקינה,
        וכן בעוגיות אנליטיקה לניתוח השימוש. בכניסה הראשונה לאתר תוצג הודעה
        המאפשרת לבחור בין &quot;אני מסכימה&quot; לבין &quot;רק הכרחיים&quot;.
        ניתן לשנות את הבחירה בכל עת דרך הגדרות הדפדפן.
      </>
    ),
  },
  {
    id: "retention",
    title: "7. שמירת מידע ואבטחה",
    body: (
      <>
        אנו שומרות את הנתונים שלך כל עוד החשבון פעיל או כל עוד נדרש לצורך מתן
        השירות, ציות לחוק, יישוב מחלוקות ואכיפה של התנאים שלנו. אנו מיישמות
        אמצעי אבטחה סבירים לרבות הצפנה, אחסון מאובטח, בקרת גישה וגיבויים.
      </>
    ),
  },
  {
    id: "minors",
    title: "8. קטינים",
    body: (
      <>
        השירות מיועד למשתמשות ומשתמשים בני 18 ומעלה. איננו אוספות ביודעין מידע
        אישי של קטינים מתחת לגיל זה. אם נודע לנו כי נאסף מידע כאמור, נמחק אותו
        לאלתר.
      </>
    ),
  },
  {
    id: "changes",
    title: "9. שינויים במדיניות",
    body: (
      <>
        נעדכן מדיניות זו מעת לעת. גרסה מעודכנת תפורסם בעמוד זה עם תאריך העדכון.
        שימוש מתמשך בשירות מהווה הסכמה לגרסה העדכנית.
      </>
    ),
  },
  {
    id: "contact",
    title: "10. יצירת קשר",
    body: (
      <>
        לכל שאלה בנוגע לפרטיות, מימוש זכויות או דיווח על תקלה:
        <br />
        📧{" "}
        <a
          href="mailto:levismadar80@gmail.com"
          className="text-primary hover:underline"
          dir="ltr"
        >
          levismadar80@gmail.com
        </a>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline text-5xl font-bold text-site-text mb-2">מדיניות פרטיות</h1>
        <p className="text-site-muted mb-12">
          עדכון אחרון: אפריל 2026 · מותאם לחוק הגנת הפרטיות, התשמ״א–1981
          ולתיקון 13 (2025)
        </p>

        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="bg-white rounded-[16px] p-7 border border-border shadow-[0_2px_12px_rgba(46,104,83,0.04)]"
            >
              <h2 className="font-headline text-2xl font-bold text-site-text mb-3">
                {section.title}
              </h2>
              <div className="text-site-text/85 leading-relaxed">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
