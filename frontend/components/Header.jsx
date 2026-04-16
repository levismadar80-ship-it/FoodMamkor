"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { Heart, List, X } from "@phosphor-icons/react";

/**
 * Header (MEH-29 sticky / active / transparent) — layered on top of the
 * MEH-28 slim layout (logo right · nav center · login-only left).
 *
 * Three behaviors added:
 *
 * 1. Sticky w/ scroll shadow (was already sticky; tightened) —
 *    `position: sticky; top: 0; z-index: 1000`. No shadow at the top of
 *    the page; once `scrollY ≥ 80` we add `0 2px 8px rgba(0,0,0,0.08)`
 *    + a backdrop blur. Threshold tracked via rAF-throttled scroll
 *    listener (cheaper than a raw scroll handler that fires every frame).
 *
 * 2. Active nav link — `usePathname()` decides which of the four
 *    NAV_ITEMS is current. Exact match for `/`, prefix match for
 *    `/map`, `/neighbor`, `/about`. Active rendering: `aria-current="page"`,
 *    primary-green text + 2px primary border-bottom + semibold (transparent
 *    state swaps both colors to white so the indicator is still visible
 *    against the dark hero overlay).
 *
 * 3. Transparent on homepage hero — Gardensweet-style. Only when
 *    `pathname === "/"` AND `scrollY < 80`: bg transparent, no border,
 *    text white, logo inverted, text-shadow on nav text + login link +
 *    hamburger so it stays legible if the hero image is bright at the
 *    top (the gradient overlay in `app/page.js:264-267` is only
 *    `rgba(0,0,0,0.10)` at the very top). Once the user scrolls past
 *    the threshold the cream bg fades in.
 */
export default function Header() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rafRef = useRef(null);

  // rAF-throttled scroll listener — coalesces scroll events into one
  // state read per animation frame. Threshold = 80px per spec.
  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY >= 80);
        rafRef.current = null;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isProducer = user?.role === "producer";
  const showAddBusinessCta = !isProducer;

  const NAV_ITEMS = [
    { href: "/", label: t("nav_discover") },
    { href: "/map", label: t("nav_map") },
    { href: "/neighbor", label: t("nav_neighbor") },
    { href: "/about", label: t("nav_about") },
  ];

  const isHomepage = pathname === "/";
  const transparent = isHomepage && !scrolled;

  // Pathname → active key. Exact match for `/`, prefix for the rest so
  // `/map/...` and `/neighbor/abc` keep their tab highlighted.
  const isActive = (href) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Text-shadow for legibility over a bright hero — only applied while
  // transparent. Empty object once scrolled so it doesn't linger.
  const transparentTextShadow = transparent
    ? { textShadow: "0 1px 2px rgba(0,0,0,0.4)" }
    : undefined;

  return (
    <header
      className={[
        "sticky top-0 z-[1000] transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ease-out h-16",
        transparent
          ? "bg-transparent"
          : scrolled
            ? "bg-background/95 backdrop-blur-md border-b border-[#e8e0d0] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            : "bg-background border-b border-[#e8e0d0]",
      ].join(" ")}
    >
      {/* Desktop: 3-zone grid. Mobile: plain flex between. */}
      <div className="max-w-7xl mx-auto px-4 h-full md:grid md:grid-cols-[1fr_auto_1fr] md:items-center flex items-center justify-between">
        {/* ACTIONS — left on desktop (justify-self-start); hidden on mobile.
            MEH-28: exactly ONE item. Guests see ghost "כניסה"; logged-in
            users see their name linking to /settings. */}
        <div className="hidden md:flex items-center justify-self-start">
          {user ? (
            <Link
              href="/settings"
              className={`text-[13px] transition ${
                transparent ? "text-white hover:text-white/80" : "hover:text-primary"
              }`}
              style={{ color: transparent ? undefined : "#6B6B6B", ...transparentTextShadow }}
            >
              {user.name}
            </Link>
          ) : (
            <Link
              href="/login"
              className={`text-[13px] transition ${
                transparent ? "text-white hover:text-white/80" : "hover:text-primary"
              }`}
              style={{ color: transparent ? undefined : "#6B6B6B", ...transparentTextShadow }}
            >
              {t("nav_login")}
            </Link>
          )}
        </div>

        {/* NAV — center on desktop (justify-self-center); hidden on mobile. */}
        <nav
          className="hidden md:flex items-center gap-6 justify-self-center"
          aria-label="ניווט ראשי"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const baseClasses = "transition text-sm pb-1 border-b-2";
            const activeClasses = transparent
              ? "text-white border-white font-semibold"
              : "text-primary border-primary font-semibold";
            const inactiveClasses = transparent
              ? "text-white/90 border-transparent hover:text-white font-medium"
              : "text-site-text border-transparent hover:text-primary font-medium";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${baseClasses} ${active ? activeClasses : inactiveClasses}`}
                style={transparentTextShadow}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* LOGO — right on desktop (justify-self-end) and mobile (RTL
            flex-between puts it at the visual right). When transparent
            the dark `/logo.png` is inverted to white via CSS filter. */}
        <Link href="/" className="md:justify-self-end shrink-0">
          <Image
            src="/logo.png"
            alt="מהמקור"
            width={106}
            height={40}
            priority
            style={
              transparent
                ? { filter: "brightness(0) invert(1) drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }
                : undefined
            }
          />
        </Link>

        {/* Mobile hamburger — left side (RTL flex-between puts it there). */}
        <button
          className={`md:hidden p-2 ${transparent ? "text-white" : "text-site-text"}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={menuOpen}
          style={transparentTextShadow}
        >
          {menuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
        </button>
      </div>

      {/* Mobile drawer — everything except logo + hamburger lives here.
          Drawer always uses the cream background regardless of transparent
          state, so links read correctly when expanded over the hero. */}
      {menuOpen && (
        <div className="md:hidden bg-background border-t border-[#e8e0d0] px-4 py-3 space-y-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block text-base ${active ? "text-primary font-semibold" : "text-site-text"}`}
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}

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
