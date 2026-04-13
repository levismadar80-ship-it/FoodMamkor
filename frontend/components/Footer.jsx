"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { InstagramLogo } from "@phosphor-icons/react";
import { useLanguage } from "@/lib/language-context";
import ButtonSpinner from "@/components/ButtonSpinner";
import api from "@/lib/api";

/**
 * Four-column sitemap footer + brand column + newsletter block.
 * Structure (per docs/archive/UX_FIXES.md Fix 4 + docs/archive/COPY_FIXES.md Fix 4):
 *   - לגלות:          דף הבית | מפה | אירועים | עסקים חדשים
 *   - קהילה:          אירועים | מהמטבח של השכן | אודות
 *   - בתי עסק:       הוסף עסק | כניסה | ניהול העסק
 *   - שקיפות ואמון:   תנאי שימוש | פרטיות | נגישות | יצירת קשר
 *                     (Israeli legal compliance — all four pages required)
 */
export default function Footer() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState("");

  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setMessage("");
    try {
      await api.post("/newsletter", { email });
      setStatus("success");
      setMessage("ברוכה הבאה למהמקור 🌱 נפגשות בתיבה");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    }
  };

  const columns = [
    {
      title: t("footer_discover"),
      links: [
        { href: "/", label: t("footer_home") },
        { href: "/map", label: t("footer_map") },
        { href: "/#producers-grid", label: t("footer_all_businesses") },
        { href: "/#producers-grid", label: t("footer_new_businesses") },
      ],
    },
    {
      title: t("footer_community"),
      links: [
        { href: "/events", label: t("footer_events") },
        { href: "/#home-kitchen", label: t("footer_neighbor_kitchen") },
        { href: "/about", label: t("footer_about") },
      ],
    },
    {
      title: t("footer_businesses"),
      links: [
        { href: "/register/producer", label: t("footer_add_business") },
        { href: "/login", label: t("footer_login") },
        { href: "/producer/dashboard", label: t("footer_manage") },
      ],
    },
    {
      title: t("footer_trust"),
      links: [
        { href: "/terms", label: t("footer_terms") },
        { href: "/privacy", label: t("footer_privacy") },
        { href: "/accessibility", label: t("footer_accessibility") },
        { href: "/contact", label: t("footer_contact") },
      ],
    },
  ];

  return (
    <footer className="bg-primary-dark text-light mt-16">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Top row: brand + 4 nav columns + newsletter */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-10">
          {/* Brand — md:span 3 */}
          <div className="md:col-span-3">
            <Link href="/">
              <Image
                src="/logo-footer.png"
                alt="מהמקור"
                width={140}
                height={52}
                className="mb-4 brightness-0 invert"
              />
            </Link>
            <p className="text-light/90 text-sm leading-relaxed max-w-xs mb-3">
              ישר מהמקור אליך. פלטפורמה שמחברת בין בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית — לצרכנים ישראליים.
            </p>
            <ul className="text-light/70 text-xs space-y-1 mb-4">
              <li>ח.פ.: רשום לפני השקה</li>
              <li>כתובת: רשום לפני השקה</li>
              <li>📧 levismadar80@gmail.com</li>
            </ul>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="עמוד האינסטגרם של מהמקור — נפתח בחלון חדש"
              className="inline-flex items-center gap-2 text-light/90 hover:text-white transition"
            >
              <InstagramLogo size={20} weight="duotone" aria-hidden="true" />
              <span className="font-body">@meha_makor</span>
            </a>
          </div>

          {/* 4 nav columns — md:span 6 (1.5 each) */}
          <nav className="md:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-6" aria-label="ניווט ראשי בפוטר">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="font-headline text-base font-bold mb-3 text-white">{col.title}</h3>
                <ul className="flex flex-col gap-2 text-sm text-light/90">
                  {col.links.map((link) => (
                    <li key={`${col.title}-${link.label}`}>
                      <Link href={link.href} className="hover:text-white transition">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {/* Newsletter — md:span 3 */}
          <div className="md:col-span-3">
            <h3 className="font-headline text-2xl font-bold mb-2 text-white">{t("footer_newsletter_title")}</h3>
            <p className="text-light/90 text-sm mb-4">
              {t("footer_newsletter_subtitle")}
            </p>
            <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
              <label htmlFor="footer-newsletter-email" className="sr-only">
                אימייל לניוזלטר
              </label>
              <input
                id="footer-newsletter-email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("footer_newsletter_placeholder")}
                className="bg-transparent border text-white placeholder:text-light/60 rounded-[8px] px-4 py-2 outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-light"
                style={{ borderColor: "rgba(255,255,255,0.3)" }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-light text-primary-dark px-5 py-2 rounded-[8px] hover:bg-white transition font-medium disabled:opacity-60"
              >
                {status === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <ButtonSpinner />
                    {t("footer_newsletter_loading")}
                  </span>
                ) : (
                  t("footer_newsletter_submit")
                )}
              </button>
            </form>
            {message && (
              <p
                role="status"
                aria-live="polite"
                className={`text-sm mt-3 ${status === "success" ? "text-light" : "text-red-200"}`}
              >
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-light/70">
          <p>© {new Date().getFullYear()} {t("footer_copyright")}</p>
          <p>{t("footer_made_with_love")}</p>
        </div>
      </div>
    </footer>
  );
}
