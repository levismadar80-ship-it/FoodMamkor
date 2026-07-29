"use client";

/**
 * Module:   producer/dashboard/tools/page
 * Purpose:  כלים tab of the producer dashboard hub (MEH-964 Phase 1, chunk
 *           1A). Launcher for the producer creation/manage tool routes:
 *           manage events / experiences / group buys / recipes + the reviews
 *           deep link.
 * Touches:  GET /producers/me/dashboard (read — for producer.id used by the
 *           reviews deep link).
 * Does NOT: build any tool internals — each link points at its existing,
 *           already-shipped route. The grid markup below is byte-identical to
 *           its prior definition in producer/dashboard/page.js.
 * Related:  app/[locale]/producer/dashboard/layout.js (tab nav + UX gate);
 *           events/new/page.js, group-buys/page.js, recipes/page.js,
 *           settings/page.jsx (link targets).
 * History:  MEH-964 (relocation, chunk 1A); MEH-1102 (removed the עריכת
 *           פרופיל card — after MEH-1095 it pointed at /producer/dashboard/
 *           edit, a straight duplicate of the עריכה nav tab; /settings stays
 *           reachable via AccountSheet + ProfileCompletenessCard; added
 *           Phosphor icons + action-noun titles); MEH-1357 (removed the
 *           הצגת-העסק card — duplicate of the persistent "צפייה בדף" link now
 *           in the dashboard shell nav; reviews card marked candidate-to-move).
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { Link, useRouter } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarPlus, UsersThree, CookingPot, Star, Sparkle } from "@phosphor-icons/react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ProducerDashboardToolsPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api.get("/producers/me/dashboard").then((r) => setData(r.data)).catch(() => setData(null));
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading_data")}
      </div>
    );
  }

  const { producer } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Quick links. MEH-1102: the עריכת פרופיל card was removed — after
          MEH-1095 it targeted /producer/dashboard/edit, duplicating the
          עריכה nav tab one row above. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MEH-1405: card now opens the manage list (create is reachable there). */}
        <Link
          href="/producer/dashboard/events"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <CalendarPlus size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.manage_events.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.manage_events.sub")}</p>
        </Link>
        {/* MEH-1405: manage own experiences (list + edit + delete). */}
        <Link
          href="/producer/dashboard/experiences"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <Sparkle size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.manage_experiences.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.manage_experiences.sub")}</p>
        </Link>
        {/* MEH-1357: the "הצגת העסק באתר" card was removed here — it duplicated
            the persistent "צפייה בדף" link now in the dashboard shell nav
            (layout.js). Verdict Sapir 18/07 (MEH-999 dogfood). */}
        <Link
          href="/producer/dashboard/group-buys"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <UsersThree size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.group_buys.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.group_buys.sub")}</p>
        </Link>
        {/* MEH-590: producer recipes tab (chunk 3/4 of the producer-recipes epic). */}
        <Link
          href="/producer/dashboard/recipes"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <CookingPot size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.recipes.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.recipes.sub")}</p>
        </Link>
        {/* MEH-1165 item 2: direct route to the public-page reviews section
            (id="reviews", ProducerSections.jsx:320) — the reply UI lives there
            and previously took 3+ taps via "הצגת העסק" + scroll.
            MEH-1357: candidate-to-move per Sapir's 18/07 verdict — documented
            only, no change now (full object-nav split is MEH-964 Phase 2). */}
        <Link
          href={`/producer/${producer.id}#reviews`}
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <Star size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.reviews.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.reviews.sub")}</p>
        </Link>
      </div>
    </div>
  );
}
