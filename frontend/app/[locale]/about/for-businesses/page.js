import { BRAND_NAME } from "@/lib/constants";
import { SITE_URL } from "@/lib/seo";

export const metadata = {
  title: "FAQ לבתי עסק — מהמקור",
  description:
    "10 שאלות נפוצות מבתי עסק מקומיים על מהמקור: עלות, ערך, זמן השקעה, אמון בפלטפורמה ושליטה בלקוחות. תשובות ישירות ושקופות.",
  openGraph: {
    title: "FAQ לבתי עסק — מהמקור",
    description: "10 התנגדויות נפוצות + תשובות ישירות לבעלות עסק שמתלבטות להצטרף.",
    type: "article",
    siteName: BRAND_NAME,
    locale: "he_IL",
    images: ["/og-image.jpg"],
  },
  alternates: { canonical: "/about/for-businesses" },
};

const CATEGORIES = [
  {
    heading: "כסף וערך",
    items: [
      {
        q: "כמה זה עולה להירשם?",
        a: "חינם. אנחנו לא לוקחות עמלה ולא דמי מנוי. מהמקור הוא מגזין, לא marketplace — הלקוחות פונות אלייך ישירות בWhatsApp או בטלפון, לא דרכנו.",
        open: true,
      },
      {
        q: "מה אני מקבלת מזה?",
        a: "שלושה דברים: (1) חשיפה בגוגל — אנחנו עושות SEO על כל פרופיל, (2) דף בית לעסק שלך עם הסיפור והתמונות שלך, (3) Trust badge “מאומת על ידי מהמקור” שאת יכולה להציג בInstagram ובמקומות אחרים.",
      },
    ],
  },
  {
    heading: "זמן ומאמץ",
    items: [
      {
        q: "כמה זמן לוקח להירשם ולתחזק את הפרופיל?",
        a: "הרישום לוקח 5-10 דקות. תחזוקה שוטפת? כמעט אפסית. אין הזמנות לנהל, אין מלאי לעדכן, אין שיחות צ׳אט פנימיות לענות עליהן. רק הסיפור שלך, תמונות, ואמצעי קשר. עדכון לפני חופשה = לחיצה אחת.",
      },
      {
        q: "אני לא יודעת לכתוב או לצלם טוב. הפרופיל שלי יראה דל?",
        a: "את כותבת draft, אני עוזרת לעטוף. תמונות מהטלפון מספיקות לחלוטין. אם אין לך סיפור מוכן — נשב 15 דקות בטלפון ונבנה אותו ביחד. זה לא קמפיין שיווקי, זו הצגה אמיתית שלך.",
      },
    ],
  },
  {
    heading: "אמון בפלטפורמה",
    items: [
      {
        q: "מי אתם בכלל? לא שמעתי על מהמקור.",
        a: "אני ספיר, סולו founder. בנייתי את מהמקור כי לא הצלחתי למצוא את האוכל האמיתי שאני רוצה לקנות. עכשיו אנחנו בpre-launch, מגייסות את בתי העסק הראשונים. כל מה שאני מבטיחה — מתועד, ואני אוהבת לדבר על איך זה עובד מאחורי הקלעים.",
      },
      {
        q: "מה אם אתם נסגרים בעוד שנה? אני אאבד את הלקוחות?",
        a: "לא. הלקוחות פונות אלייך ישירות בWhatsApp — את מקבלת את המספר שלהן, את מנהלת את הקשר. אם מהמקור נסגרת מחר, הלקוחות שלך נשארות שלך. זה ההבדל הגדול בינינו לבין Wolt או יאנגו שמחזיקות את הלקוחות שלהן בני ערובה.",
      },
      {
        q: "מי בודק שעסקים אחרים אצלכם אמינים?",
        a: "אני אישית. כל בית עסק עובר אישור ידני לפני שעולה לאתר. אני בודקת תעודות, רישיונות (לאופות, בשר, מוצרים מותססים), והאסתטיקה הכללית. אנחנו לא Facebook Marketplace. את לא תופיעי ליד מישהי שלא משדרת את אותם ערכים.",
      },
    ],
  },
  {
    heading: "שליטה ותחרות",
    items: [
      {
        q: "אני כבר בInstagram וב-WhatsApp groups. למה אני צריכה עוד מקום?",
        a: "Instagram = stream שנעלם. WhatsApp groups = רק מי שכבר מכיר אותך. מהמקור = בית קבוע שלך באינטרנט. כשמישהי מחפשת בגוגל “גבינות עזים תל אביב” — היא יכולה למצוא אותך אצלנו. Instagram לא עולה בחיפושים האלה.",
      },
      {
        q: "אני לא רוצה שמתחרות שלי יהיו על אותו אתר.",
        a: "שתי תשובות: (1) זה לא marketplace תחרותי — אין מחירים מוצגים, אין השוואה צד-לצד. הלקוחה רואה סיפור, לא מחירון. (2) ה”מתחרות” שלך הן בעצם community — לקוחה שגילתה אותך אצלנו תגלה גם את מי שמשלימה אותך (אופה לחם + מי שעושה גבינה = שתיכן שוות יותר ביחד).",
      },
      {
        q: "אני רוצה להחליט מי הלקוחות שלי ומתי אני זמינה.",
        a: "שליטה מלאה. את מסמנת את הזמינות שלך (“פתוח להזמנות”, “עמוס כרגע”, “בהפסקה”). את עונה בWhatsApp רק כשבא לך. אין אלגוריתם שמדרג אותך לפי זמן תגובה. את לא חייבת לקבל כל לקוחה — את יכולה להגיד “לא מתאים לי” בלי הסבר.",
      },
    ],
  },
];

const ALL_ITEMS = CATEGORIES.flatMap((c) => c.items);

function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}/about/for-businesses#faq`,
    mainEntity: ALL_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export default function FaqForBusinessesPage() {
  const jsonLd = buildFaqJsonLd();
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: "#F5F0E8", color: "#1C1A17" }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-10 sm:mb-14">
          <p
            className="text-xs sm:text-sm mb-3"
            style={{
              color: "#8B6914",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            לבעלות עסק
          </p>
          <h1
            className="font-headline mb-4"
            style={{
              color: "#2E4A2E",
              fontSize: "clamp(28px, 6vw, 44px)",
              lineHeight: 1.15,
              fontWeight: 900,
            }}
          >
            10 שאלות לפני שמצטרפות
          </h1>
          <p
            className="text-base sm:text-lg leading-relaxed"
            style={{ color: "#3a3a3a" }}
          >
            התשובות הישירות לשאלות שבעלות עסק שואלות אותנו הכי הרבה — כסף, זמן, אמון ושליטה. בלי spin.
          </p>
        </header>

        <div className="flex flex-col gap-10 sm:gap-12">
          {CATEGORIES.map((cat) => (
            <section key={cat.heading}>
              <h2
                className="font-headline mb-4"
                style={{
                  color: "#2e6853",
                  fontSize: "20px",
                  fontWeight: 700,
                }}
              >
                {cat.heading}
              </h2>
              <ul className="flex flex-col gap-3">
                {cat.items.map((item) => (
                  <li key={item.q}>
                    <details
                      open={item.open || undefined}
                      className="group rounded-lg border bg-white transition-colors"
                      style={{
                        borderColor: "rgba(46,104,83,0.18)",
                      }}
                    >
                      <summary
                        className="cursor-pointer list-none flex items-start justify-between gap-4 px-5 py-4 font-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e6853]/40 rounded-lg"
                        style={{
                          color: "#1C1A17",
                          fontSize: "17px",
                          fontWeight: 600,
                        }}
                      >
                        <span>{item.q}</span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 transition-transform group-open:rotate-45 text-2xl leading-none"
                          style={{ color: "#2e6853" }}
                        >
                          +
                        </span>
                      </summary>
                      <div
                        className="px-5 pb-5 pt-1 text-[15px] leading-relaxed"
                        style={{ color: "#3a3a3a" }}
                      >
                        {item.a}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="mt-14 sm:mt-16 border-t pt-8" style={{ borderColor: "rgba(46,104,83,0.18)" }}>
          <p className="text-base mb-4" style={{ color: "#3a3a3a" }}>
            עדיין יש שאלה? כתבי לי ב-Instagram <a href="https://www.instagram.com/meha_makor" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#2e6853" }}>@meha_makor</a> או הצטרפי עכשיו:
          </p>
          <a
            href="/register/producer"
            className="inline-flex items-center gap-2 font-medium transition hover:opacity-90"
            style={{
              backgroundColor: "#2e6853",
              color: "white",
              borderRadius: "8px",
              padding: "12px 22px",
            }}
          >
            הוסיפי את העסק שלך
          </a>
        </footer>
      </div>
    </main>
  );
}
