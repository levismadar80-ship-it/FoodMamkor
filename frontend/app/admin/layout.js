"use client";

import { useEffect } from "react";
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
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";

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
  { href: "/admin/users", label: "משתמשים", Icon: Users },
  { href: "/admin/content", label: "תוכן", Icon: Note },
  { href: "/admin/reports", label: "דיווחים", Icon: Warning },
  { href: "/admin/analytics", label: "אנליטיקס", Icon: ChartLineUp },
  { href: "/admin/settings", label: "הגדרות", Icon: GearSix },
];

export default function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

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
      <aside className="hidden md:flex fixed top-16 right-0 bottom-0 w-60 bg-primary-dark text-light flex-col z-40">
        <div className="px-5 py-6 border-b border-white/10">
          <p className="font-headline text-xl text-white">מהמקור Admin</p>
          <p className="text-light/60 text-xs mt-1">{user.name}</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((n) => {
            const active = isActive(n.href);
            const Icon = n.Icon;
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
                <span>{n.label}</span>
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

      {/* Content — offset by sidebar width on desktop (RTL → margin-right) */}
      <main className="flex-1 md:mr-60 min-w-0 p-5 md:p-8">
        {children}
      </main>
    </div>
  );
}
