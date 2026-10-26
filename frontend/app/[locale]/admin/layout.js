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
  CaretDown,
  Gauge,
  Storefront,
  Users,
  Note,
  ChartLineUp,
  GearSix,
  Star,
  Megaphone,
  Lock,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import EmptyState from "@/components/ui/EmptyState";
import api from "@/lib/api";
import AdminDesktopOnlyNotice from "./AdminDesktopOnlyNotice";
import { QUEUES, queueCount, visibleQueues } from "./queues";

/**
 * Admin layout (docs/archive/ALL_PAGES_DESIGN.md עמוד 6).
 *
 * Dark-green sidebar + cream content area. The dark sidebar is
 * intentionally the only dark chrome in the entire site — it signals
 * "backoffice" and helps admins feel they're in a different mode
 * without changing the consumer aesthetic.
 */

// MEH-1016 grouped the flat 15-item nav into 5 labeled sections. MEH-2359
// (Sapir, 26/10: "the admin's job before launch is approving businesses;
// everything else is a burden") cuts it to what the job needs:
//
//   approvals — always: the home («מה מחכה לטיפול») and the businesses table,
//               both carrying the pending-approval count.
//   queues    — the secondary moderation queues (admin/queues.js, ONE source
//               shared with the home page). A queue is listed only while it
//               has items; reports stay at 0 (safety signal, MEH-217 card).
//   more      — management screens with no queue semantics, collapsed by
//               default (Shopify-admin pattern: a collapsible secondary group).
//
// Dropped from the nav, NOT deleted: /admin/group-buys (0 group buys in
// production, the card's own tooltip said «לא פעיל כרגע»), /admin/help (now a
// footer link under «חזרה לאתר»). Every route still answers by URL.
const NAV_SECTIONS = [
  {
    key: "approvals",
    items: [
      { href: "/admin", key: "dashboard", Icon: Gauge, stat: "pending_producers" },
      { href: "/admin/producers", key: "producers", Icon: Storefront, stat: "pending_producers" },
    ],
  },
  { key: "queues", items: QUEUES },
  {
    key: "more",
    collapsible: true,
    items: [
      { href: "/admin/users", key: "users", Icon: Users },
      { href: "/admin/content", key: "content", Icon: Note },
      { href: "/admin/outreach", key: "outreach", Icon: Megaphone },
      { href: "/admin/reviews", key: "reviews", Icon: Star },
      { href: "/admin/analytics", key: "analytics", Icon: ChartLineUp },
      { href: "/admin/settings", key: "settings", Icon: GearSix },
    ],
  },
];

/**
 * MEH-2070 (A-narrow) — the admin screens that are RESPONSIVE, i.e. the ones a
 * phone is expected to complete work on. Everything else under /admin renders
 * the desktop-only banner above its existing content.
 *
 * Only the approvals queue is listed, and that is the decision rather than an
 * accident of effort: manual approval is a LOCK with no automatic fallback, so
 * a solo operator has to be able to clear it from a phone. Moderation,
 * settings and outreach are not urgent-on-the-move.
 *
 * Prefix match, so /admin/producers/<id>/edit — the single-business screen the
 * approve/reject decision is actually made on — is included. `/admin` itself
 * was NOT, while it was a desktop overview of stat cards and charts; since
 * MEH-2359 it is the approvals landing («מה מחכה לטיפול»: the pending list +
 * the busy queues, one column), so it is mobile-ready by the same reasoning —
 * EXACT match only, or every /admin/* would inherit it.
 */
const MOBILE_READY_PREFIXES = ["/admin/producers"];
const MOBILE_READY_EXACT = ["/admin"];

export function isMobileReadyAdminPath(pathname) {
  return (
    MOBILE_READY_EXACT.includes(pathname) ||
    MOBILE_READY_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
  );
}

export default function AdminLayout({ children }) {
  const t = useTranslations("admin");
  const tDenied = useTranslations("errors.access_denied.admin");
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Per-queue counts for the sidebar badges + the queue filter, from
  // /admin/dashboard (the home page calls it too; the endpoint is fast and
  // the badge has to show on every /admin/* subpath). MEH-2359: the whole
  // `stats` object is kept — one number per queue (admin/queues.js), not the
  // old aggregate that summed six queues (incl. home_products, MEH-796) into
  // a single badge that said nothing about WHERE to go.
  const [stats, setStats] = useState(null);
  // MEH-2096: whether the counts are unknown (fetch failed) rather than zero.
  const [countsError, setCountsError] = useState(false);

  // MEH-1599: same 401/403 split as producer/dashboard/layout.js:53 — an
  // authenticated non-admin gets the in-app denied state below, NOT a bounce
  // through /login to "/" (LoginClient.jsx:89-91 replace()s an authenticated
  // visitor straight past the form). Only a genuinely unauthenticated visitor
  // is redirected, and now with ?redirect= so she returns to her target.
  // `router` is next/navigation by MEH-731's explicit choice; `pathname` is
  // the locale-stripped one, which is exactly what ?redirect= wants.
  const isUnauthenticated = !loading && !user;
  const isDenied = !loading && !!user && user.role !== "admin";

  useEffect(() => {
    if (!isUnauthenticated) return;
    router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api
      .get("/admin/dashboard")
      .then((r) => {
        setStats(r.data?.stats ?? null);
        setCountsError(false);
      })
      .catch(() => {
        // MEH-2096: nulling the counts hid the badge, which is the SAME render
        // as a genuine zero — so a dead dashboard endpoint told the admin the
        // approval queue was clear. The counts stay null (no fabricated number)
        // and `countsError` carries the distinction to the badge instead; the
        // queue filter shows EVERY queue while counts are unknown (queues.js).
        setStats(null);
        setCountsError(true);
      });
  }, [user, pathname]);

  // 403 — rendered in place. The two admin pages that repeat this guard
  // (producers/new/page.js:16, producers/[id]/edit/page.js:20) never mount,
  // so exactly ONE denied state can render.
  if (isDenied) {
    return (
      <div data-testid="access-denied" className="max-w-7xl mx-auto px-4">
        <EmptyState
          icon={Lock}
          title={tDenied("heading")}
          description={tDenied("message")}
          ctaLabel={tDenied("home")}
          ctaHref="/"
        />
      </div>
    );
  }

  if (loading || !user) {
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

  // MEH-1701: ONE owner for the badge decision, consumed by BOTH navs (desktop
  // sidebar + mobile strip). MEH-2096: a failed fetch returns the UNKNOWN
  // sentinel on the approvals items so the badge says "I don't know" instead of
  // "zero" on the one queue with no automatic fallback. A real 0 renders no
  // badge. MEH-2359: every item declares its own `stat` key; queues carry the
  // count that decides whether they are listed at all.
  const COUNT_UNKNOWN = "!";
  const badgeCountFor = (item) => {
    if (!item.stat) return null;
    if (countsError) return item.stat === "pending_producers" ? COUNT_UNKNOWN : null;
    const n = queueCount(stats, item);
    return n !== null && n > 0 ? n : null;
  };
  const itemsOf = (section) =>
    section.key === "queues" ? visibleQueues(stats, countsError) : section.items;
  // Flattened list for the mobile horizontal strip (order follows the sections).
  const navHrefs = NAV_SECTIONS.flatMap(itemsOf);

  const badgeProps = (badgeCount) => ({
    "aria-label":
      badgeCount === COUNT_UNKNOWN
        ? t("common.error_loading")
        : t("common.items_pending_label", { count: badgeCount }),
    title:
      badgeCount === COUNT_UNKNOWN
        ? t("common.error_loading")
        : t("common.items_pending_title", { count: badgeCount }),
  });

  const renderSidebarItem = (n) => {
    const active = isActive(n.href);
    const Icon = n.Icon;
    const badgeCount = badgeCountFor(n);
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
        {badgeCount !== null && (
          <span
            className="bg-yellow-400 text-yellow-900 text-[11px] font-bold px-2 py-0.5 rounded-full leading-none"
            {...badgeProps(badgeCount)}
          >
            {badgeCount}
          </span>
        )}
      </Link>
    );
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
          {NAV_SECTIONS.map((section) => {
            const items = itemsOf(section);
            const label = (
              <p className="text-xs text-white/50 px-3 pb-1">
                {t(`layout.nav_sections.${section.key}`)}
              </p>
            );
            // «עוד» — collapsed by default; the items stay in the DOM (a
            // <details> keeps its children mounted), so deep links and the
            // MEH-217 nav-presence spec are unaffected. It opens itself when
            // the current page is one of its items (a deep link into
            // /admin/settings must show where you are); otherwise the
            // open/closed state is per page load, deliberately: nothing to
            // persist.
            if (section.collapsible) {
              const containsActive = items.some((i) => isActive(i.href));
              return (
                <details
                  key={section.key}
                  className="pt-4 group"
                  data-testid={`admin-nav-${section.key}`}
                  open={containsActive || undefined}
                >
                  <summary className="flex items-center gap-1 text-xs text-white/50 px-3 pb-1 cursor-pointer list-none select-none hover:text-white/80">
                    <span>{t(`layout.nav_sections.${section.key}`)}</span>
                    <CaretDown size={12} className="transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="space-y-1">{items.map(renderSidebarItem)}</div>
                </details>
              );
            }
            return (
              <div key={section.key} className="space-y-1 pt-4 first:pt-0">
                {label}
                {items.map(renderSidebarItem)}
              </div>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-green-50/50 flex items-center justify-between gap-3">
          <Link href="/" className="hover:text-white transition">
            {t("common.back_home")}
          </Link>
          <Link href="/admin/help" className="hover:text-white transition">
            {t("layout.nav.help")}
          </Link>
        </div>
      </aside>

      {/* Mobile: horizontal scrollable nav */}
      <div className="md:hidden w-full bg-primary-dark sticky top-16 z-40 overflow-x-auto">
        <nav className="flex gap-1 px-3 py-2 whitespace-nowrap">
          {navHrefs.map((n) => {
            const active = isActive(n.href);
            const Icon = n.Icon;
            // MEH-1701: the same badge the desktop sidebar shows — an admin
            // on a phone could not see anywhere in the nav that a queue is
            // waiting. Same decision source (badgeCountFor), smaller pill.
            const badgeCount = badgeCountFor(n);
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
                {badgeCount !== null && (
                  <span
                    className="bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                    {...badgeProps(badgeCount)}
                  >
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content — offset by sidebar width on desktop */}
      <main className="flex-1 md:ms-60 min-w-0 p-5 md:p-8">
        {!isMobileReadyAdminPath(pathname) && <AdminDesktopOnlyNotice />}
        {children}
      </main>
    </div>
  );
}
