export const metadata = {
  title: "תנאי שימוש | מהמקור",
  description: "תנאי שימוש באתר מהמקור — פלטפורמה לחיבור בין בתי עסק מקומיים לקונים",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="bg-white rounded-[12px] p-8">
        <h1 className="text-3xl font-bold mb-2">תנאי שימוש — מהמקור</h1>
        <p className="text-text-secondary mb-8">עדכון אחרון: מרץ 2026</p>

        <div className="space-y-8 text-text-primary leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. מהות השירות</h2>
            <p>
              מהמקור היא פלטפורמה לחיבור בין בתי עסק מקומיים ומוכרים לבין קונים. האתר אינו
              מוכר מוצרים בעצמו ואינו צד לעסקאות בין משתמשים.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. אחריות על מוצרים</h2>
            <p>
              כל מוצר המפורסם באתר — בין אם על ידי עסק מאומת ובין אם בסקציית
              &quot;מהמטבח של השכן&quot; — הוא באחריות המוכר בלבד. מהמקור אינה אחראית לאיכות
              המוצרים, לבטיחותם, לטריותם, או לכל נזק שייגרם משימוש בהם.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. מהמטבח של השכן</h2>
            <p>
              מוצרים בסקציה זו מיוצרים ונמכרים על ידי אנשים פרטיים. המוכר מצהיר כי
              המוצר הוכן בתנאים היגייניים תקינים ועומד בדרישות החוק. הקונה רוכש על
              אחריותו בלבד. מהמקור אינה מאמתת מוצרים בסקציה זו.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. עסקים מאומתים</h2>
            <p>
              תגית ״מאומת ע״י מהמקור״ מציינת שהעסק עבר בדיקה ראשונית לפי קריטריוני
              האתר. האימות אינו מהווה ערובה לאיכות המוצר בכל רכישה ספציפית.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. דיווח על בעיות</h2>
            <p>
              נתקלת במוצר או עסק שאינו עומד בקריטריונים? השתמשי בכפתור
              &quot;דווח&quot; בעמוד העסק. נבדוק ונטפל תוך 48 שעות.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. פרטיות</h2>
            <p>
              מהמקור אוספת פרטי יצירת קשר לצרכי הפלטפורמה בלבד. אין מכירת מידע
              לצדדים שלישיים.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
