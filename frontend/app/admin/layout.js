"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

const NAV = [
  { href: "/admin",            label: "לוח מחוונים", icon: "📊" },
  { href: "/admin/producers",  label: "בתי עסק",     icon: "🏪" },
  { href: "/admin/users",      label: "משתמשים",     icon: "👥" },
  { href: "/admin/content",    label: "תוכן",        icon: "📝" },
  { href: "/admin/contact",    label: "פניות",       icon: "📬", badgeKey: "unread_contact_count" },
  { href: "/admin/reports",    label: "דיווחים",     icon: "🚨" },
  { href: "/admin/analytics",  label: "אנליטיקס",    icon: "📈" },
  { href: "/admin/settings",   label: "הגדרות",      icon: "⚙️" },
];

export default function AdminLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api.get("/admin/dashboard")
      .then((r) => {
        const s = r.data?.stats || {};
        setBadges({ unread_contact_count: s.unread_contact_count || 0 });
      })
      .catch(() => {});
  }, [user, pathname]);

  if (loading || !user || user.role !== "admin") {
    return <div className="max-w-7xl mx-auto px-4 py-12 text-text-secondary">טוען...</div>;
  }

  const isActive = (href) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <aside className="md:sticky md:top-4 h-fit">
          <div className="bg-white border border-border rounded-[12px] p-3">
            <p className="text-xs text-text-secondary px-2 mb-2 font-medium">פאנל ניהול</p>
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {NAV.map((n) => {
                const count = n.badgeKey ? badges[n.badgeKey] : 0;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-[12px] text-sm whitespace-nowrap transition ${
                      isActive(n.href)
                        ? "bg-primary text-white"
                        : "text-text hover:bg-accent"
                    }`}
                  >
                    <span className="text-base">{n.icon}</span>
                    <span>{n.label}</span>
                    {count > 0 && (
                      <span className="ms-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
