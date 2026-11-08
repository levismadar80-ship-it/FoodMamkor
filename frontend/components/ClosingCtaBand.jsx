/**
 * Module:   ClosingCtaBand
 * Purpose:  The one full-green band that ends every page closing on a business
 *           call to action: inverted mark, cream heading, a line or three, the
 *           cream join button, an optional meta line and an optional
 *           «שאלה לפני? כתבו לנו». Same look on every page, built once.
 * Does NOT: decide who sees which button — BusinessCtaLink does (guest/consumer
 *           → the page's join label, producer → «לוח הבקרה שלי», admin → none).
 *           Does not own any page's copy: every string except the contact pair
 *           arrives as a prop, so each page keeps its words verbatim.
 *           Does not hide a sticky bar — /join's JoinStickyBar watches the
 *           `data-join-closing` attribute /join passes through `...rest`.
 * Related:  app/[locale]/join/page.js (the original, MEH-2799 SPEC §1.8) ·
 *           app/[locale]/home/HomeStaticBlocks.jsx HomeCTA ·
 *           app/[locale]/about/process/AboutProcessClient.jsx (07 — CTA) ·
 *           app/globals.css `body:has([data-meets-footer])` (MEH-2487: the
 *           footer drops its top margin so the green runs straight into it).
 * History:  MEH-2824 (extracted from /join, markup unchanged there).
 *
 * No "use client": it renders from /join's server page and from client
 * components alike. useTranslations works in both; the `join` namespace ships
 * to the client (lib/client-messages.js omits only route-scoped/server-only).
 */
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BusinessCtaLink from "@/components/BusinessCtaLink";

const LOGO_MARK_PX = 56;

const CTA_CLASS =
  "inline-flex items-center gap-2 min-h-[52px] px-8 py-3.5 bg-background text-primary rounded-lg font-semibold text-base hover:bg-background-alt transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark focus-visible:ring-offset-2 focus-visible:ring-offset-primary";

const BODY_CLASS = "text-base leading-relaxed text-background/90 max-w-[46ch] mx-auto";

// «שאלה לפני? כתבו לנו» → /contact. Its own component so the hook only runs
// where the line is shown.
function ContactLine() {
  const tJoin = useTranslations("join");
  return (
    <p className="mt-4 text-sm text-background">
      {tJoin("closing.question")}{" "}
      <Link
        href="/contact"
        className="underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-on-dark"
      >
        {tJoin("draft.cta")}
      </Link>
    </p>
  );
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string | string[]} props.body  one line, or several (one <p> each)
 * @param {string} props.ctaHref
 * @param {string} props.ctaLabel  the guest/consumer label
 * @param {string} [props.meta]  small line under the button
 * @param {boolean} [props.contact]  adds «שאלה לפני? כתבו לנו» → /contact
 * @param {string} [props.ctaTestId]  data-testid on the guest button
 * @param {string} [props.className]  extra classes on the <section> (e.g. scroll-mt-24)
 * Any other prop (data-testid, id, data-*) lands on the <section>.
 */
export default function ClosingCtaBand({
  title,
  body,
  ctaHref,
  ctaLabel,
  meta,
  contact = false,
  ctaTestId,
  className = "",
  ...rest
}) {
  const lines = Array.isArray(body) ? body : [body];
  return (
    <section
      data-meets-footer
      className={`bg-primary text-background py-14 md:py-20 ${className}`.trim()}
      {...rest}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <Image
          src="/logo-inverted.svg"
          alt=""
          aria-hidden="true"
          width={LOGO_MARK_PX}
          height={LOGO_MARK_PX}
          unoptimized
          className="mx-auto mb-5"
        />
        <h2 className="font-headline-lg font-black text-background text-[clamp(28px,6vw,44px)] leading-tight text-balance">
          {title}
        </h2>
        {lines.map((line, i) => (
          <p key={line} className={`${i === 0 ? "mt-3.5" : "mt-1.5"} ${BODY_CLASS}`}>
            {line}
          </p>
        ))}
        <div className="mt-7">
          <BusinessCtaLink href={ctaHref} data-testid={ctaTestId} className={CTA_CLASS}>
            {ctaLabel}
          </BusinessCtaLink>
        </div>
        {meta && <p className="mt-3 text-sm text-background/90">{meta}</p>}
        {contact && <ContactLine />}
      </div>
    </section>
  );
}
