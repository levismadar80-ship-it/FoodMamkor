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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const rafRef = useRef(null);
  const userMenuRef = useRef(null);

  // MEH-39: close the avatar dropdown when the user clicks outside it.
  // Listener is only attached while the menu is open (saves a document
  // event in the common closed state).
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [userMenuOpen]);

  // Close the avatar dropdown on route change — clicking a Link inside
  // the menu would leave it open visually during the fade to the new
  // page, which looks stuck.
  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

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
  // transparent. Pumped to 0.6 alpha + 4px blur (was 0.4/2px) because
  // the hero gradient in app/page.js:264-267 is only ~10% opaque at
  // the top, so white text was washing out over bright Unsplash crops.
  const transparentTextShadow = transparent
    ? { textShadow: "0 1px 4px rgba(0,0,0,0.6)" }
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
      {/* Local darkening gradient — only when transparent. Lives INSIDE
          the header so legibility is guaranteed regardless of what the
          hero image looks like behind it. (The hero overlay in
          app/page.js is near-zero at the top, leaving white text
          invisible on bright food shots otherwise.) Marked
          pointer-events-none so clicks pass through to the actual nav. */}
      {transparent && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)",
          }}
        />
      )}

      {/* Desktop: 3-zone grid. Mobile: plain flex between. */}
      <div className="relative max-w-7xl mx-auto px-4 h-full md:grid md:grid-cols-[1fr_auto_1fr] md:items-center flex items-center justify-between">
        {/* ACTIONS — left on desktop (justify-self-start); hidden on mobile.
            MEH-39: guest → outlined primary pill; logged-in → circular
            avatar with dropdown (profile / settings / dashboard /
            admin / logout). When the header is transparent (homepage
            hero), the pill swaps to white-outlined-white-text so it
            reads against the dark gradient; the avatar keeps its solid
            primary fill either way (the circle itself provides local
            contrast regardless of backdrop). */}
        <div className="hidden md:flex items-center justify-self-start">
          {user ? (
            <UserMenu
              user={user}
              logout={logout}
              open={userMenuOpen}
              setOpen={setUserMenuOpen}
              menuRef={userMenuRef}
              transparent={transparent}
              textShadow={transparentTextShadow}
            />
          ) : (
            <LoginPill label={t("nav_login")} transparent={transparent} />
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
                ? { filter: "brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }
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

/**
 * MEH-39 — Outlined pill login button for guests.
 *
 * Default: 1.5px solid primary border, transparent bg, primary text.
 * Hover: solid primary bg, white text (0.2s transition).
 * Transparent header state: white border + white text with a text-shadow,
 * hover fills to white bg + primary text — so the pill reads against
 * the dark hero gradient without clashing.
 */
function LoginPill({ label, transparent }) {
  const base =
    "inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
  const solid =
    "border-[1.5px] border-primary text-primary bg-transparent hover:bg-primary hover:text-white";
  const onHero =
    "border-[1.5px] border-white text-white bg-transparent hover:bg-white hover:text-primary";
  return (
    <Link
      href="/login"
      className={`${base} ${transparent ? onHero : solid}`}
      style={transparent ? { textShadow: "0 1px 4px rgba(0,0,0,0.6)" } : undefined}
    >
      {label}
    </Link>
  );
}

/**
 * MEH-39 — Circular avatar button (34×34) with click-toggle dropdown.
 *
 * Avatar:
 *   - `user.avatar` → round cover image (currently a no-op since the
 *     backend User model has no avatar column, but the branch is
 *     ready for when it lands).
 *   - Fallback → first letter of `user.name` centered on a solid
 *     primary circle, white 14px/600.
 *
 * Dropdown items (in order):
 *   1. הפרופיל שלי  → /settings
 *   2. הגדרות       → /settings
 *   3. לוח הבקרה שלי → /producer/dashboard  (producers only)
 *   4. ממשק אדמין   → /admin                 (admins only)
 *   5. divider
 *   6. התנתקי        (red text, calls logout())
 *
 * Dropdown wrapper is `position: relative` so the absolute-positioned
 * menu anchors below the button. `inset-inline-start: 0` → physical
 * `left: 0` in LTR, `right: 0` in RTL. In the Hebrew site the menu
 * opens from the avatar's right edge downward.
 */
function UserMenu({ user, logout, open, setOpen, menuRef, transparent, textShadow }) {
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();
  const hasAvatar = !!user.avatar;
  const isProducer = user.role === "producer";
  const isAdmin = user.role === "admin";

  const items = [
    { href: "/settings", label: "הפרופיל שלי" },
    { href: "/settings", label: "הגדרות" },
    ...(isProducer ? [{ href: "/producer/dashboard", label: "לוח הבקרה שלי" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "ממשק אדמין" }] : []),
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`תפריט משתמשת — ${user.name}`}
        className="w-[34px] h-[34px] rounded-full overflow-hidden flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
        style={{
          backgroundColor: hasAvatar ? "transparent" : "#2e6853",
          ...(transparent ? textShadow : {}),
        }}
      >
        {hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-white text-sm font-semibold leading-none">
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-11 bg-white border border-[#e8e0d0] rounded-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] py-1 z-[1001]"
          style={{ minWidth: 160, insetInlineStart: 0 }}
        >
          {items.map((item) => (
            <Link
              key={item.label}
              role="menuitem"
              href={item.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-site-text hover:bg-[#F5F0E8] transition"
            >
              {item.label}
            </Link>
          ))}
          <div className="h-px bg-[#e8e0d0] my-1" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full text-right px-4 py-2 text-sm hover:bg-[#F5F0E8] transition"
            style={{ color: "#A32D2D" }}
          >
            התנתקי
          </button>
        </div>
      )}
    </div>
  );
}
