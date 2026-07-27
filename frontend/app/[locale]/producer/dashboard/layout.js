"use client";

/**
 * Module:   producer/dashboard/layout
 * Purpose:  Shared shell for the producer dashboard hub (MEH-964 Phase 1).
 *           Hosts the ONE UX auth gate for the whole /producer/dashboard/*
 *           subtree + the persistent tab nav (Overview / Edit / Insights /
 *           Tools). Partial rendering keeps the tab bar mounted across tab
 *           switches.
 * Touches:  no API/DB — reads auth state from useAuth() context only.
 * Does NOT: own real auth enforcement — that stays on the API
 *           (require_producer). This gate is UX-level only; child pages keep
 *           their own role guards until Phase 2. Does not render any
 *           dashboard content — that is each tab's page.js.
 * Related:  app/[locale]/producer/dashboard/page.js (Overview index);
 *           edit/page.js (Edit); insights/page.js (Insights);
 *           tools/page.js (Tools).
 * History:  MEH-964 (creation, chunk 1A); MEH-964 1B (Insights tab added).
 *
 * RTL: logical properties only (.claude/rules/rtl.md). Phosphor glyphs only.
 */

import { useEffect } from "react";
// MEH-1165 item 6 (MEH-1157 residual): useRouter comes from the locale-aware
// wrapper too — the boot-401 push("/login") was dropping an /en session onto
// the default-locale page (same fix as edit/page.js:37).
import { usePathname, Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  SquaresFour,
  PencilSimple,
  ChartLine,
  Wrench,
  Eye,
  Storefront,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import EmptyState from "@/components/ui/EmptyState";

// Tab order is the source of truth for the persistent nav (locked design
// order: Overview / Edit / Insights / Tools). `exact` marks the index route
// so /producer/dashboard doesn't light up every child tab.
const TABS = [
  { key: "overview", href: "/producer/dashboard", Icon: SquaresFour, exact: true },
  { key: "edit", href: "/producer/dashboard/edit", Icon: PencilSimple },
  { key: "insights", href: "/producer/dashboard/insights", Icon: ChartLine },
  { key: "tools", href: "/producer/dashboard/tools", Icon: Wrench },
];

/**
 * MEH-1638: what renders while useAuth() is still resolving /auth/me.
 *
 * Before this, the layout returned `null` for the whole authLoading window,
 * so entering ANY dashboard route showed nothing at all — measured at ~780-870ms
 * of empty body on a 700ms /auth/me round trip (MEH-1632 Phase 0, three routes).
 * The chrome below is a shape-only stand-in: same sticky nav geometry, same
 * container widths, so the real chrome swaps in without a layout jump.
 *
 * No visible text by design — copy that appears for <1s and vanishes reads as
 * a flash of its own. The sr-only label is the a11y counterpart and follows the
 * MEH-876 precedent in app/[locale]/loading.js:6-14 (reuses the existing
 * `a11y.loading` key — no new copy).
 */
function DashboardChromeSkeleton({ label }) {
  return (
    <div
      data-testid="dashboard-chrome-skeleton"
      className="bg-background"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {/* Mirrors the real <nav> below: same sticky/blur/border and the same
          max-w-5xl px-4 container, so the tab row does not shift on swap. */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <div key={tab.key} className="shrink-0 px-4 py-3">
              <div className="h-5 w-20 bg-border rounded-[8px] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-12 space-y-4">
        <div className="h-8 w-48 bg-border rounded-[12px] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-border rounded-[16px] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProducerDashboardLayout({ children }) {
  const t = useTranslations("dashboard.producer.nav");
  const tDenied = useTranslations("errors.access_denied.producer");
  const tA11y = useTranslations("a11y");
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  // MEH-1599: 401 and 403 are DIFFERENT outcomes and must not share a branch.
  //   - unauthenticated (401) → /login, now carrying ?redirect= so she lands
  //     back on the page she asked for instead of the homepage.
  //   - authenticated, wrong role (403) → NO redirect. The denied state below
  //     renders in place.
  // The old bare push("/login") collapsed both into the redirect: an
  // authenticated consumer hit LoginClient.jsx:89-91, which replace()s an
  // already-authenticated visitor to redirectTo (default "/"), so she landed
  // silently on the homepage with no explanation. `pathname` comes from
  // @/i18n/navigation, so it is locale-STRIPPED ("/producer/dashboard/edit")
  // and LoginClient re-adds the locale on the way back.
  const isUnauthenticated = !authLoading && !user;
  const isDenied = !authLoading && !!user && user.role !== "producer";

  // The single UX gate for the whole dashboard subtree. Real auth is enforced
  // server-side (require_producer); this only keeps non-producers off the UI.
  useEffect(() => {
    if (!isUnauthenticated) return;
    router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [isUnauthenticated, pathname, router]);

  // MEH-1638: these two were one branch returning null. They are different
  // states and must not share it.
  //   - authLoading → the answer is not back yet; show the chrome's shape.
  //   - isUnauthenticated → the effect above is already redirecting to /login;
  //     rendering anything here would flash behind that redirect. Returning
  //     null is deliberate and UNCHANGED.
  if (authLoading) return <DashboardChromeSkeleton label={tA11y("loading")} />;
  if (isUnauthenticated) return null;

  // 403 — in-app denied state with a route forward, not a browser redirect.
  // The subtree's child pages carry their own duplicate role guards, but this
  // returns before `children` mounts, so exactly ONE denied state can render.
  if (isDenied) {
    return (
      <div data-testid="access-denied" className="max-w-3xl mx-auto px-4">
        <EmptyState
          icon={Storefront}
          title={tDenied("heading")}
          description={tDenied("message")}
          ctaLabel={tDenied("cta")}
          ctaHref="/register/producer"
          secondaryLabel={tDenied("home")}
          secondaryHref="/"
        />
      </div>
    );
  }

  const isActive = (tab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);

  return (
    <div>
      <nav
        aria-label={t("aria")}
        className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border"
      >
        {/* overflow-x-auto: 4 tabs + icons can exceed 375px; give a scroll
            affordance rather than clipping (MEH-964 1B). */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = isActive(tab);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus-ring ${
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
          {/* MEH-1357: persistent "צפייה בדף" (GBP "See your profile") — replaces
              the removed tools-page הצגת-העסק card. NOT a tab (no active border):
              a quiet inline-end link. Targets the UUID route /producer/{id}, not
              /p/{slug}: the owner-exception (producers.py:265-271) lets the owner
              view her OWN page while pending, whereas the slug route
              (producers.py:210-226) is approved-only and would 404 pre-approval.
              MEH-1632: that reasoning is sound and this URL was always correct —
              but between MEH-1398 and MEH-1632 it did NOT hold for the rendered
              page. The edge existence-check added by MEH-1398 called the same
              endpoint ANONYMOUSLY, so the owner-exception never applied and this
              link hard-404'd for every pending business. The check no longer
              covers /producer/{id} (middleware.js) and the owner-exception is
              once again what decides. Do not "fix" this href — the edge was the
              bug, not the URL. */}
          {user.producer_id && (
            <Link
              href={`/producer/${user.producer_id}`}
              className="ms-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium text-fg-muted hover:text-primary transition-colors focus-ring"
            >
              <Eye size={18} aria-hidden="true" />
              {t("view_page")}
            </Link>
          )}
        </div>
      </nav>
      {children}
    </div>
  );
}
