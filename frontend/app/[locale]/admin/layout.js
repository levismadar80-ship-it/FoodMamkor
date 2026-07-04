"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// MEH-731: locale-stripping usePathname so isActive() matches the
// non-prefixed NAV_HREFS ("/admin", …) under next-intl [locale] routing.
// next/navigation's usePathname keeps the "/he" / "/en" prefix, so no
// sidebar tab ever highlighted. useRouter stays on next/navigation —
// only the path-comparison was buggy (router.push redirect unchanged).
import { usePathname } from "@/i18n/navigation";
import Link from "next/link";
import {
  Gauge,
  Storefront,
  Users,
  Note,
  Warning,
  ChartLineUp,
  GearSix,
  Sparkle,
  Star,
  Lifebuoy,
  Megaphone,
  Seal,
  Tag,
  ChatCircleSlash,
  Bread,
  Package,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

/**
 * Admin layout (docs/archive/ALL_PAGES_DESIGN.md עמוד 6).
 *
 * Dark-green sidebar + cream content area. The dark sidebar is
 * intentionally the only dark chrome in the entire site — it signals
 * "backoffice" and helps admins feel they're in a different mode
 * without changing the consumer aesthetic.
 */

// MEH-1016: the flat 15-item nav grew past the 5–7 top-level limit and read
// as an undifferentiated wall. Group it into 5 labeled sections (Shopify
// Admin pattern). Labels come from admin.layout.nav_sections.*. hrefs, keys,
// icons, badge wiring, and isActive() are all unchanged — this is markup +
// i18n only. The desktop sidebar renders the labels; the mobile horizontal
// nav reuses the flattened NAV_HREFS (derived below), so it now follows the
// same section order as the sidebar. That reorder is deliberate and benign —
// it's a horizontal scroll with no fixed tab-order dependency, and keeping a
// single source of truth (NAV_SECTIONS) avoids two nav lists drifting apart.
// Same items, hrefs, badges, and active state as before.
const NAV_SECTIONS = [
  {
    key: "overview",
    items: [
      { href: "/admin", key: "dashboard", Icon: Gauge },
      { href: "/admin/analytics", key: "analytics", Icon: ChartLineUp },
    ],
  },
  {
    key: "core",
    items: [
      { href: "/admin/producers", key: "producers", Icon: Storefront },
      { href: "/admin/outreach", key: "outreach", Icon: Megaphone },
      { href: "/admin/users", key: "users", Icon: Users },
      // MEH-1021: group-buys page existed but was orphaned (reachable only
      // via a dashboard stat card). Surface it in the sidebar.
      { href: "/admin/group-buys", key: "group_buys", Icon: Package },
    ],
  },
  {
    key: "content",
    items: [
      { href: "/admin/experiences", key: "experiences", Icon: Sparkle },
      // MEH-997: recipes moderation queue — the admin UI chunk the recipes
      // epic (MEH-587→591) shipped without.
      { href: "/admin/recipes", key: "recipes", Icon: Bread },
      { href: "/admin/content", key: "content", Icon: Note },
      { href: "/admin/reviews", key: "reviews", Icon: Star },
    ],
  },
  {
    key: "queues",
    items: [
      { href: "/admin/kashrut", key: "kashrut", Icon: Seal },
      { href: "/admin/reports", key: "reports", Icon: Warning },
      { href: "/admin/category-requests", key: "category_requests", Icon: Tag },
      // MEH-771 Chunk C — admin view of undelivered outbound WhatsApp.
      { href: "/admin/whatsapp-failures", key: "whatsapp_failures", Icon: ChatCircleSlash },
    ],
  },
  {
    key: "system",
    items: [
      { href: "/admin/settings", key: "settings", Icon: GearSix },
      { href: "/admin/help", key: "help", Icon: Lifebuoy },
    ],
  },
];

// Flattened list for the mobile horizontal nav (order follows the sections).
const NAV_HREFS = NAV_SECTIONS.flatMap((s) => s.items);

export default function AdminLayout({ children }) {
  const t = useTranslations("admin");
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // feature/producer-analytics: pending moderation badge on the sidebar —
  // sums pending producers + open reports + flagged home products +
  // pending experiences + pending recipes (MEH-997) + pending kashrut.
  // Fetched from /admin/dashboard, which the admin
  // home page already calls — but we call it here too so the badge shows
  // on every /admin/* subpath. Cheap: the endpoint is fast.
  const [pendingModCount, setPendingModCount] = useState(null);
  const [pendingKashrutCount, setPendingKashrutCount] = useState(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api
      .get("/admin/dashboard")
      .then((r) => {
        setPendingModCount(r.data?.stats?.pending_moderation_count ?? 0);
        setPendingKashrutCount(r.data?.stats?.pending_kashrut_requests ?? 0);
      })
      .catch(() => { setPendingModCount(null); setPendingKashrutCount(null); });
  }, [user, pathname]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-fg-muted">
        {t("common.loading_f")}
      </div>
    );
  }

  const isActive = (href) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Dark-green sidebar — RTL, so it's on the right */}
      <aside className="hidden md:flex fixed top-16 start-0 bottom-0 w-60 bg-primary-dark text-green-50 flex-col z-40">
        <div className="px-5 py-6 border-b border-white/10">
          <p className="font-headline-md text-xl text-white">{t("common.brand_admin")}</p>
          <p className="text-green-50/60 text-xs mt-1">{user.name}</p>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-1 pt-4 first:pt-0">
              <p className="text-xs text-white/50 px-3 pb-1">
                {t(`layout.nav_sections.${section.key}`)}
              </p>
              {section.items.map((n) => {
                const active = isActive(n.href);
                const Icon = n.Icon;
                const showBadge =
                  (n.href === "/admin" && pendingModCount > 0) ||
                  (n.href === "/admin/kashrut" && pendingKashrutCount > 0);
                const badgeCount = n.href === "/admin/kashrut" ? pendingKashrutCount : pendingModCount;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-sm transition ${
                      active
                        ? "bg-primary text-white"
                        : "text-green-50/70 hover:bg-white/5 hover:text-white"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={18} weight={active ? "fill" : "regular"} />
                    <span className="flex-1">{t(`layout.nav.${n.key}`)}</span>
                    {showBadge && (
                      <span
                        className="bg-yellow-400 text-yellow-900 text-[11px] font-bold px-2 py-0.5 rounded-full leading-none"
                        aria-label={t("common.items_pending_label", { count: badgeCount })}
                        title={t("common.items_pending_title", { count: badgeCount })}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-green-50/50">
          <Link href="/" className="hover:text-white transition">
            {t("common.back_home")}
          </Link>
        </div>
      </aside>

      {/* Mobile: horizontal scrollable nav */}
      <div className="md:hidden w-full bg-primary-dark sticky top-16 z-40 overflow-x-auto">
        <nav className="flex gap-1 px-3 py-2 whitespace-nowrap">
          {NAV_HREFS.map((n) => {
            const active = isActive(n.href);
            const Icon = n.Icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs transition ${
                  active ? "bg-primary text-white" : "text-green-50/70"
                }`}
              >
                <Icon size={14} />
                {t(`layout.nav.${n.key}`)}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content — offset by sidebar width on desktop */}
      <main className="flex-1 md:ms-60 min-w-0 p-5 md:p-8">
        {children}
      </main>
    </div>
  );
}
