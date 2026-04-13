export const metadata = {
  title: "הצהרת נגישות | מהמקור",
  description:
    "הצהרת נגישות של אתר מהמקור — אנו מחויבות לאפשר שימוש באתר לכל המשתמשות והמשתמשים, לרבות אנשים עם מוגבלות.",
};

const SECTIONS = [
  {
    id: "commitment",
    title: "מחויבות לנגישות",
    body: (
      <>
        אתר &quot;מהמקור&quot; מחויב לאפשר גלישה נוחה ושוויונית לכלל המשתמשות
        והמשתמשים, לרבות אנשים עם מוגבלות, בהתאם ל
        <strong>חוק שוויון זכויות לאנשים עם מוגבלות, התשנ״ח–1998</strong>{" "}
        ותקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות),
        התשע״ג–2013.
      </>
    ),
  },
  {
    id: "standard",
    title: "רמת תקן",
    body: (
      <>
        אנו פועלות להתאים את האתר לתקן הישראלי <strong>ת״י 5568</strong> ברמת
        AA, המבוסס על הנחיות{" "}
        <a
          href="https://www.w3.org/WAI/WCAG21/quickref/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
          dir="ltr"
        >
          WCAG 2.1
        </a>
        .
      </>
    ),
  },
  {
    id: "features",
    title: "התאמות שבוצעו באתר",
    body: (
      <ul className="list-disc pr-6 space-y-2">
        <li>תמיכה מלאה ב-RTL ובקריאת מסך בעברית.</li>
        <li>ניגודיות צבעים סבירה בין טקסט לרקע.</li>
        <li>טקסטים חלופיים (alt) לתמונות משמעותיות.</li>
        <li>ניווט מקלדת בכל הדפים.</li>
        <li>תוויות ברורות לטפסים וכפתורים.</li>
        <li>גדלי גופנים הניתנים להגדלה בדפדפן.</li>
        <li>מבנה סמנטי (landmarks, headings) לתמיכה בטכנולוגיות מסייעות.</li>
      </ul>
    ),
  },
  {
    id: "gaps",
    title: "חלקים שאינם נגישים במלואם",
    body: (
      <>
        ייתכנו דפים, תכנים או פונקציות שטרם הונגשו במלואם, לרבות תכנים שהועלו על
        ידי משתמשות (לדוגמה תמונות ללא תיאור חלופי). אנו פועלות באופן שוטף
        לשפר ולהרחיב את ההנגשה.
      </>
    ),
  },
  {
    id: "contact",
    title: "פנייה לרכזת נגישות",
    body: (
      <>
        נתקלת בבעיית נגישות? נשמח לסייע ולתקן. ניתן לפנות לרכזת הנגישות של
        האתר:
        <br />
        <strong>רכזת נגישות:</strong> צוות מהמקור
        <br />
        📧{" "}
        <a
          href="mailto:levismadar80@gmail.com"
          className="text-primary hover:underline"
          dir="ltr"
        >
          levismadar80@gmail.com
        </a>
        <br />
        📞 להשלים
        <br />
        <span className="text-sm text-site-muted">
          בפנייה נא לתאר את הבעיה, את הדף שבו נתקלת בה ואת סוג הטכנולוגיה
          המסייעת שבה את/ה משתמש/ת. נחזור אלייך תוך 3 ימי עסקים.
        </span>
      </>
    ),
  },
  {
    id: "authority",
    title: "רשות ממשלתית לנגישות",
    body: (
      <>
        לפרטים נוספים על זכויות נגישות ברשת, ניתן לפנות ל
        <a
          href="https://www.gov.il/he/departments/accessibility"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          אתר הנגישות הממשלתי
        </a>
        .
      </>
    ),
  },
];

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="font-headline text-5xl font-bold text-site-text mb-2">הצהרת נגישות</h1>
        <p className="text-site-muted mb-12">תאריך בדיקה אחרונה: אפריל 2026</p>

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
