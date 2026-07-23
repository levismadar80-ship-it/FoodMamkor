"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";

/**
 * Module:   BusinessCtaLink
 * Purpose:  Auth-state-aware wrapper for the "become a business" CTA repeated
 *           across marketing surfaces (/join, /about/for-businesses, /about/
 *           process, home). A logged-in producer sees a "my dashboard" link; an
 *           admin sees nothing; everyone else (guest / consumer / while auth
 *           resolves) sees the original join CTA passed via props/children.
 * Does NOT: own styling (className comes from the call site) or enforce the
 *           rule — the auth.py guards stay the authority. This only stops
 *           producers/admins from entering a wizard that 409s/403s at submit.
 * Related:  components/BottomNav.jsx:131-133 (same role gate, MEH-669);
 *           app/[locale]/register/producer/RegisterProducerClient.jsx (the
 *           early gate this CTA routes around).
 * History:  MEH-1489 (creation — chunk B, swapped in at 5 call sites).
 *
 * SSR note: the server-component call sites (/join, /about/for-businesses)
 * render this as a client island whose SSR/first-paint output is the guest
 * variant — a logged-in producer sees a brief flash of the join CTA before
 * hydration swaps it for the dashboard link. Accepted trade-off: the pages
 * stay server components and the backend guard is the real stop.
 */
export default function BusinessCtaLink({ href, className, children, ...rest }) {
  const { user, loading } = useAuth();
  const t = useTranslations("account.menu");

  // Admin: no business CTA at all — admins register from a separate account.
  if (!loading && user?.role === "admin") return null;

  // Producer: already owns a page — swap the join CTA for a dashboard link
  // (reuses the account-menu dashboard label; single owner, no new key).
  if (!loading && user?.role === "producer") {
    return (
      <Link href="/producer/dashboard" className={className}>
        {t("dashboard")}
      </Link>
    );
  }

  // Guest / consumer / while auth resolves: the original join CTA. `rest`
  // carries call-site attributes (e.g. data-testid="join-cta" on the guest
  // variant only) so producer/admin variants don't inherit them.
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
