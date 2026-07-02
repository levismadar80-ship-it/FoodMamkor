"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { InstagramLogo, ArrowRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ButtonSpinner from "@/components/ButtonSpinner";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { BRAND_NAME } from "@/lib/constants";

/**
 * Footer (MEH-37 redesign) — brings the implementation in line with the
 * canonical docs/DESIGN.md §Footer spec.
 *
 * Structure (top → bottom):
 *   1. 3-column body — Brand / Navigation / Newsletter. The Navigation
 *      column carries the quiet producer nav-link → /register/producer
 *      (MEH-721). The dedicated "add business" pitch panel that used to
 *      sit above this body was removed in MEH-721 — the producer CTA now
 *      lives on /about/for-businesses (MEH-923) + this nav-link.
 *   2. Copyright bar — © line on the right, four utility links on the left
 *      (login · terms · privacy · accessibility).
 *
 * Scope guarantees:
 *   - POST /newsletter endpoint untouched (still the submit target).
 *   - No other pages modified.
 *
 * MEH-867 (footer compliance): every footer ink moved off raw inline hex
 * onto brand tokens (bg-primary-dark + green-50/green-100), all AA-passing
 * on the dark surface (≥6.3:1 vs the prior #6a8a6a 2.6:1 / #9ab89a 4.3:1
 * fails); added the IS-5568 accessibility-statement link; nav-column h3
 * dropped Hebrew uppercase/tracking; sr-only <h2> anchors the heading
 * hierarchy; the newsletter-submit arrow is Phosphor ArrowRight +
 * rtl:rotate-180 — bidi-correct (forward in both he and en). (The CTA
 * arrow was removed with the pitch panel in MEH-721.)
 *
 * History:
 *   - MEH-721: producer-CTA pitch panel moved out of global footer →
 *     /about/for-businesses + footer nav-link.
 *   - MEH-976: newsletter input switched to unicode-bidi:plaintext (+ pe-11)
 *     so the Hebrew placeholder no longer collides with the submit arrow;
 *     replaces the MEH-968 dir="ltr" + ps-11 attempt.
 */
export default function Footer() {
  const t = useTranslations();
  // MEH-721: producer-CTA panel moved out of global footer — see file-header History block.
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
      setMessage(detailToMessage(err.response?.data?.detail) || t("error.generic"));
    }
  };

  const navLinks = [
    { href: "/", label: t("nav.footer.nav_discover") },
    { href: "/map", label: t("nav.map") },
    { href: "/events", label: t("nav.footer.events") },
    { href: "/about", label: t("nav.footer.about") },
    { href: "/about/process", label: t("nav.footer.process") },
    { href: "/about/for-businesses", label: t("nav.footer.faq_businesses") },
    // MEH-721: quiet replacement for the removed global-footer pitch CTA.
    { href: "/register/producer", label: t("nav.footer.add_business") },
  ];

  return (
    <footer className="mt-16 bg-primary-dark text-green-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* MEH-721: the "add your business" pitch panel was removed from the
            global footer. The producer CTA stays reachable via the quiet
            footer nav-link below and the /about/for-businesses CTAs (MEH-923). */}
        {/* ================= 3-column body ================= */}
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-8">
          {/* Column 1 — Brand. MEH-867: sr-only <h2> doubles as the footer
              section anchor AND the brand-column heading, so the nav/newsletter
              <h3>s nest cleanly (no h2→h3 skip) and every column is titled. */}
          <div>
            <h2 className="sr-only">{BRAND_NAME}</h2>
            <Link href="/" aria-label={t("nav.footer.brand_aria")}>
              <Image
                src="/logo-footer.png"
                alt={BRAND_NAME}
                width={140}
                height={52}
                className="mb-4 brightness-0 invert"
              />
            </Link>
            <p className="text-sm leading-relaxed max-w-xs mb-4 text-green-50">
              {t("nav.footer.brand_tagline")}
            </p>
            <a
              href="https://www.instagram.com/meha_makor"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("nav.footer.instagram_aria")}
              className="inline-flex items-center gap-2 text-green-100 hover:text-white transition"
            >
              <InstagramLogo size={20} aria-hidden="true" />
              {/* MEH-968: <bdi> isolates the Latin handle so the leading "@" stays leading in the RTL footer (was rendering as "meha_makor@"). */}
              <bdi className="font-body-md">@meha_makor</bdi>
            </a>
          </div>

          {/* Column 2 — Navigation */}
          <nav aria-label={t("nav.footer.nav_aria")}>
            {/* MEH-867: AA-token ink + no uppercase/tracking — Hebrew has no
                uppercase, and letter-spacing harms RTL legibility. */}
            <h3 className="mb-3 text-green-100" style={{ fontSize: "11px" }}>
              {t("nav.footer.nav_heading")}
            </h3>
            <ul className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <li key={link.href + link.label}>
                  <Link
                    href={link.href}
                    className="text-green-100 hover:text-white transition"
                    style={{ fontSize: "13px" }}
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("nav.footer.newsletter_placeholder")}
                /* MEH-976: unicode-bidi:plaintext → Hebrew placeholder resolves RTL (opposite the end-0 arrow → clear gap), typed Latin email resolves LTR; pe-11 reserves the 44px on the arrow side for the LTR value. Replaces MEH-968 dir="ltr"+ps-11. */
                className="w-full bg-transparent text-white placeholder:text-white/40 outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-sm py-2 pe-11 min-h-[44px]"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.35)", unicodeBidi: "plaintext" }}
              />
              <button
                type="submit"
                disabled={status === "loading"}
                aria-label={t("nav.footer.newsletter_submit")}
                className="absolute end-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center text-white/60 hover:text-white transition disabled:opacity-40"
              >
                {status === "loading" ? (
                  <ButtonSpinner />
                ) : (
                  // MEH-867: bidi-correct submit affordance — ArrowRight points
                  // forward in LTR/en; rtl:rotate-180 flips it leftward (forward
                  // in RTL reading direction). Replaces a raw "→" glyph.
                  <ArrowRight size={18} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
                )}
              </button>
            </form>
            {message && (
              <p
                role="status"
                aria-live="polite"
                className={`text-sm mt-3 ${status === "success" ? "text-green-50" : "text-red-200"}`}
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
          {/* MEH-788 copy-Δ: P5-v2 bottom-row lock — wordmark only; the leaf
              emoji dropped per the UI-surface emoji LOCK (MEH-657). */}
          <p className="text-green-100" style={{ fontSize: "11px" }}>
            © {new Date().getFullYear()} {t("footer.copyright")}
          </p>
          <ul className="flex items-center gap-4">
            {[
              { href: "/login", label: t("nav.footer.login") },
              { href: "/terms", label: t("nav.footer.terms") },
              { href: "/privacy", label: t("nav.footer.privacy_short") },
              // MEH-867: IL IS 5568 — accessibility statement must be reachable
              // from the global footer.
              { href: "/accessibility", label: t("nav.footer.accessibility") },
            ].map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-green-100 hover:text-white transition"
                  style={{ fontSize: "11px" }}
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
