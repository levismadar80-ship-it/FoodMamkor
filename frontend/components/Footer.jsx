"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { InstagramLogo, FacebookLogo, TiktokLogo, YoutubeLogo, ArrowRight, CaretDown } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ButtonSpinner from "@/components/ButtonSpinner";
import CollectionNotice from "@/components/CollectionNotice";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { BRAND_NAME } from "@/lib/constants";
import { useExperiencesNavGate } from "@/lib/use-experiences-nav-gate";
import { useEventsNavGate } from "@/lib/use-events-nav-gate";

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
  // MEH-2397: on mobile each link group is a closed accordion row. Desktop
  // (md:) renders the heading as plain text — an inert `<button
  // aria-expanded="false">` there would still sit in the tab order and tell a
  // screen reader the (visible) list is collapsed. SSR and the first client
  // render are the mobile markup (closed), so there is no hydration diff; the
  // media query flips it in an effect. `md:flex` on the list keeps the links
  // visible on desktop even before the effect runs.
  const [openGroup, setOpenGroup] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  // MEH-1918: shared with the Header so one page load makes one request.
  const showExperiences = useExperiencesNavGate();
  // MEH-2369: same idea for events — no upcoming event, no link.
  const showEvents = useEventsNavGate();

  // MEH-1177 (ADR-024): the flat 8-link nav mixed two audiences (readers +
  // producers). NN/g "Footers 101" — group links by secondary audience rather
  // than dumping them in one column. Two labelled groups: readers ("גלו") +
  // producers ("לבתי עסק"). Copy locked by Sapir 13/07.
  const discoverLinks = [
    { href: "/", label: t("nav.footer.nav_discover") },
    // MEH-1060 (SEO-09): link to the /producers index — the crawlable catalog
    // walk was previously reachable only via sitemap/pagination, not the footer.
    { href: "/producers", label: t("nav.footer.producers") },
    { href: "/map", label: t("nav.map") },
    ...(showEvents ? [{ href: "/events", label: t("nav.footer.events") }] : []),
    // MEH-1918: data-gated — the experiences link joins "גלו" only once
    // /experiences has real supply (see lib/use-experiences-nav-gate.js). It
    // sits next to /events because the two are the same kind of thing to a
    // reader: something happening, on a date.
    ...(showExperiences
      ? [{ href: "/experiences", label: t("nav.footer.experiences") }]
      : []),
    { href: "/about", label: t("nav.footer.about") },
    // MEH-1289: reader-facing "why local" editorial page.
    { href: "/about/why-local", label: t("nav.footer.why_local") },
    // MEH-1160: reader-facing share page — the site-level viral loop.
    { href: "/share", label: t("share_page.footer_link") },
  ];
  const businessLinks = [
    // MEH-721/995: the canonical recruitment door; the wizard stays one tap
    // away via /join's single CTA.
    { href: "/join", label: t("nav.footer.add_business") },
    { href: "/about/process", label: t("nav.footer.process") },
    { href: "/about/for-businesses", label: t("nav.footer.faq_businesses") },
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
            {/* MEH-991 (NAV-18): the css-invert on logo-footer.png flattened the
                5-color petal mark to flat white. Use the purpose-built graded-cream
                dark-surface mark (logo-on-warm-dark.svg — square mark, no lockup
                asset exists) + wordmark text, per the P6 light-lockup treatment. */}
            <Link href="/" aria-label={t("nav.footer.brand_aria")} className="mb-4 inline-flex items-center gap-3">
              <Image
                src="/logo-on-warm-dark.svg"
                alt=""
                width={48}
                height={48}
                aria-hidden="true"
              />
              <span className="font-headline-md font-bold text-xl text-background">
                {BRAND_NAME}
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs mb-4 text-green-50">
              {t("nav.footer.brand_tagline")}
            </p>
            {/* MEH-2417: all four profiles as ONE row of equal icon links, in
                BRAND_SAME_AS order. Instagram used to sit alone above as icon +
                "@meha_makor" text with the other three as bare icons below — two
                styles for one job (Sapir circled it, 27/10). No visible text, so
                the sr-only label IS the accessible name and the MEH-2308 2.5.3
                mismatch cannot arise. 44×44 tap targets (MEH-2311); -ms-3 pulls
                the first glyph back in line with the tagline's start edge. */}
            <ul className="-ms-3 flex items-center">
              {[
                { href: "https://www.instagram.com/meha_makor", Icon: InstagramLogo, label: "nav.footer.instagram_aria" },
                { href: "https://www.facebook.com/mehamakor", Icon: FacebookLogo, label: "nav.footer.facebook_aria" },
                { href: "https://www.tiktok.com/@mehamakor", Icon: TiktokLogo, label: "nav.footer.tiktok_aria" },
                { href: "https://www.youtube.com/@Mehamakor", Icon: YoutubeLogo, label: "nav.footer.youtube_aria" },
              ].map(({ href, Icon, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-11 h-11 text-green-100 hover:text-white transition"
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span className="sr-only">{t(label)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 2 — Navigation. MEH-1177: split into two audience groups,
              each with its own real <h3> heading (MEH-867 hierarchy: sr-only h2
              brand → h3 sections). MEH-1278 put the two groups side-by-side on
              mobile; MEH-2397 replaces that with two stacked, closed accordion
              rows (the open 2-col grid still cost ~340px on every page and the
              footer outgrew the content on /login). Desktop (md:) is the
              original flex-col stack with both lists open. */}
          <nav
            aria-label={t("nav.footer.nav_aria")}
            className="flex flex-col divide-y divide-white/10 border-y border-white/10 md:divide-y-0 md:border-0 md:gap-6"
          >
            {[
              { id: "footer-group-discover", heading: t("nav.footer.group_discover_heading"), links: discoverLinks },
              { id: "footer-group-business", heading: t("nav.footer.group_business_heading"), links: businessLinks },
            ].map((group) => {
              const open = openGroup === group.id;
              return (
                <div key={group.id}>
                  {/* MEH-867: AA-token ink + no uppercase/tracking — Hebrew has no
                      uppercase, and letter-spacing harms RTL legibility.
                      MEH-1281: 13px + font-semibold so the group heading outweighs
                      its links. MEH-2397: the heading is a 44px accordion button on
                      mobile (Baymard: mobile footers fold link groups; the ~340px
                      of open lists was the largest block on every page). From md:
                      up (matchMedia) the heading is plain text — no button, no
                      caret, nothing in the tab order. */}
                  <h3 className="text-[13px] font-semibold text-green-100 md:mb-3">
                    {isDesktop ? (
                      group.heading
                    ) : (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={group.id}
                        onClick={() => setOpenGroup(open ? null : group.id)}
                        className="flex w-full min-h-[44px] items-center justify-between gap-2 text-start md:min-h-0"
                      >
                        {group.heading}
                        <CaretDown
                          size={16}
                          aria-hidden="true"
                          className={`shrink-0 transition-transform md:hidden ${open ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </h3>
                  <ul
                    id={group.id}
                    className={`${open ? "flex" : "hidden"} md:flex flex-col gap-3 pb-4 md:gap-2 md:pb-0`}
                  >
                    {group.links.map((link) => (
                      <li key={link.href + link.label}>
                        {/* MEH-1103: inline fontSize → utility class (13px unchanged)
                            — interactive text carries no inline font sizing. */}
                        <Link
                          href={link.href}
                          className="text-[13px] text-green-100 hover:text-white transition"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* Column 3 — Newsletter */}
          {/* MEH-1963: `id="newsletter"` is the scroll target for any "notify
              me" CTA. It sits on the column, not on the <input>, so the jump
              lands on the heading and the field together rather than on a bare
              text box. The Footer renders site-wide, so `#newsletter` resolves
              from every page — which is what lets ProducersClient link to it
              in-page instead of navigating to /about. */}
          <div id="newsletter">
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
            {/* MEH-1981: notice-at-collection (Privacy Law Amendment 13 §11) —
                purpose of the one field this form takes, with the /privacy
                link, directly under the field. `tone="on-dark"` because the
                component's default primary-green link is unreadable on
                bg-primary-dark. Copy derived from the five lines approved
                02/09 (rule 22). */}
            <CollectionNotice
              message={t("privacy.collection_notice.newsletter")}
              linkLabel={t("auth.register.consumer.terms.privacy_link")}
              testId="newsletter-collection-notice"
              tone="on-dark"
            />
            {message && (
              <p
                role="status"
                aria-live="polite"
                className={`text-sm mt-3 ${status === "success" ? "text-green-50" : "text-error-on-dark"}`}
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
          {/* MEH-2417: wraps (and centres) at 375 instead of running five links
              edge to edge under the floating back-to-top button. */}
          <ul className="flex flex-wrap items-center justify-center gap-x-4" data-testid="footer-utility-links">
            {[
              { href: "/login", label: t("nav.footer.login") },
              { href: "/terms", label: t("nav.footer.terms") },
              { href: "/privacy", label: t("nav.footer.privacy_short") },
              // MEH-867: IL IS 5568 — accessibility statement must be reachable
              // from the global footer.
              { href: "/accessibility", label: t("nav.footer.accessibility") },
              // MEH-1312: "צרו קשר" → contact-form anchor on /about (id="contact",
              // AboutClient.jsx:388). Sapir-approved ADR-024 exception (18/07) —
              // contact is a top-3 expected footer utility link.
              { href: "/about#contact", label: t("nav.footer.contact") },
            ].map((link) => (
              <li key={link.href}>
                {/* MEH-1103: 11px → 13px (DESIGN.md interactive floor is 14px
                    default-16px; 13px is the footer-utility compromise Sapir
                    locked in the sweep spec) + min-h-[44px] inline-flex so the
                    tap target meets WCAG 2.5.5 without growing the visual bar
                    (the extra hit area is vertical padding, not layout). */}
                <Link
                  href={link.href}
                  className="inline-flex items-center min-h-[44px] text-[13px] text-green-100 hover:text-white transition"
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
