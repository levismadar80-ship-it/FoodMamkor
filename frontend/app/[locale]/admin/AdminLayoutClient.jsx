"use client";

import { useEffect, useRef } from "react";
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
  Question,
  Storefront,
  Users,
  Note,
  ChartLineUp,
  GearSix,
  Star,
  Megaphone,
  Lock,
  SignOut,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import EmptyState from "@/components/ui/EmptyState";
import { AdminDashboardProvider, useAdminDashboard } from "./dashboard-data";
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
// production, the card's own tooltip said «לא פעיל כרגע»). /admin/help is the
// last item of «עוד» — one place, so the phone strip (which flattens the
// sections) reaches it too. Every route still answers by URL.
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
      { href: "/admin/help", key: "help", Icon: Question },
    ],
  },
];

// MEH-2070 (A-narrow) once marked every /admin screen except the approvals
// queue as desktop-only, with a banner («המסך הזה זמין במחשב»). MEH-2426
// removed both: every admin table is now one card per row below md
// (globals.css .table-stack) and every /admin screen was measured at 375 with
// no control off-screen, so the banner had become untrue — and it was the
// first thing an admin saw above a queue she could not operate.

// MEH-2399: the provider sits above the shell so the shell (badges) and the
// page (home) both read its one fetch. It fetches only for an admin.
export default function AdminLayout({ children }) {
  const { user } = useAuth();
  const pathname = usePathname();
  return (
    <AdminDashboardProvider enabled={user?.role === "admin"} refreshKey={pathname}>
      <AdminShell>{children}</AdminShell>
    </AdminDashboardProvider>
  );
}

function AdminShell({ children }) {
  const t = useTranslations("admin");
  const tDenied = useTranslations("errors.access_denied.admin");
  const tAccount = useTranslations("account.menu");
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Per-queue counts for the sidebar badges + the queue filter. MEH-2359: the
  // whole `stats` object is kept — one number per queue (admin/queues.js), not
  // the old aggregate that summed six queues (incl. home_products, MEH-796)
  // into a single badge that said nothing about WHERE to go. MEH-2399: read
  // from the one shared /admin/dashboard fetch (admin/dashboard-data.js), which
  // the home page reads too — one request per admin navigation, not two.
  const { data: dashboard, loadError } = useAdminDashboard();
  const stats = dashboard?.stats ?? null;
  // MEH-2096: whether the counts are unknown (fetch failed) rather than zero.
  const countsError = loadError;

  // MEH-1599: same 401/403 split as producer/dashboard/DashboardLayoutClient.jsx:53 — an
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

  // MEH-2426: the phone nav strip is ~1700px wide and always opened at its
  // start, so on a queue further along (חוויות, מתכונים) the highlighted tab
  // sat off-screen or half-cut. Bring the current tab into view — by scrolling
  // the STRIP only (scrollIntoView would also scroll the page vertically).
  // Re-runs when the counts land, because they decide which queues exist.
  const stripRef = useRef(null);
  useEffect(() => {
    const strip = stripRef.current;
    const current = strip?.querySelector('[aria-current="page"]');
    if (!strip || !current) return;
    const s = strip.getBoundingClientRect();
    const c = current.getBoundingClientRect();
    if (c.left >= s.left && c.right <= s.right) return;
    strip.scrollBy({ left: c.left - s.left - (s.width - c.width) / 2 });
  }, [pathname, stats, countsError, user]);

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
    section.key === "queues" ? visibleQueues(stats, countsError, isActive) : section.items;
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
        <div className="px-5 py-4 border-t border-white/10 text-xs text-green-50/50">
          <Link href="/" className="hover:text-white transition">
            {t("common.back_home")}
          </Link>
        </div>
      </aside>

      {/* Mobile: horizontal scrollable nav */}
      <div ref={stripRef} className="md:hidden w-full bg-primary-dark sticky top-16 z-40 overflow-x-auto">
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
                aria-current={active ? "page" : undefined}
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
        {children}
        {/* MEH-2533: below md /admin had no way out. The header avatar menu
            is md+ only (Header.jsx UserMenu `hidden md:block`) and BottomNav,
            whose account sheet carries «התנתקות», is gated off this subtree
            (MEH-2359). Same key, icon and markup as the owner dashboard's
            (MEH-2490, producer/dashboard/DashboardLayoutClient.jsx); no new copy. After
            logout the 401 branch above sends her to /login. */}
        <div className="md:hidden flex justify-center px-4 pt-6 pb-2">
          <button
            type="button"
            data-testid="admin-mobile-logout"
            onClick={logout}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 text-sm font-medium text-error focus-ring rounded-[8px]"
          >
            <SignOut size={18} aria-hidden="true" />
            {tAccount("logout")}
          </button>
        </div>
      </main>
    </div>
  );
}
