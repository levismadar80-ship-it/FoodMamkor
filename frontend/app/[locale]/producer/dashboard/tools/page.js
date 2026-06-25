"use client";

/**
 * Module:   tools (producer dashboard — כלים spoke)
 * Purpose:  Quick-links hub — settings, add event, view public business,
 *           group buys, recipes, and followers.
 * Touches:  GET /producers/me/dashboard (producer.id for the view-public link).
 * Does NOT: own followers as a top-level tab — it is a link here (MEH-964).
 * Related:  page.js (Overview), followers/page.js, group-buys/page.js,
 *           recipes/page.js, events/new/page.js.
 * History:  MEH-964 (Phase 1, chunk 1A — relocated verbatim from page.js).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ProducerToolsPage() {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user || user.role !== "producer") return null;

  const producer = data?.producer;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="font-headline-lg text-3xl font-bold text-text mb-6">
        {t("nav.tabs.tools")}
      </h1>

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/settings"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.settings.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.settings.sub")}</p>
        </Link>
        <Link
          href="/producer/dashboard/events/new"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.add_event.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.add_event.sub")}</p>
        </Link>
        {producer && (
          <Link
            href={`/producer/${producer.id}`}
            className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
          >
            <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.view_business.title")}</p>
            <p className="text-sm text-fg-muted">{t("quick_links.view_business.sub")}</p>
          </Link>
        )}
        <Link
          href="/producer/dashboard/group-buys"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.group_buys.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.group_buys.sub")}</p>
        </Link>
        {/* MEH-590: producer recipes tab (chunk 3/4 of the producer-recipes epic). */}
        <Link
          href="/producer/dashboard/recipes"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.recipes.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.recipes.sub")}</p>
        </Link>
        {/* MEH-964 1A: followers reachable here (a link, not a top-level tab). */}
        <Link
          href="/producer/dashboard/followers"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline-md text-lg font-bold mb-1">{t("quick_links.followers.title")}</p>
          <p className="text-sm text-fg-muted">{t("quick_links.followers.sub")}</p>
        </Link>
      </div>
    </div>
  );
}
