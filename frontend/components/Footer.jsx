"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { InstagramLogo, ArrowLeft } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ButtonSpinner from "@/components/ButtonSpinner";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Footer (MEH-37 redesign) — brings the implementation in line with the
 * canonical docs/DESIGN.md §Footer spec.
 *
 * Structure (top → bottom):
 *   1. CTA row — teal-tinted panel inside the primary-dark footer,
 *      "יש לך עסק?" pitch on the right, "הוסיפי את העסק שלך" CTA on the
 *      left (primary #2e6853 brand green; MEH-703 retired the prior secondary).
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
 * CTA button color: `primary` (#2e6853) via `bg-primary`. MEH-703
 * consolidated the brand palette to a single green and retired the prior
 * `secondary` #4cb08b (whose white-on-#4cb08b was ~2.2:1, failing WCAG AA);
 * white-on-#2e6853 passes AA — the drop-in this header already anticipated.
 */
export default function Footer() {
  const t = useTranslations();
  // MEH-669: hide the "add your business" CTA panel from admins.
  // Server-side guard at backend/app/routers/auth.py:432 enforces the
  // policy; this is defense-in-depth UX so admins don't see an action
  // they're not allowed to take.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
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
      setMessage(t("nav.footer.newsletter_success"));
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err.response?.data?.detail || t("error.generic"));
    }
  };

  const navLinks = [
    { href: "/", label: t("nav.footer.nav_discover") },
    { href: "/map", label: t("nav.map") },
    { href: "/events", label: t("nav.footer.events") },
    { href: "/about", label: t("nav.footer.about") },
    { href: "/about/for-businesses", label: t("nav.footer.faq_businesses") },
  ];

  return (
    <footer className="mt-16 text-[#EAF3DE]" style={{ backgroundColor: "#2E4A2E" }}>
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* ================= CTA row ================= */}
        {/* MEH-669: panel hidden from admins (defense-in-depth alongside
            backend 403 at auth.py:432). Whole panel is wrapped — hiding
            only the Link would leave an orphan "יש לך עסק?" pitch box. */}
        {!isAdmin && (
          <div
            className="mb-10 rounded-[10px] flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{
              backgroundColor: "rgba(76,176,139,0.15)",
              border: "1px solid rgba(76,176,139,0.3)",
              padding: "12px 24px",
            }}
          >
            <Link
              href="/register/producer"
              className="inline-flex items-center gap-2 font-medium whitespace-nowrap transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/60 bg-primary"
              style={{
                color: "white",
                borderRadius: "8px",
                padding: "10px 20px",
              }}
            >
              {t("nav.footer.add_business")}
              <ArrowLeft size={14} weight="bold" aria-hidden="true" />
            </Link>
            <div className="text-center sm:text-start">
              <p className="font-headline-md text-white" style={{ fontSize: "14px" }}>
                {t("nav.footer.cta_pitch")}
              </p>
              <p style={{ fontSize: "11px", color: "#9ab89a" }}>
                {t("nav.footer.cta_subpitch")}
              </p>
            </div>
          </div>
        )}

        {/* ================= 3-column body ================= */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8">
          {/* Column 1 — Brand */}
          <div>
            <Link href="/" aria-label={t("nav.footer.brand_aria")}>
              <Image
                src="/logo-footer.png"
                alt={BRAND_NAME}
                width={140}
                height={52}
                className="mb-4 brightness-0 invert"
              />
            </Link>
            <p className="text-sm leading-relaxed max-w-xs mb-4" style={{ color: "#EAF3DE" }}>
              {t("nav.footer.brand_tagline")}
            </p>
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("nav.footer.instagram_aria")}
              className="inline-flex items-center gap-2 hover:text-white transition"
              style={{ color: "#c8dcc8" }}
            >
              <InstagramLogo size={20} weight="duotone" aria-hidden="true" />
              <span className="font-body">@meha_makor</span>
            </a>
          </div>

          {/* Column 2 — Navigation */}
          <nav aria-label={t("nav.footer.nav_aria")}>
            <h3
              className="mb-3"
              style={{
                fontSize: "9px",
                color: "#9ab89a",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {t("nav.footer.nav_heading")}
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
              className="font-headline-md text-white mb-4"
              style={{ fontSize: "16px" }}
            >
              {t("nav.footer.newsletter_heading")}
            </h3>
            <form onSubmit={handleSubscribe} className="relative">
              <label htmlFor="footer-newsletter-email" className="sr-only">
                {t("nav.footer.newsletter_label")}
              </label>
              <input
                id="footer-newsletter-email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("nav.footer.newsletter_placeholder")}
                className="w-full bg-transparent text-white placeholder:text-white/40 outline-none py-2 pe-8"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.35)" }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                aria-label={t("nav.footer.newsletter_submit")}
                className="absolute end-0 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition disabled:opacity-40"
              >
                {status === "loading" ? <ButtonSpinner /> : "→"}
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
            © {new Date().getFullYear()} {t("footer.copyright")} 🌿
          </p>
          <ul className="flex items-center gap-4">
            {[
              { href: "/login", label: t("nav.footer.login") },
              { href: "/terms", label: t("nav.footer.terms") },
              { href: "/privacy", label: t("nav.footer.privacy_short") },
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
