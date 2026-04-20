"use client";

import Link from "next/link";
import { useState } from "react";
import { Leaf, Cow, House, Plant } from "@phosphor-icons/react";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
import ParallaxQuote from "@/components/ParallaxQuote";

// Value cards use Phosphor icons (consistent rendering cross-platform).
// Each value has its own warm background so the 4-card grid doesn't
// feel monotonous. The icon sits inside a darker chip on top of the card.
const values = [
  {
    Icon: Leaf,
    title: "ללא מעובד",
    desc: "מוצרים טבעיים ללא תוספים מיותרים, עיבוד מינימלי ושימור הטעם האמיתי",
    bg: "#EAF3DE",
    chip: "#2e6853",
  },
  {
    Icon: Cow,
    title: "חומרי גלם מזוהים",
    desc: "שקיפות מלאה — תמיד תדעו מאיפה מגיע האוכל ומה יש בפנים",
    bg: "#FFF3E0",
    chip: "#c04040",
  },
  {
    Icon: House,
    title: "ייצור קטן",
    desc: "בתי עסק קטנים ומשפחתיים שמכינים בכמויות קטנות עם אהבה",
    bg: "#E8F5E9",
    chip: "#2e6853",
  },
  {
    Icon: Plant,
    title: "טרי ואמיתי",
    desc: "אוכל שהוכן לאחרונה, ללא חודשי מדף, ישר מהמקור אליכם",
    bg: "#F3E5F5",
    chip: "#9b59b6",
  },
];

const criteria = [
  "ייצור עצמי או משפחתי — לא סוחרים ולא מפיצים",
  "חומרי גלם איכותיים ומזוהים",
  "ללא חומרים משמרים מלאכותיים",
  "שקיפות מלאה על תהליך הייצור",
  "עמידה בתקני בטיחות מזון בסיסיים",
];

export default function AboutPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [contactStatus, setContactStatus] = useState(null);
  const [contactMsg, setContactMsg] = useState("");

  const handleContact = async (e) => {
    e.preventDefault();
    setContactStatus("loading");
    setContactMsg("");
    try {
      await api.post("/contact", form);
      setContactStatus("success");
      setContactMsg("תודה! נחזור אליך בקרוב 🌿");
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setContactStatus("error");
      setContactMsg(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    }
  };

  return (
    <div>
      {/* docs/archive/FEEDBACK_FIXES.md fix 4a — breadcrumb removed from /about.
          Breadcrumbs belong on producer/map pages, not on brand pages. */}

      {/* Hero — PREMIUM_DESIGN: Ken Burns background image instead of a
          flat green fill. The dark overlay keeps the headline readable. */}
      <section className="relative text-white overflow-hidden py-20 md:py-28">
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage:
              "url(https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&auto=format&q=80&fm=webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(46,74,46,0.82) 0%, rgba(46,74,46,0.88) 100%)",
          }}
        />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <h1 className="font-headline text-4xl md:text-6xl font-bold mb-6 leading-tight">
            אוכל אמיתי, ישר מהמקור אליך
          </h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto leading-relaxed font-body">
            הפלטפורמה שמחברת בין בתי עסק מקומיים לאנשים שמחפשים אוכל אמיתי
          </p>
        </div>
      </section>

      {/* Story — docs/archive/FEEDBACK_FIXES.md fix 4c — longer, richer text */}
      <section className="max-w-3xl mx-auto px-4 section-y">
        <h2 className="font-headline text-4xl font-bold mb-8 text-center text-site-text">
          הסיפור שלנו
        </h2>
        <div className="bg-white rounded-[16px] p-8 md:p-10 shadow-sm leading-loose text-lg text-site-text/85 border border-border space-y-5">
          <p>
            מהמקור נולדה מתוך צורך אמיתי — למצוא אוכל אמיתי, לא מעובד.
            בשר מחקלאים, גבינות אמיתיות, לחם מחמצת שמישהו הכין בבית,
            משקאות חקלאיים וירקות שגדלו באדמה ישראלית.
          </p>
          <p>
            אבל למצוא את כל זה? זה היה מסע. לרוץ אחרי מודעה בפייסבוק לפני
            שתפוג, לעקוב אחרי עמוד אינסטגרם של מישהי מהכפר, לשאול בקבוצת
            ווטסאפ של השכונה ולקוות שמישהי תענה.
          </p>
          <p>הכל היה מפוזר — קשה למצוא, קשה להגיע, קשה לסמוך.</p>
          <p className="font-semibold text-site-text">
            מהמקור שמה הכל במקום אחד.
          </p>
          <p>
            פלטפורמה שמרכזת בתי עסק מקומיים, כולם במקום אחד. פשוט, נגיש, ואמיתי.
          </p>
        </div>
      </section>

      {/* Values grid — per-card warm bg colors (docs/archive/FEEDBACK_FIXES.md fix 6) */}
      <section className="max-w-5xl mx-auto px-4 section-y">
        <h2 className="font-headline text-3xl font-bold mb-8 text-center text-site-text">
          הערכים שלנו
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {values.map((v) => {
            const Icon = v.Icon;
            return (
              <div
                key={v.title}
                className="rounded-[16px] p-6 shadow-sm hover:shadow-md transition border border-border"
                style={{ background: v.bg }}
              >
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3"
                  style={{ background: v.chip }}
                >
                  <Icon size={32} weight="duotone" color="white" aria-hidden="true" />
                </div>
                <h3 className="font-headline text-xl font-bold mb-2 text-site-text">{v.title}</h3>
                <p className="text-site-text/80 leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Criteria */}
      <section className="bg-white section-y border-y border-border">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="font-headline text-3xl font-bold mb-8 text-center text-site-text">קריטריוני כניסה</h2>
          <p className="text-site-muted text-center mb-8">
            לא כל עסק נכנס למהמקור. אלו הקריטריונים שאנחנו בודקים:
          </p>
          <ul className="space-y-4">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-3 bg-background rounded-[16px] p-4 border border-border">
                <span className="text-primary font-bold text-lg mt-0.5">✓</span>
                <span className="text-lg">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================================================
          SECTION A — Parallax quote divider
          ================================================ */}
      <ParallaxQuote
        image="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&auto=format&q=80&fm=webp"
        quote="כי מה שאוכלים — חשוב. ומאיפה קונים — חשוב יותר"
        overlayOpacity={0.7}
        height="350px"
      />

      {/* ================================================
          SECTION B — 3 columns of values (green bg)
          ================================================ */}
      <section className="bg-primary text-white section-y">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {/* Mission */}
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                {/* Greenhouse icon — SVG line-art */}
                <svg className="w-20 h-20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 28L32 10L56 28V54H8V28Z" />
                  <line x1="32" y1="10" x2="32" y2="54" />
                  <line x1="8" y1="32" x2="56" y2="32" />
                  <line x1="8" y1="42" x2="56" y2="42" />
                  <path d="M32 22C28 22 26 26 26 30" />
                  <path d="M32 22C36 22 38 26 38 30" />
                </svg>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4">המשימה</h3>
              <p className="text-light/90 leading-relaxed font-body">
                ליצור הזדמנויות כלכליות לבתי עסק מקומיים ולחבר קהילות עם היתרונות הבריאותיים, הסביבתיים והכלכליים של אוכל מקומי.
              </p>
            </div>

            {/* Community */}
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                {/* Trees icon */}
                <svg className="w-20 h-20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 34C14 34 10 28 14 22C12 16 18 12 22 14C24 8 32 8 32 16C36 14 42 18 40 24C44 28 40 34 34 34" />
                  <line x1="27" y1="34" x2="27" y2="54" />
                  <path d="M42 42C38 42 36 38 38 34C36 30 40 26 44 28C46 24 52 26 52 32C56 34 54 40 48 40" />
                  <line x1="47" y1="40" x2="47" y2="54" />
                  <line x1="8" y1="54" x2="58" y2="54" />
                </svg>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4">קהילה</h3>
              <p className="text-light/90 leading-relaxed font-body">
                כפלטפורמה מונעת ערכים, הקהילה היא העדיפות הראשונה שלנו. חיבור בין אנשים הוא המוקד של כל מה שאנחנו עושים.
              </p>
            </div>

            {/* Why MeHaMakor */}
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                {/* Farm tools icon */}
                <svg className="w-20 h-20" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="20" y1="8" x2="20" y2="56" />
                  <path d="M20 8L14 18L20 22L26 18L20 8Z" />
                  <line x1="44" y1="8" x2="44" y2="56" />
                  <path d="M38 8C38 14 44 18 50 14" />
                  <path d="M38 16C38 22 44 26 50 22" />
                  <path d="M38 24C38 30 44 34 50 30" />
                </svg>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4">למה מהמקור</h3>
              <p className="text-light/90 leading-relaxed font-body">
                מערכות המזון הגלובליות שבירות. בניגוד לתאגידים גדולים, מקורות מזון מקומיים יכולים להסתגל ולהתמיד. אנחנו כאן כדי לחזק אותם.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================
          SECTION B — Founder story
          ================================================ */}
      <section className="bg-background section-y">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* docs/archive/FEEDBACK_FIXES.md fix 6 — circular founder placeholder
                (rounded-full instead of rounded-[16px] square). Still
                a placeholder until a real photo of Sapir lands.
                TODO: replace with real photo */}
            <div className="flex justify-center md:justify-start order-1">
              <div
                className="w-[280px] h-[280px] md:w-[360px] md:h-[360px] rounded-full bg-light flex items-center justify-center border-4 border-primary/10 overflow-hidden shadow-[0_8px_32px_rgba(46,104,83,0.12)]"
                aria-label="תמונה של ספיר (placeholder)"
              >
                <Leaf size={120} weight="duotone" className="text-primary" aria-hidden="true" />
              </div>
            </div>
            {/* Text — left in RTL */}
            <div className="order-2 text-right">
              <h2 className="font-headline text-4xl md:text-5xl font-bold text-site-text mb-6">
                היי, אני ספיר.
              </h2>
              <div
                className="text-site-text/85 font-body text-lg space-y-5"
                style={{ lineHeight: "1.8" }}
              >
                <p>
                  מייסדת מהמקור. בת 21, תוכניתנית בצבא, ולומדת רפואה תזונתית
                  אצל ד&quot;ר גיל יוסף שחר.
                </p>
                <p>
                  התחלתי לשים לב שהכל סביבי רווי אוכל מעובד —
                  ואין מקום אחד שפשוט מראה לך איפה יש אוכל אמיתי קרוב לבית.
                </p>
                <p>
                  כמו הרבה משפחות, התחלנו לחפש מקורות מזון מקומיים ובריאים יותר.
                  וגילינו שזה לוקח המון צעדים — לשאול בקבוצות ווטסאפ, לגוגל, לחפש באינסטגרם...
                </p>
                <p>
                  עם כל הטכנולוגיה שיש לנו, זה לא אמור להיות כל כך מסובך.
                  אז מהמקור נולד.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================
          SECTION C — Contact form
          ================================================ */}
      <section className="bg-background section-y border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline text-4xl font-bold text-site-text mb-3">דברי איתנו</h2>
          <p className="text-site-muted font-body text-base mb-10">
            שאלות, רעיונות, או סתם שלום — נשמח לשמוע מכם
          </p>

          <form onSubmit={handleContact} className="space-y-4 text-right">
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium text-site-text mb-1">
                שם מלא
              </label>
              <input
                id="contact-name"
                type="text"
                required
                placeholder="השם המלא שלך"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white border border-border rounded-[8px] px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium text-site-text mb-1">
                אימייל
              </label>
              <input
                id="contact-email"
                type="email"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-white border border-border rounded-[8px] px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition"
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="contact-message" className="block text-sm font-medium text-site-text mb-1">
                איך נוכל לעזור?
              </label>
              <textarea
                id="contact-message"
                required
                rows={4}
                placeholder="ספרי לנו על מה את רוצה לדבר..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="w-full bg-white border border-border rounded-[8px] px-4 py-3 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 transition resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={contactStatus === "loading"}
              className="bg-primary text-white px-8 py-3 rounded-[8px] hover:bg-primary-light transition font-medium w-full md:w-auto disabled:opacity-60"
            >
              {contactStatus === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <ButtonSpinner />
                  שולחת...
                </span>
              ) : (
                "שלחי"
              )}
            </button>

            {contactMsg && (
              <p
                role="status"
                aria-live="polite"
                className={`text-center text-sm ${
                  contactStatus === "success" ? "text-primary" : "text-red-600"
                }`}
              >
                {contactMsg}
              </p>
            )}
          </form>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-y bg-background border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline text-4xl font-bold mb-4 text-site-text">מוכנה להצטרף?</h2>
          <p className="text-site-muted mb-8 text-lg">
            הצטרפי לקהילה של בתי עסק מקומיים ואנשים שאוהבים אוכל אמיתי
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register/producer"
              className="inline-flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-[8px] hover:bg-primary-light transition font-semibold text-lg"
            >
              הוסיפי את העסק שלך
              <Leaf size={20} weight="duotone" aria-hidden="true" />
            </Link>
            <Link
              href="/map"
              className="bg-white text-primary border border-primary px-8 py-3 rounded-[8px] hover:bg-light transition font-semibold text-lg"
            >
              גלי עסקים קרובים
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
