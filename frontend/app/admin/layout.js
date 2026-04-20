"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
} from "@phosphor-icons/react";
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

const NAV = [
  { href: "/admin", label: "לוח מחוונים", Icon: Gauge },
  { href: "/admin/producers", label: "בתי עסק", Icon: Storefront },
  { href: "/admin/outreach", label: "גיוס", Icon: Megaphone },
  { href: "/admin/experiences", label: "חוויות", Icon: Sparkle },
  { href: "/admin/users", label: "משתמשים", Icon: Users },
  { href: "/admin/content", label: "תוכן", Icon: Note },
  { href: "/admin/reviews", label: "ביקורות", Icon: Star },
  { href: "/admin/kashrut", label: "כשרות", Icon: Seal },
  { href: "/admin/reports", label: "דיווחים", Icon: Warning },
  { href: "/admin/analytics", label: "אנליטיקס", Icon: ChartLineUp },
  { href: "/admin/settings", label: "הגדרות", Icon: GearSix },
  { href: "/admin/help", label: "עזרה", Icon: Lifebuoy },
];

export default function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // feature/producer-analytics: pending moderation badge on the sidebar —
  // sums pending producers + open reports + flagged home products +
  // pending experiences. Fetched from /admin/dashboard, which the admin
  // home page already calls — but we call it here too so the badge shows
  // on every /admin/* subpath. Cheap: the endpoint is fast.
  const [pendingModCount, setPendingModCount] = useState(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api
      .get("/admin/dashboard")
      .then((r) => setPendingModCount(r.data?.stats?.pending_moderation_count ?? 0))
      .catch(() => setPendingModCount(null));
  }, [user, pathname]);

  if (loading || !user || user.role !== "admin") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-site-muted">
        טוענת...
      </div>
    );
  }

  const isActive = (href) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="flex min-h-screen">
      {/* Dark-green sidebar — RTL, so it's on the right */}
      <aside className="hidden md:flex fixed top-16 start-0 bottom-0 w-60 bg-primary-dark text-light flex-col z-40">
        <div className="px-5 py-6 border-b border-white/10">
          <p className="font-headline text-xl text-white">מהמקור Admin</p>
          <p className="text-light/60 text-xs mt-1">{user.name}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((n) => {
            const active = isActive(n.href);
            const Icon = n.Icon;
            const showBadge = n.href === "/admin" && pendingModCount > 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] text-sm transition ${
                  active
                    ? "bg-primary text-white"
                    : "text-light/70 hover:bg-white/5 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} weight={active ? "fill" : "duotone"} />
                <span className="flex-1">{n.label}</span>
                {showBadge && (
                  <span
                    className="bg-yellow-400 text-yellow-900 text-[11px] font-bold px-2 py-0.5 rounded-full leading-none"
                    aria-label={`${pendingModCount} פריטים לאישור`}
                    title={`${pendingModCount} פריטים ממתינים לאישור`}
                  >
                    {pendingModCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-light/50">
          <Link href="/" className="hover:text-white transition">
            ← חזרה לאתר
          </Link>
        </div>
      </aside>

      {/* Mobile: horizontal scrollable nav */}
      <div className="md:hidden w-full bg-primary-dark sticky top-16 z-40 overflow-x-auto">
        <nav className="flex gap-1 px-3 py-2 whitespace-nowrap">
          {NAV.map((n) => {
            const active = isActive(n.href);
            const Icon = n.Icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs transition ${
                  active ? "bg-primary text-white" : "text-light/70"
                }`}
              >
                <Icon size={14} weight="duotone" />
                {n.label}
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
