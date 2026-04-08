export const metadata = {
  title: "תנאי שימוש | מהמקור",
  description: "תנאי שימוש באתר מהמקור — פלטפורמה לחיבור בין בתי עסק מקומיים לקונים",
};

const SECTIONS = [
  {
    id: "service",
    title: "1. מהות השירות",
    body: (
      <>
        מהמקור היא פלטפורמה לחיבור בין בתי עסק מקומיים ומוכרים לבין קונים. האתר אינו
        מוכר מוצרים בעצמו ואינו צד לעסקאות בין משתמשים.
      </>
    ),
  },
  {
    id: "responsibility",
    title: "2. אחריות על מוצרים",
    body: (
      <>
        כל מוצר המפורסם באתר — בין אם על ידי עסק מאומת ובין אם בסקציית &quot;מהמטבח של
        השכן&quot; — הוא באחריות המוכר בלבד. מהמקור אינה אחראית לאיכות המוצרים, לבטיחותם,
        לטריותם, או לכל נזק שייגרם משימוש בהם.
      </>
    ),
  },
  {
    id: "home-kitchen",
    title: "3. מהמטבח של השכן",
    body: (
      <>
        מוצרים בסקציה זו מיוצרים ונמכרים על ידי אנשים פרטיים. המוכר מצהיר כי המוצר הוכן
        בתנאים היגייניים תקינים ועומד בדרישות החוק. הקונה רוכש על אחריותו בלבד. מהמקור
        אינה מאמתת מוצרים בסקציה זו.
      </>
    ),
  },
  {
    id: "verified",
    title: "4. עסקים מאומתים",
    body: (
      <>
        תגית &quot;מאומת ע&quot;י מהמקור&quot; מציינת שהעסק עבר בדיקה ראשונית לפי קריטריוני
        האתר. האימות אינו מהווה ערובה לאיכות המוצר בכל רכישה ספציפית.
      </>
    ),
  },
  {
    id: "report",
    title: "5. דיווח על בעיות",
    body: (
      <>
        נתקלת במוצר או עסק שאינו עומד בקריטריונים? השתמשי בכפתור &quot;דווח&quot; בעמוד
        העסק. נבדוק ונטפל תוך 48 שעות.
      </>
    ),
  },
  {
    id: "privacy",
    title: "6. פרטיות",
    body: (
      <>
        מהמקור אוספת פרטי יצירת קשר לצרכי הפלטפורמה בלבד. אין מכירת מידע לצדדים שלישיים.
        למידע נוסף על שימוש ב-cookies ראי את הבאנר בתחתית הדף.
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
              <p className="text-site-text/85 leading-relaxed">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
