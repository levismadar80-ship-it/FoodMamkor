"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { Heart, List, X } from "@phosphor-icons/react";

/**
 * Header (MEH-20 redesign) — Wolt/Airbnb-style 3-zone desktop layout.
 *
 * Desktop (md+):
 *     [ actions (left) ]   [ nav (center) ]   [ logo (right) ]
 *   Implemented as `grid grid-cols-[1fr_auto_1fr]` so the center nav
 *   is truly centered regardless of actions width. Logo lives at
 *   justify-self-end, actions at justify-self-start — no dependence
 *   on RTL flex reversal, which was the root cause of the previous
 *   logo-on-the-wrong-side bug.
 *
 * Mobile (< md):
 *   Top bar = logo right + hamburger left only. Everything else moves
 *   into the drawer (add-business, favorites, admin, language, login).
 *
 * Nav items (exactly 4):
 *   גלה (/) · מפה (/map) · מהשכן (/neighbor) · אודות (/about)
 *   `/events` removed per spec — events are reachable from producer
 *   detail pages only.
 *
 * Actions visibility rules:
 *   - "הוסיפי את העסק שלך" — hidden when role=producer (they already
 *     have a business).
 *   - Admin link — hidden on desktop (only in hamburger drawer) to keep
 *     the header clean for the 99% of users who aren't admins.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isProducer = user?.role === "producer";
  const showAddBusinessCta = !isProducer;

  const NAV_ITEMS = [
    { href: "/", label: t("nav_discover") },
    { href: "/map", label: t("nav_map") },
    { href: "/neighbor", label: t("nav_neighbor") },
    { href: "/about", label: t("nav_about") },
  ];

  return (
    <header
      className={[
        "sticky top-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ease-out h-16",
        scrolled
          ? "bg-background/85 backdrop-blur-md border-b border-[#e8e0d0] shadow-[0_2px_20px_rgba(46,104,83,0.06)]"
          : "bg-background border-b border-[#e8e0d0]",
      ].join(" ")}
    >
      {/* Desktop: 3-zone grid. Mobile: plain flex between. */}
      <div className="max-w-7xl mx-auto px-4 h-full md:grid md:grid-cols-[1fr_auto_1fr] md:items-center flex items-center justify-between">
        {/* ACTIONS — left on desktop (justify-self-start); hidden on mobile. */}
        <div className="hidden md:flex items-center gap-3 justify-self-start">
          {user ? (
            <>
              <Link
                href="/favorites"
                className="text-site-muted hover:text-primary transition inline-flex items-center gap-1"
                aria-label={t("nav_favorites")}
              >
                <Heart size={18} weight="duotone" />
                <span className="hidden lg:inline">{t("nav_favorites")}</span>
              </Link>
              <Link
                href="/settings"
                className="text-site-muted hover:text-primary transition text-sm"
              >
                {user.name}
              </Link>
              <button
                onClick={logout}
                className="text-sm text-site-muted hover:text-red-500"
              >
                {t("nav_logout")}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-site-muted hover:text-primary transition text-sm"
            >
              {t("nav_login")}
            </Link>
          )}
          {showAddBusinessCta && (
            <Link
              href="/register/producer"
              className="bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary-light transition focus-visible:ring-2 focus-visible:ring-primary/40"
              style={{ borderRadius: "20px" }}
            >
              {t("nav_add_business")}
            </Link>
          )}
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="text-xs text-site-muted hover:text-primary transition border border-[#e8e0d0] rounded-full px-2.5 py-1 flex items-center gap-1"
            aria-label={lang === "he" ? "Switch to English" : "החלף לעברית"}
          >
            <span className={lang === "he" ? "font-bold text-primary" : ""}>עב</span>
            <span className="text-border">/</span>
            <span className={lang === "en" ? "font-bold text-primary" : ""}>EN</span>
          </button>
        </div>

        {/* NAV — center on desktop (justify-self-center); hidden on mobile. */}
        <nav className="hidden md:flex items-center gap-6 justify-self-center">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-site-text hover:text-primary transition text-sm font-medium"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* LOGO — right on desktop (justify-self-end) and mobile (order is
            logo first since RTL flex-between puts it at the visual right). */}
        <Link href="/" className="md:justify-self-end shrink-0">
          <Image
            src="/logo.png"
            alt="מהמקור"
            width={106}
            height={40}
            priority
          />
        </Link>

        {/* Mobile hamburger — left side (RTL flex-between puts it there). */}
        <button
          className="md:hidden p-2 text-site-text"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
        </button>
      </div>

      {/* Mobile drawer — everything except logo + hamburger lives here. */}
      {menuOpen && (
        <div className="md:hidden bg-background border-t border-[#e8e0d0] px-4 py-3 space-y-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block text-site-text text-base"
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}

          {showAddBusinessCta && (
            <Link
              href="/register/producer"
              className="block text-primary font-semibold"
              onClick={() => setMenuOpen(false)}
            >
              {t("nav_add_business")}
            </Link>
          )}

          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="text-sm text-site-muted border border-[#e8e0d0] rounded-full px-3 py-1 inline-flex items-center gap-1.5"
            aria-label={lang === "he" ? "Switch to English" : "החלף לעברית"}
          >
            <span className={lang === "he" ? "font-bold text-primary" : ""}>עב</span>
            <span className="text-border">/</span>
            <span className={lang === "en" ? "font-bold text-primary" : ""}>EN</span>
          </button>

          {user ? (
            <>
              <Link
                href="/favorites"
                className="flex items-center gap-1 text-site-muted"
                onClick={() => setMenuOpen(false)}
              >
                <Heart size={16} weight="duotone" aria-hidden="true" />
                {t("nav_favorites")}
              </Link>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="block text-secondary"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("nav_admin")}
                </Link>
              )}
              <button
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="block text-red-500"
              >
                {t("nav_logout")}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="block text-site-muted"
              onClick={() => setMenuOpen(false)}
            >
              {t("nav_login")}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
