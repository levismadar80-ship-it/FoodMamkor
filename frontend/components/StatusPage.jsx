"use client";

import { Link } from "@/i18n/navigation";

/**
 * Module:   StatusPage
 * Purpose:  The one layout for "something happened / did not work" pages:
 *           404, an invalid or used claim link, email verification, newsletter
 *           unsubscribe. Before MEH-2567 each had its own icon, card and
 *           alignment (a red X in a white card, a left-aligned title with no
 *           icon, a filled leaf in a card, a bare line leaf). Same rule as
 *           GOV.UK / Shopify Polaris: one status template, the copy varies.
 *
 * Anatomy (the 404's, which was the calmest of the four): line icon in brand
 *           green → optional eyebrow → h1 → one body line → primary action →
 *           optional secondary action. No card: it is a whole page, not a
 *           panel on one.
 *
 * Does NOT: carry copy. Every string arrives from the caller's namespace.
 *
 * Actions:  `primary` / `secondary` = { label, href } for a link, or
 *           { label, onClick } for a button (retry). `testid` passes through.
 *           `children` renders between the body and the actions.
 */
const PRIMARY =
  "min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";
const SECONDARY =
  "min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center border border-primary text-primary px-6 py-3 rounded-full hover:bg-green-50 transition font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";

function Action({ action, className }) {
  if (!action) return null;
  if (action.href) {
    return (
      <Link href={action.href} data-testid={action.testid} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} data-testid={action.testid} className={className}>
      {action.label}
    </button>
  );
}

export default function StatusPage({
  icon: Icon,
  eyebrow,
  title,
  body,
  bodyRole,
  primary,
  secondary,
  children,
  testid,
}) {
  return (
    // A <div>, not <main>: every caller already sits inside #main-content.
    <div
      className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16"
      data-testid={testid}
    >
      <div className="text-center max-w-md w-full" data-testid="status-page">
        {Icon && <Icon size={64} className="mx-auto mb-5 text-primary" aria-hidden="true" />}
        {eyebrow && <p className="text-primary font-medium text-sm tracking-widest mb-2">{eyebrow}</p>}
        {title && <h1 className="font-headline-lg text-3xl sm:text-4xl font-bold text-text mb-3">{title}</h1>}
        {body && (
          <p className="text-fg-muted text-lg leading-relaxed" role={bodyRole}>
            {body}
          </p>
        )}
        {children}
        {(primary || secondary) && (
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Action action={primary} className={PRIMARY} />
            <Action action={secondary} className={SECONDARY} />
          </div>
        )}
      </div>
    </div>
  );
}
