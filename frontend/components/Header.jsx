"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { Heart, House, List, X } from "@phosphor-icons/react";

/**
 * Header (docs/archive/WORLD_CLASS_V2.md #2 — navbar scroll blur)
 *
 * Starts with a solid cream background at the top of the page and
 * transitions to a blurred translucent pane once the user scrolls
 * past 60px. Keeps the warm palette — does NOT switch to a dark
 * "authkit" style which would contradict the brand direction in
 * CLAUDE.md ("warm and organic, not startup").
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

  return (
    <header
      className={[
        "sticky top-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ease-out",
        scrolled
          ? "bg-background/85 backdrop-blur-md border-b border-border shadow-[0_2px_20px_rgba(46,104,83,0.06)]"
          : "bg-background border-b border-transparent",
      ].join(" ")}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/">
          <Image src="/logo.png" alt="מהמקור" width={106} height={40} priority />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-site-muted hover:text-primary transition">
            {t("nav_discover")}
          </Link>
          <Link href="/map" className="text-site-muted hover:text-primary transition">
            {t("nav_map")}
          </Link>
          <Link href="/events" className="text-site-muted hover:text-primary transition">
            {t("nav_events")}
          </Link>
          <Link href="/neighbor" className="text-site-muted hover:text-primary transition inline-flex items-center gap-1">
            {t("nav_neighbor")}
            <House size={16} weight="duotone" aria-hidden="true" />
          </Link>
          <Link href="/about" className="text-site-muted hover:text-primary transition">
            {t("nav_about")}
          </Link>
          <Link
            href="/register/producer"
            className="bg-primary text-white px-4 py-2 rounded-full hover:bg-primary-light transition focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("nav_add_business")}
          </Link>
          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="text-sm text-site-muted hover:text-primary transition border border-border rounded-full px-3 py-1 flex items-center gap-1.5"
            aria-label={lang === "he" ? "Switch to English" : "החלף לעברית"}
          >
            <span className={lang === "he" ? "font-bold text-primary" : ""}>עב</span>
            <span className="text-border">/</span>
            <span className={lang === "en" ? "font-bold text-primary" : ""}>EN</span>
          </button>
          {user ? (
            <div className="flex items-center gap-4">
              <Link
                href="/favorites"
                className="text-site-muted hover:text-primary transition inline-flex items-center gap-1"
                aria-label={t("nav_favorites")}
              >
                <Heart size={18} weight="duotone" />
                <span className="hidden lg:inline">{t("nav_favorites")}</span>
              </Link>
              <Link href="/settings" className="text-site-muted hover:text-primary transition text-sm">
                {user.name}
              </Link>
              {user.role === "admin" && (
                <Link href="/admin" className="text-secondary hover:underline text-sm">
                  {t("nav_admin")}
                </Link>
              )}
              <button onClick={logout} className="text-sm text-site-muted hover:text-red-500">
                {t("nav_logout")}
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-site-muted hover:text-primary transition">
              {t("nav_login")}
            </Link>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-site-text"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-background border-t border-border px-4 py-3 space-y-3">
          <Link href="/" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            {t("nav_discover")}
          </Link>
          <Link href="/map" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            {t("nav_map")}
          </Link>
          <Link href="/events" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            {t("nav_events")}
          </Link>
          <Link href="/neighbor" className="flex items-center gap-1 text-site-muted" onClick={() => setMenuOpen(false)}>
            {t("nav_neighbor")}
            <House size={16} weight="duotone" aria-hidden="true" />
          </Link>
          <Link href="/about" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            {t("nav_about")}
          </Link>
          <Link href="/register/producer" className="block text-primary font-semibold" onClick={() => setMenuOpen(false)}>
            {t("nav_add_business")}
          </Link>
          {/* Mobile language toggle */}
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="text-sm text-site-muted border border-border rounded-full px-3 py-1 inline-flex items-center gap-1.5"
            aria-label={lang === "he" ? "Switch to English" : "החלף לעברית"}
          >
            <span className={lang === "he" ? "font-bold text-primary" : ""}>עב</span>
            <span className="text-border">/</span>
            <span className={lang === "en" ? "font-bold text-primary" : ""}>EN</span>
          </button>
          {user ? (
            <>
              <Link href="/favorites" className="flex items-center gap-1 text-site-muted" onClick={() => setMenuOpen(false)}>
                <Heart size={16} weight="duotone" aria-hidden="true" />
                {t("nav_favorites")}
              </Link>
              {user.role === "admin" && (
                <Link href="/admin" className="block text-secondary" onClick={() => setMenuOpen(false)}>
                  {t("nav_admin")}
                </Link>
              )}
              <button onClick={() => { logout(); setMenuOpen(false); }} className="block text-red-500">
                {t("nav_logout")}
              </button>
            </>
          ) : (
            <Link href="/login" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
              {t("nav_login")}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
