"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Leaf, Plus, Minus } from "@phosphor-icons/react";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
import ParallaxQuote from "@/components/ParallaxQuote";

const TIPS = [
  {
    q: "למה ביצים אורגניות שוות את המחיר?",
    a: "תרנגולות אורגניות גדלות בחוץ, אוכלות מזון ללא חומרי הדברה ואנטיביוטיקה. הביצים שלהן מכילות יותר אומגה-3, ויטמין E ונוגדי חמצון. לא שוני דרמטי — אבל פחות חשיפה לכימיקלים, וחיים יותר אנושיים לתרנגולות.",
  },
  {
    q: "מה זה grass-fed בישראל?",
    a: "בסופר — רוב הבקר גדל בפיטום על תירס ותוספות. Grass-fed = פרות שחיו כל חייהן במרעה, אוכלות עשב טבעי. בישראל זה נדיר ויקר יותר — אבל הבשר בעל טעם עמוק יותר, שומן צהבהב אופייני, ויותר אומגה-3. מגדלים כמו גיליס מרמת הגולן ומרעה גולן הם דוגמאות קלאסיות.",
  },
  {
    q: "דבש מהסופר vs. דבש לא מחומם — מה ההבדל?",
    a: "דבש סופר עובר פסטור — חימום שהורס אנזימים, נוגדי חמצון ואבקת פרחים. דבש לא מחומם שומר על הכל — טעם עשיר יותר, תכונות אנטי-בקטריאליות טבעיות. איך מזהים? עבה יותר, לא שקוף לגמרי, לפעמים מתגבש — וזה סימן טוב.",
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
  const [openTip, setOpenTip] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);

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
      {/* ======== Section 1 — Hero ======== */}
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
            פעם היית צריכה לדעת את מי לשאול. עכשיו לא.
          </h1>
        </div>
      </section>

      {/* ======== Section 2 — Sapir's story ======== */}
      <section className="bg-background section-y">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
            {/* Founder photo — Path C editorial portrait (MEH-100) */}
            <div className="flex justify-center md:justify-start order-1">
              <div
                className="relative w-[280px] h-[373px] md:w-[360px] md:h-[480px] rounded-xl bg-light flex items-center justify-center border border-primary/15 overflow-hidden"
                aria-label="תמונה של ספיר, מייסדת מהמקור"
              >
                {imgFailed ? (
                  <Leaf size={120} weight="duotone" className="text-primary" aria-hidden="true" />
                ) : (
                  <Image
                    src="https://res.cloudinary.com/dfzpscjks/image/upload/f_auto,q_auto,c_fill,g_auto,ar_3:4/v1777302486/WhatsApp_Image_2026-04-27_at_18.07.36_dl4ldr.jpg"
                    alt="ספיר, מייסדת מהמקור"
                    fill
                    sizes="(min-width: 768px) 360px, 280px"
                    className="object-cover"
                    priority={false}
                    onError={() => setImgFailed(true)}
                  />
                )}
              </div>
            </div>
            <div className="order-2 text-right">
              <div
                className="text-site-text/85 font-body text-lg space-y-5"
                style={{ lineHeight: "1.8" }}
              >
                <p className="font-headline font-bold text-site-text text-2xl">היי, אני ספיר.</p>
                <p>
                  תמיד היה לי חשוב לדעת מאיפה האוכל שלי מגיע. רציתי לקנות יותר טוב — יותר בריא, יותר מקומי.
                </p>
                <p>
                  אבל מהר מאוד גיליתי שזה לא נגיש. כדי למצוא אוכל איכותי באמת, הייתי צריכה לחפש שעות — לשאול את האנשים הנכונים, להצטרף לקבוצות וואטסאפ, לחפש בגוגל ובאינסטגרם.
                </p>
                <p>
                  ואז הבנתי: הבעיה היא לא שאין אוכל טוב. הבעיה שלא יודעים איפה למצוא אותו.
                </p>
                <p>
                  יש חקלאים שמוכרים ירקות טריים כמה דקות מהבית. יש מישהי שאופה לחם מחמצת בשכונה ליד. יש בתי עסק קטנים עם מוצרים מדהימים — שרוב האנשים בכלל לא מכירים. אז ממשיכים לקנות בסופר — לא כי זה הכי טוב, אלא כי זה הכי נוח.
                </p>
                <p>
                  וכאן נולדה מהמקור. מקום אחד שמרכז עבורך אוכל אמיתי, מקומי ובריא — קרוב לבית. בלי לחפש שעות.
                </p>
                <p className="text-sm text-site-muted">
                  מייסדת מהמקור, תוכניתנית בצבא ולומדת רפואה תזונתית.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Parallax divider */}
      <ParallaxQuote
        image="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1600&auto=format&q=80&fm=webp"
        quote="כי מה שאוכלים — חשוב. ומאיפה קונים — חשוב יותר"
        overlayOpacity={0.7}
        height="350px"
      />

      {/* ======== Section 3 — 3 columns ======== */}
      <section className="bg-primary text-white section-y">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <h3 className="font-headline text-2xl font-bold mb-4">אוכל אמיתי קרוב אלייך</h3>
              <p className="text-light/90 leading-relaxed font-body">
                בלי לנסוע שעה. בלי לחפש שבועות.
                <br />
                העסקים שתמיד היו — רק שעכשיו את רואה אותם.
              </p>
            </div>
            <div className="text-center">
              <h3 className="font-headline text-2xl font-bold mb-4">לסמוך על מה שאת אוכלת</h3>
              <p className="text-light/90 leading-relaxed font-body">
                רק בתי עסק מאומתים. אנחנו בודקות כל אחת
                <br />
                לפני שהיא מופיעה.
              </p>
            </div>
            <div className="text-center">
              <h3 className="font-headline text-2xl font-bold mb-4">לעזור לעסקים הקטנים</h3>
              <p className="text-light/90 leading-relaxed font-body">
                כל קנייה מקומית היא בחירה — להשאיר את הכסף
                <br />
                בקהילה שלך, ולתמוך באנשים שמאחורי האוכל.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ======== Section 4 — Tips accordion ======== */}
      <section className="max-w-3xl mx-auto px-4 section-y">
        <h2 className="font-headline text-3xl font-bold mb-8 text-center text-site-text">
          מה כדאי לדעת
        </h2>
        <div className="space-y-3">
          {TIPS.map((tip, i) => (
            <div key={i} className="border border-border rounded-[12px] overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setOpenTip(openTip === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 px-6 py-4 text-right font-medium text-site-text hover:bg-background transition"
                aria-expanded={openTip === i}
                aria-controls={`tip-panel-${i}`}
              >
                <span>{tip.q}</span>
                {openTip === i ? (
                  <Minus size={18} weight="bold" className="text-primary shrink-0" aria-hidden="true" />
                ) : (
                  <Plus size={18} weight="bold" className="text-primary shrink-0" aria-hidden="true" />
                )}
              </button>
              {openTip === i && (
                <div id={`tip-panel-${i}`} className="px-6 pb-5 pt-4 text-site-text/85 leading-relaxed border-t border-border">
                  {tip.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ======== Section 5 — Testimonials ======== */}
      <section className="bg-background section-y border-y border-border">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-headline text-3xl font-bold mb-4 text-site-text">
            מה אומרים עלינו
          </h2>
          <p className="text-site-muted text-lg mb-6">הסיפורים מגיעים בקרוב 🌿</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            גם את רוצה לשתף? כתבי לנו
          </Link>
        </div>
      </section>

      {/* ======== Section 6 — Criteria ======== */}
      <section className="bg-white section-y border-y border-border">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="font-headline text-3xl font-bold mb-8 text-center text-site-text">
            קריטריוני כניסה
          </h2>
          <p className="text-site-muted text-center mb-8">
            לא כל עסק נכנס למהמקור. אלו הקריטריונים שאנחנו בודקות:
          </p>
          <ul className="space-y-4">
            {criteria.map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-3 bg-background rounded-[16px] p-4 border border-border"
              >
                <span className="text-primary font-bold text-lg mt-0.5">✓</span>
                <span className="text-lg">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ======== Section 7 — CTA for businesses ======== */}
      <section className="section-y bg-background border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline text-4xl font-bold mb-8 text-site-text">
            יש לך בית עסק? בואי אלינו.
          </h2>
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

      {/* ======== Contact form ======== */}
      <section className="bg-background section-y border-t border-border">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="font-headline text-4xl font-bold text-site-text mb-3">דברי איתנו</h2>
          <p className="text-site-muted font-body text-base mb-10">
            שאלות, רעיונות, או סתם שלום — נשמח לשמוע מכן
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
    </div>
  );
}
