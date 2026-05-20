export const metadata = {
  title: "תנאי שימוש | מהמקור",
  description:
    "תנאי שימוש באתר מהמקור — פלטפורמת דירקטורי המחברת בין בתי עסק שמייצרים אוכל בריא לבין קונות וקונים בישראל.",
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
    id: "service",
    title: "1. מהות השירות",
    body: (
      <>
        &quot;מהמקור&quot; (להלן: &quot;הפלטפורמה&quot; או &quot;האתר&quot;) היא
        פלטפורמת <strong>דירקטורי בלבד</strong> המחברת בין בתי עסק לבין קונות
        וקונים בישראל. הפלטפורמה <strong>אינה מוכרת</strong>{" "}
        מוצרים, אינה צד לעסקה, אינה אחראית על הספקה או גבייה, ואינה מתווכת
        בעסקאות. כל עסקה נעשית ישירות בין המוכרת לקונה, על אחריותן הבלעדית.
      </>
    ),
  },
  {
    id: "licensing",
    title: "2. אחריות המוכרות על רישוי",
    body: (
      <>
        <p className="mb-3">
          כל מוכרת המופיעה בפלטפורמה נושאת ב<strong>אחריות בלעדית</strong>{" "}
          להחזקת כל הרישיונות, האישורים וההיתרים הנדרשים לפי דין, לרבות (אך לא
          רק): חוק רישוי עסקים, התשכ״ח–1968, תקנות בריאות הציבור (מזון), הוראות
          משרד הבריאות, והוראות כשרות וסימון רלוונטיות.
        </p>
        <p>
          בעת ההרשמה כעסק, המוכרת מצהירה כי היא מחזיקה בכל הרישיונות הנדרשים
          למכירת המוצרים, וכי תמשיך להחזיקם בתוקף לאורך כל תקופת השימוש בפלטפורמה.
          מהמקור <strong>אינה בודקת, מאמתת או מאשרת</strong> רישיונות אלה,
          והאחריות לציות חלה על המוכרת בלבד.
        </p>
      </>
    ),
  },
  {
    id: "age",
    title: "3. גיל מינימלי",
    body: (
      <>
        השימוש באתר מותר למשתמשות ומשתמשים בגיל <strong>18 ומעלה</strong> בלבד.
        בעצם ההרשמה או השימוש בפלטפורמה את/ה מאשר/ת כי את/ה בן/בת 18 ומעלה וכי
        יש לך את הכשרות המשפטית להתחייב לתנאים אלה.
      </>
    ),
  },
  {
    id: "responsibility",
    title: "4. אחריות על מוצרים ועל עסקאות",
    body: (
      <>
        כל מוצר המפורסם באתר הוא באחריות המוכרת בלבד. מהמקור אינה אחראית לאיכות
        המוצרים, לבטיחותם, לטריותם, לכשרותם, להתאמתם לתיאור, לזמני אספקה, או לכל
        נזק — ישיר או עקיף — שייגרם משימוש בהם או מהסתמכות עליהם. הקונה רוכשת
        על אחריותה הבלעדית וישירות מהמוכרת.
      </>
    ),
  },
  {
    id: "verified",
    title: "5. עסקים מאומתים",
    body: (
      <>
        תגית &quot;מאומת ע״י מהמקור&quot; מציינת שהעסק עבר בדיקה ראשונית של
        קריטריוני הפלטפורמה (זהות המוכרת, קיום פעילות, התאמה לקטגוריות). האימות{" "}
        <strong>אינו מהווה ערובה</strong> לאיכות המוצר, לקיום רישיונות או לכל
        רכישה ספציפית.
      </>
    ),
  },
  {
    id: "report",
    title: "6. דיווח על הפרות",
    body: (
      <>
        <p className="mb-3">
          נתקלת במוצר או עסק שאינו עומד בחוק או בתנאים אלה? ניתן לדווח באחת
          מהדרכים הבאות:
        </p>
        <ul className="list-disc ps-6 space-y-2">
          <li>לחיצה על כפתור &quot;דווחי&quot; בעמוד העסק או המוצר.</li>
          <li>
            פנייה ישירה לכתובת{" "}
            <a
              href="mailto:levismadar80@gmail.com"
              className="text-primary hover:underline"
              dir="ltr"
            >
              levismadar80@gmail.com
            </a>
            .
          </li>
          <li>
            שימוש ב
            <a href="/contact" className="text-primary hover:underline">
              טופס יצירת קשר
            </a>
            .
          </li>
        </ul>
        <p className="mt-3">
          נבדוק כל דיווח תוך <strong>3 ימי עסקים</strong>. הפלטפורמה שומרת
          לעצמה את הזכות להסיר תכנים, להשעות חשבונות ולפנות לרשויות במקרה של
          הפרה.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "7. קניין רוחני",
    body: (
      <>
        כל התכנים בפלטפורמה, לרבות שם המותג, הלוגו והעיצוב, הם קניינה של מהמקור.
        תכנים שהועלו על ידי משתמשות נותרים בבעלותן, אך המשתמשת מעניקה למהמקור
        רישיון לא בלעדי להצגתם ולהפצתם לצורך הפעלת השירות.
      </>
    ),
  },
  {
    id: "changes",
    title: "8. שינויים בתנאים",
    body: (
      <>
        מהמקור רשאית לעדכן תנאים אלה מעת לעת. הגרסה המעודכנת תפורסם בעמוד זה
        עם תאריך העדכון. שימוש מתמשך בשירות לאחר עדכון מהווה הסכמה לתנאים
        המעודכנים.
      </>
    ),
  },
  {
    id: "law",
    title: "9. דין חל וסמכות שיפוט",
    body: (
      <>
        על תנאים אלה, על השימוש בפלטפורמה ועל כל מחלוקת הנובעת מהם יחולו דיני{" "}
        <strong>מדינת ישראל</strong> בלבד. סמכות השיפוט הייחודית והבלעדית בכל
        עניין הנוגע לתנאים אלה נתונה לבתי המשפט המוסמכים במחוז תל אביב–יפו.
      </>
    ),
  },
  {
    id: "privacy",
    title: "10. פרטיות",
    body: (
      <>
        השימוש בפלטפורמה כפוף גם{" "}
        <a href="/privacy" className="text-primary hover:underline">
          למדיניות הפרטיות
        </a>
        , המהווה חלק בלתי נפרד מתנאים אלה.
      </>
    ),
  },
  {
    id: "contact",
    title: "11. יצירת קשר",
    body: (
      <>
        לכל שאלה או בירור בנוגע לתנאי השימוש:
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

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline text-5xl font-bold text-site-text mb-2">תנאי שימוש</h1>
        <p className="text-site-muted mb-12">עדכון אחרון: אפריל 2026</p>

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
