"use client";

/**
 * Module:   layout (producer dashboard shell)
 * Purpose:  Persistent hub-and-spoke tab bar + a single shell-level auth gate
 *           wrapping the Overview index and its nested spoke routes.
 * Touches:  useAuth (role gate) — no network here.
 * Does NOT: fetch dashboard/analytics data — each page owns its own fetch
 *           (per-segment fetch dedup deferred to Phase 2, MEH-964).
 * Related:  page.js (Overview), edit/page.js, insights/page.js, tools/page.js.
 * History:  MEH-964 (Phase 1, chunk 1A — nested-route shell).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth-context";

// Hub tabs. עריכה/תובנות/כלים are nested route pages that relocate existing
// surfaces verbatim (MEH-964 relocate-don't-rewrite). Followers live under
// the כלים page as a link, not as a top-level tab.
const TABS = [
  { key: "overview", href: "/producer/dashboard" },
  { key: "edit", href: "/producer/dashboard/edit" },
  { key: "insights", href: "/producer/dashboard/insights" },
  { key: "tools", href: "/producer/dashboard/tools" },
];

export default function ProducerDashboardLayout({ children }) {
  const t = useTranslations("dashboard.producer.nav");
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  // ONE shell-level auth gate. Sub-pages keep their own redundant gate
  // (relocated verbatim; dedup deferred — MEH-964 Phase 2).
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") router.push("/login");
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  const isActive = (href) =>
    href === "/producer/dashboard"
      ? pathname === "/producer/dashboard"
      : pathname.startsWith(href);

  return (
    <div>
      <nav
        aria-label={t("aria_label")}
        className="border-b border-border bg-white/80 backdrop-blur sticky top-0 z-10"
      >
        <div className="max-w-5xl mx-auto px-4">
          <ul className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const active = isActive(tab.href);
              return (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-block px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                      active
                        ? "border-primary text-primary"
                        : "border-transparent text-fg-muted hover:text-text"
                    }`}
                  >
                    {t(`tabs.${tab.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      {children}
    </div>
  );
}
