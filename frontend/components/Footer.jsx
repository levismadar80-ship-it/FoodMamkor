"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { InstagramLogo } from "@phosphor-icons/react";
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
      title: "לגלות",
      links: [
        { href: "/", label: "דף הבית" },
        { href: "/map", label: "מפה" },
        { href: "/#producers-grid", label: "כל העסקים" },
        { href: "/#producers-grid", label: "עסקים חדשים" },
      ],
    },
    {
      title: "קהילה",
      links: [
        { href: "/events", label: "אירועים" },
        { href: "/#home-kitchen", label: "מהמטבח של השכן" },
        { href: "/about", label: "אודות" },
      ],
    },
    {
      title: "בתי עסק",
      links: [
        { href: "/register/producer", label: "הוסיפי את העסק שלך 🌿" },
        { href: "/login", label: "כניסה לחשבון" },
        { href: "/producer/dashboard", label: "ניהול העסק" },
      ],
    },
    {
      title: "שקיפות ואמון",
      links: [
        { href: "/terms", label: "תנאי שימוש" },
        { href: "/privacy", label: "מדיניות פרטיות" },
        { href: "/accessibility", label: "הצהרת נגישות" },
        { href: "/contact", label: "יצירת קשר" },
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
            <p className="text-light/90 text-sm leading-relaxed max-w-xs mb-4">
              ישר מהמקור אליך. פלטפורמה שמחברת בין בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית — לצרכנים ישראליים.
            </p>

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
            <h3 className="font-headline text-2xl font-bold mb-2 text-white">הישארי מעודכנת</h3>
            <p className="text-light/90 text-sm mb-4">
              מוצרים חדשים, אירועים ועסקים ישר לתיבה שלך.
            </p>
            <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
              <label htmlFor="footer-newsletter-email" className="sr-only">
                אימייל לניוזלטר
              </label>
              <input
                id="footer-newsletter-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="האימייל שלך"
                className="bg-transparent border text-white placeholder:text-light/60 rounded-[8px] px-4 py-2 outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-light"
                style={{ borderColor: "rgba(255,255,255,0.3)" }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-light text-primary-dark px-5 py-2 rounded-[8px] hover:bg-white transition font-medium disabled:opacity-60"
              >
                {status === "loading" ? "..." : "הצטרפי"}
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
          <p>© {new Date().getFullYear()} מהמקור. כל הזכויות שמורות.</p>
          <p>נעשה באהבה בישראל 🌿</p>
        </div>
      </div>
    </footer>
  );
}
