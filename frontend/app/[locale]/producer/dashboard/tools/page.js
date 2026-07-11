"use client";

/**
 * Module:   producer/dashboard/tools/page
 * Purpose:  כלים tab of the producer dashboard hub (MEH-964 Phase 1, chunk
 *           1A). Launcher for the producer tool routes relocated VERBATIM off
 *           the Overview quick-links grid: settings, add event, view business,
 *           group buys, recipes.
 * Touches:  GET /producers/me/dashboard (read — for producer.id used by the
 *           "view my business" link).
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
 *           Phosphor icons + action-noun titles).
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarPlus, Storefront, UsersThree, CookingPot } from "@phosphor-icons/react";
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
        <Link
          href="/producer/dashboard/events/new"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <CalendarPlus size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.add_event.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.add_event.sub")}</p>
        </Link>
        <Link
          href={`/producer/${producer.id}`}
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <Storefront size={24} className="text-primary mb-2" aria-hidden="true" />
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.view_business.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.view_business.sub")}</p>
        </Link>
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
      </div>
    </div>
  );
}
