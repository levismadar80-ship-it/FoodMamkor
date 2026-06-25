"use client";

/**
 * Module:   producer/dashboard/layout
 * Purpose:  Shared shell for the producer dashboard hub (MEH-964 Phase 1,
 *           chunk 1A). Hosts the ONE UX auth gate for the whole
 *           /producer/dashboard/* subtree + the persistent tab nav
 *           (סקירה / עריכה / כלים). Partial rendering keeps the tab bar
 *           mounted across tab switches.
 * Touches:  no API/DB — reads auth state from useAuth() context only.
 * Does NOT: own real auth enforcement — that stays on the API
 *           (require_producer). This gate is UX-level only; child pages keep
 *           their own role guards until Phase 2. Does not render any
 *           dashboard content — that is each tab's page.js.
 * Related:  app/[locale]/producer/dashboard/page.js (סקירה index);
 *           app/[locale]/producer/dashboard/edit/page.js (עריכה);
 *           app/[locale]/producer/dashboard/tools/page.js (כלים).
 *           תובנות tab is added in chunk 1B alongside insights/.
 * History:  MEH-964 (creation, chunk 1A).
 *
 * RTL: logical properties only (.claude/rules/rtl.md). Phosphor glyphs only.
 */

import { useEffect } from "react";
import { usePathname, Link } from "@/i18n/navigation";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SquaresFour, PencilSimple, Wrench } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";

// Tab order is the source of truth for the persistent nav. `exact` marks the
// index route so /producer/dashboard doesn't light up every child tab.
// תובנות (insights) joins this list in chunk 1B when its route exists — kept
// out now so the nav has no dead/"בקרוב" entry (MEH-961/963 single-source).
const TABS = [
  { key: "overview", href: "/producer/dashboard", Icon: SquaresFour, exact: true },
  { key: "edit", href: "/producer/dashboard/edit", Icon: PencilSimple },
  { key: "tools", href: "/producer/dashboard/tools", Icon: Wrench },
];

export default function ProducerDashboardLayout({ children }) {
  const t = useTranslations("dashboard.producer.nav");
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  // The single UX gate for the whole dashboard subtree. Real auth is enforced
  // server-side (require_producer); this only keeps non-producers off the UI.
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  const isActive = (tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

  return (
    <div>
      <nav
        aria-label={t("aria")}
        className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border"
      >
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus-ring ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-fg-muted hover:text-text"
                }`}
              >
                <tab.Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" />
                {t(tab.key)}
              </Link>
            );
          })}
        </div>
      </nav>
      {children}
    </div>
  );
}
