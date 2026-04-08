import Link from "next/link";

export const metadata = {
  title: "החזון שלנו | מהמקור",
  description: "מהמקור נוצרה מתוך צורך אמיתי — למצוא אוכל אמיתי, ישר מהמקור. גלו את הסיפור, הערכים וקריטריוני הכניסה שלנו.",
};

const values = [
  { emoji: "🌿", title: "ללא מעובד", desc: "מוצרים טבעיים ללא תוספים מיותרים, עיבוד מינימלי ושימור הטעם האמיתי" },
  { emoji: "🥩", title: "חומרי גלם מזוהים", desc: "שקיפות מלאה — תמיד תדעו מאיפה מגיע האוכל ומה יש בפנים" },
  { emoji: "🏡", title: "ייצור קטן", desc: "בתי עסק קטנים ומשפחתיים שמכינים בכמויות קטנות עם אהבה" },
  { emoji: "🌱", title: "טרי ואמיתי", desc: "אוכל שהוכן לאחרונה, ללא חודשי מדף, ישר מהמקור אליכם" },
];

const criteria = [
  "ייצור עצמי או משפחתי — לא סוחרים ולא מפיצים",
  "חומרי גלם איכותיים ומזוהים",
  "ללא חומרים משמרים מלאכותיים",
  "שקיפות מלאה על תהליך הייצור",
  "עמידה בתקני בטיחות מזון בסיסיים",
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-primary text-white py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            אוכל אמיתי, ישר מהמקור אליך
          </h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            הפלטפורמה שמחברת בין בתי עסק מקומיים לאנשים שמחפשים אוכל אמיתי
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-6 text-center">הסיפור שלנו</h2>
        <div className="bg-white rounded-[12px] p-8 shadow-sm leading-relaxed text-lg text-text-secondary">
          <p>
            מהמקור נוצרה מתוך צורך אמיתי — למצוא grass-fed ליד הבית, גבינות אמיתיות,
            לחם מחמצת שמישהו הכין בבית. הכל היה מפוזר בקבוצות ווטסאפ, קשה למצוא, קשה להגיע.
          </p>
          <p className="mt-4">
            מהמקור שמה הכל במפה אחת — פלטפורמה אחת שמרכזת את כל בתי העסק המקומיים,
            היצרנים הקטנים והשכנים שמבשלים בבית. פשוט, נגיש ואמיתי.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold mb-8 text-center">הערכים שלנו</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {values.map((v) => (
            <div key={v.title} className="bg-white rounded-[12px] p-6 shadow-sm hover:shadow-md transition">
              <div className="text-4xl mb-3">{v.emoji}</div>
              <h3 className="text-xl font-bold mb-2">{v.title}</h3>
              <p className="text-text-secondary leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Criteria */}
      <section className="bg-white py-16">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-8 text-center">קריטריוני כניסה</h2>
          <p className="text-text-secondary text-center mb-8">
            לא כל עסק נכנס למהמקור. אלו הקריטריונים שאנחנו בודקים:
          </p>
          <ul className="space-y-4">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-3 bg-background rounded-[12px] p-4">
                <span className="text-secondary font-bold text-lg mt-0.5">✓</span>
                <span className="text-lg">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">מוכנים להתחיל?</h2>
          <p className="text-text-secondary mb-8 text-lg">
            הצטרפו לקהילה של בתי עסק מקומיים ואנשים שאוהבים אוכל אמיתי
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register/producer"
              className="bg-primary text-white px-8 py-3 rounded-[12px] hover:bg-primary-light transition font-semibold text-lg"
            >
              הוסף את העסק שלך
            </Link>
            <Link
              href="/map"
              className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-[12px] hover:bg-accent transition font-semibold text-lg"
            >
              מצא בתי עסק
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
