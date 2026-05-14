import { BRAND_NAME } from "@/lib/constants";
import { SITE_URL } from "@/lib/seo";

export const metadata = {
  title: "FAQ לבתי עסק — מהמקור",
  description:
    "8 שאלות נפוצות מבעלות עסק מקומיות על מהמקור: עלות, ערך, זמן, אמון בפלטפורמה ושליטה בלקוחות. תשובות ישירות ושקופות.",
  openGraph: {
    title: "FAQ לבתי עסק — מהמקור",
    description: "8 שאלות נפוצות + תשובות ישירות לבעלות עסק שמתלבטות להצטרף.",
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
        a: "אפס. את לא משלמת לנו כלום — לא עמלה על הזמנות, לא דמי מנוי. הלקוחות יתקשרו אלייך ישירות ב-WhatsApp או בטלפון, ואת תקבלי 100% מהתשלום שלהן.",
        open: true,
      },
      {
        q: "מה אני מקבלת מזה?",
        a:
          "שני דברים שלא היו לך קודם:\n\n" +
          '**מישהי שמחפשת "גבינות עזים תל אביב" בגוגל ב-9 בערב — מוצאת אותך.** היום, אם את לא לקוחה של תקציב פרסום, את כמעט בלתי-נראית בגוגל. אצלנו כל בית עסק מקבל דף שמתועדף ב-SEO.\n\n' +
          "**דף קבוע שלך באינטרנט, שלא נעלם.** Instagram נעלם אחרי 24 שעות. WhatsApp נעלם כשמישהי לא בקבוצה. הדף שלך במהמקור — נשאר. עם הסיפור שלך, התמונות שלך, ואמצעי הקשר שאת בוחרת. את יכולה לשלוח אותו כקישור לכל מי שתרצי, ולשים בביו של Instagram.",
      },
    ],
  },
  {
    heading: "זמן ומאמץ",
    items: [
      {
        q: "כמה זמן זה ייקח לי?",
        a: "בערך 10 דקות לרישום הראשוני. אחרי זה — את לא צריכה לעשות כלום שוטף. אין לך הזמנות לנהל אצלנו, אין מלאי לעדכן, אין צ'אט פנימי לענות לו. את ממשיכה לעבוד איך שאת עובדת. אם משהו אצלך משתנה — שעות פתיחה, מוצר חדש, הפסקה — את מעדכנת בלחיצה, או שולחת לי הודעה ב-WhatsApp ואני אעדכן.",
      },
      {
        q: "אני לא יודעת לכתוב על עצמי. הדף יראה דל?",
        a: "את לא צריכה לכתוב לבד. תספרי לי על העסק במה שאת רגילה לכתוב — WhatsApp, אינסטגרם, איך שנוח לך — ואני אעזור לנסח. תמונות מהטלפון מצוינות, לא צריך צלם מקצועי. אם בא לך — נשב 15 דקות בטלפון ונבנה ביחד.",
      },
    ],
  },
  {
    heading: "אמון בפלטפורמה",
    items: [
      {
        q: "מי עומדת מאחורי מהמקור?",
        a: "אני ספיר, בת 21, מזכרון יעקב. בניתי את מהמקור כי גם אני חיפשתי איפה לקנות אוכל אמיתי וקרוב, וזה היה קשה — קבוצות WhatsApp, חיפוש באינסטגרם. רציתי מקום אחד. אני לבד כרגע, בלי משקיעים, בלי חברה גדולה. את יכולה לדבר איתי ב-WhatsApp ישירות, לשאול מה שאת רוצה.",
      },
      {
        q: "הלקוחות שיגיעו דרככם — שלכם או שלי?",
        a: "שלך. לחלוטין. הלקוחות פונות אלייך ישירות ב-WhatsApp או בטלפון — את מקבלת את הפרטים שלהן, את מנהלת את הקשר. אנחנו לא בתווך, אנחנו לא רואות את ההודעות, אנחנו לא לוקחות פרטים. גם אם מהמקור תיסגר מחר, הלקוחות שהגיעו אלייך דרכנו נשארות שלך. זה ההפך מ-Wolt או Yango.",
      },
    ],
  },
  {
    heading: "שליטה ועמדה",
    items: [
      {
        q: "אני כבר ב-Instagram וב-WhatsApp — למה אני צריכה עוד מקום?",
        a:
          "Instagram עובד רק כשמישהי כבר עוקבת אחרייך. WhatsApp groups עובדים רק כשמישהי כבר בקבוצה. מהמקור עובד גם כשאת לא חושבת על זה — מישהי מחפשת אוכל מקומי בגוגל ב-9 בערב, מוצאת אותך. זה לא במקום הערוצים שלך, זה בנוסף.\n\n" +
          'וחשוב לדעת — במהמקור אין השוואה. אין מחירים זה ליד זה, אין דירוג כוכבים, אין כפתור "ראי 10 בתי עסק דומים". כל בית עסק עומד בפני עצמו. הלקוחה רואה אותך, לא אותך-מול-אחרות.',
      },
      {
        q: "אני רוצה להחליט עם מי לעבוד ומתי.",
        a: 'את החלטת מתי אצלך פתוח. כפתור אחד — "מקבלת הזמנות", "עמוסה כרגע", "בהפסקה" — את בוחרת. אין אלגוריתם שמדרג אותך לפי מהירות תגובה. את עונה ב-WhatsApp רק כשבא לך. ואם לקוחה לא מתאימה לך — את לא חייבת. אין דירוג שיורד לך אם תגידי "סליחה, לא הפעם".',
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
        text: item.a.replace(/\*\*/g, ""),
      },
    })),
  };
}

function renderInline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyBase}-${i}`}>{part}</span>;
  });
}

function renderAnswer(text) {
  const paragraphs = text.split("\n\n");
  return paragraphs.map((para, i) => (
    <p key={i} className={i === paragraphs.length - 1 ? "" : "mb-3"}>
      {renderInline(para, `p${i}`)}
    </p>
  ));
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
            8 שאלות לפני שמצטרפות
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
                        {renderAnswer(item.a)}
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
