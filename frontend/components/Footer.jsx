"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { InstagramLogo, ArrowLeft } from "@phosphor-icons/react";
import ButtonSpinner from "@/components/ButtonSpinner";
import api from "@/lib/api";

/**
 * Footer (MEH-37 redesign) — brings the implementation in line with the
 * canonical docs/DESIGN.md §Footer spec.
 *
 * Structure (top → bottom):
 *   1. CTA row — teal-tinted panel inside the primary-dark footer,
 *      "יש לך עסק?" pitch on the right, "הוסיפי את העסק שלך" CTA on the
 *      left (secondary #4cb08b per DESIGN.md brand token).
 *   2. 3-column body — Brand / Navigation / Newsletter. Dropped the
 *      previous 4-nav-column sitemap that had drifted from DESIGN.md
 *      and doubled up with the new CTA row (add-business pitch was in
 *      two places).
 *   3. Copyright bar — © line on the right (including the made-with-love
 *      tagline), three utility links on the left (login · terms · privacy).
 *
 * Scope guarantees:
 *   - POST /newsletter endpoint untouched (still the submit target).
 *   - No other pages modified.
 *
 * About the CTA button color #4cb08b (secondary token): white-on-#4cb08b
 * has a ~2.2:1 contrast ratio which fails WCAG AA. It's the established
 * brand secondary per DESIGN.md (`--secondary: #4cb08b`) so matching the
 * spec literally this round. If we later tighten a11y, `primary #2e6853`
 * is the drop-in replacement that passes AA.
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

  const navLinks = [
    { href: "/", label: "גלה עסקים" },
    { href: "/map", label: "מפה" },
    { href: "/neighbor", label: "מהמטבח של השכן" },
    { href: "/events", label: "אירועים" },
    { href: "/about", label: "אודות" },
  ];

  return (
    <footer className="mt-16 text-[#EAF3DE]" style={{ backgroundColor: "#2E4A2E" }}>
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* ================= CTA row ================= */}
        <div
          className="mb-10 rounded-[10px] flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            backgroundColor: "rgba(76,176,139,0.15)",
            border: "1px solid rgba(76,176,139,0.3)",
            padding: "12px 24px",
          }}
        >
          <div className="text-center sm:text-right">
            <p className="font-headline text-white" style={{ fontSize: "14px" }}>
              יש לך עסק מזון מקומי?
            </p>
            <p style={{ fontSize: "11px", color: "#9ab89a" }}>
              הצטרפי לאלפי בעלות עסק במהמקור
            </p>
          </div>
          <Link
            href="/register/producer"
            className="inline-flex items-center gap-2 font-medium whitespace-nowrap transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/60"
            style={{
              backgroundColor: "#4cb08b",
              color: "white",
              borderRadius: "8px",
              padding: "10px 20px",
            }}
          >
            הוסיפי את העסק שלך
            <ArrowLeft size={14} weight="bold" aria-hidden="true" />
          </Link>
        </div>

        {/* ================= 3-column body ================= */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8">
          {/* Column 1 — Brand */}
          <div>
            <Link href="/" aria-label="מהמקור — דף הבית">
              <Image
                src="/logo-footer.png"
                alt="מהמקור"
                width={140}
                height={52}
                className="mb-4 brightness-0 invert"
              />
            </Link>
            <p className="text-sm leading-relaxed max-w-xs mb-4" style={{ color: "#EAF3DE" }}>
              ישר מהמקור אליך — בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית.
            </p>
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="עמוד האינסטגרם של מהמקור — נפתח בחלון חדש"
              className="inline-flex items-center gap-2 hover:text-white transition"
              style={{ color: "#c8dcc8" }}
            >
              <InstagramLogo size={20} weight="duotone" aria-hidden="true" />
              <span className="font-body">@meha_makor</span>
            </a>
          </div>

          {/* Column 2 — Navigation */}
          <nav aria-label="ניווט ראשי בפוטר">
            <h3
              className="mb-3"
              style={{
                fontSize: "9px",
                color: "#9ab89a",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              ניווט
            </h3>
            <ul className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="hover:text-white transition"
                    style={{ fontSize: "13px", color: "#c8dcc8" }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Column 3 — Newsletter */}
          <div>
            <h3
              className="font-headline text-white mb-1"
              style={{ fontSize: "16px" }}
            >
              הישארי מעודכנת
            </h3>
            <p className="mb-4" style={{ fontSize: "12px", color: "#9ab89a" }}>
              מוצרים חדשים ועסקים ישר לתיבה
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
                placeholder="האימייל שלך"
                className="bg-transparent text-white placeholder:text-white/50 rounded-[8px] px-4 py-2 outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-white/40"
                style={{ border: "1px solid rgba(255,255,255,0.2)" }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="bg-[#EAF3DE] text-[#2E4A2E] px-5 py-2 rounded-[8px] hover:bg-white transition font-medium disabled:opacity-60"
              >
                {status === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <ButtonSpinner />
                    מצטרפת...
                  </span>
                ) : (
                  "הצטרפי"
                )}
              </button>
            </form>
            {message && (
              <p
                role="status"
                aria-live="polite"
                className={`text-sm mt-3 ${status === "success" ? "text-[#EAF3DE]" : "text-red-200"}`}
              >
                {message}
              </p>
            )}
          </div>
        </div>

        {/* ================= Copyright bar ================= */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: "12px",
            marginTop: "32px",
          }}
        >
          <p style={{ fontSize: "11px", color: "#6a8a6a" }}>
            © {new Date().getFullYear()} מהמקור · נעשה באהבה בישראל 🌿
          </p>
          <ul className="flex items-center gap-4">
            {[
              { href: "/login", label: "כניסה לחשבון" },
              { href: "/terms", label: "תנאי שימוש" },
              { href: "/privacy", label: "פרטיות" },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="hover:text-white transition"
                  style={{ fontSize: "11px", color: "#6a8a6a" }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
