"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/language-context";
import { useTranslations } from "next-intl";
import { Heart, List, MagnifyingGlass, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { BRAND_NAME } from "@/lib/constants";

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
  const { lang, setLang } = useLanguage();
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [resendError, setResendError] = useState("");
  const rafRef = useRef(null);
  const userMenuRef = useRef(null);

  const handleResend = async () => {
    if (resendSending) return;
    setResendSending(true);
    setResendError("");
    try {
      await api.post("/auth/resend-verify");
      setResendSent(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setResendError(t("auth.verify.rate_limited"));
      } else {
        setResendError(t("error.try_again"));
      }
    }
    setResendSending(false);
  };

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

  // Press "/" anywhere outside an input to open the search page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (document.activeElement?.isContentEditable) return;
      e.preventDefault();
      router.push("/search?focus=1");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  const isProducer = user?.role === "producer";
  const showAddBusinessCta = !isProducer;

  const NAV_ITEMS = [
    { href: "/", label: t("nav.discover") },
    { href: "/map", label: t("nav.map") },
    { href: "/neighbor", label: t("nav.neighbor") },
    { href: "/about", label: t("nav.about") },
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
        "sticky top-0 z-[1000] transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300 ease-out",
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
      <div className="relative max-w-7xl mx-auto px-4 h-16 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center flex items-center justify-between">
        {/* LOGO — col 1 = visual RIGHT in RTL. Mobile: RTL flex-between
            puts it at the visual right naturally. When transparent the
            dark `/logo.png` is inverted to white via CSS filter. */}
        <Link href="/" className="md:justify-self-start shrink-0">
          <Image
            src="/logo.png"
            alt={BRAND_NAME}
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

        {/* NAV — col 2 = center on desktop; hidden on mobile. */}
        <nav
          className="hidden md:flex items-center gap-6 justify-self-center"
          aria-label={t("nav.main_label")}
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

        {/* ACTIONS — col 3 = visual LEFT in RTL; hidden on mobile.
            MEH-39: guest → outlined primary pill; logged-in → circular
            avatar with dropdown (profile / settings / dashboard /
            admin / logout). When the header is transparent (homepage
            hero), the pill swaps to white-outlined-white-text so it
            reads against the dark gradient; the avatar keeps its solid
            primary fill either way (the circle itself provides local
            contrast regardless of backdrop). */}
        <div className="hidden md:flex items-center gap-3 justify-self-end">
          {/* Search trigger — desktop only */}
          <button
            onClick={() => router.push("/search?focus=1")}
            aria-label={t("nav.search_label")}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/10 transition"
          >
            <MagnifyingGlass size={20} color="#6B6B6B" weight="regular" aria-hidden="true" />
          </button>
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
            <LoginPill label={t("nav.login")} transparent={transparent} />
          )}
        </div>

        {/* Mobile search + hamburger — left side (RTL flex-between). */}
        <div className="md:hidden flex items-center gap-1">
          <button
            onClick={() => router.push("/search?focus=1")}
            aria-label={t("nav.search_label")}
            className={`p-2 ${transparent ? "text-white" : "text-site-muted"}`}
            style={transparentTextShadow}
          >
            <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
          </button>
          <button
            className={`p-2 ${transparent ? "text-white" : "text-site-text"}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? t("nav.menu_close") : t("nav.menu_open")}
            aria-expanded={menuOpen}
            style={transparentTextShadow}
          >
            {menuOpen ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}
          </button>
        </div>
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
              {t("nav.add_business")}
            </Link>
          )}

          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="text-sm text-site-muted border border-[#e8e0d0] rounded-full px-3 py-1 inline-flex items-center gap-1.5"
            aria-label={lang === "he" ? t("nav.lang_switch_to_en") : t("nav.lang_switch_to_he")}
          >
            <span className={lang === "he" ? "font-bold text-primary" : ""}>{t("nav.lang_he")}</span>
            <span className="text-border">/</span>
            <span className={lang === "en" ? "font-bold text-primary" : ""}>{t("nav.lang_en")}</span>
          </button>

          {user ? (
            <>
              <Link
                href="/favorites"
                className="flex items-center gap-1 text-site-muted"
                onClick={() => setMenuOpen(false)}
              >
                <Heart size={16} weight="duotone" aria-hidden="true" />
                {t("nav.favorites")}
              </Link>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="block text-secondary"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("nav.admin")}
                </Link>
              )}
              <button
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="block text-red-500"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="block text-site-muted"
              onClick={() => setMenuOpen(false)}
            >
              {t("nav.login")}
            </Link>
          )}
        </div>
      )}

      {user && user.email_verified === false && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2.5 flex items-center justify-center gap-3 text-sm flex-wrap">
          <span className="text-amber-800">{t("auth.verify.banner")}</span>
          {resendError ? (
            <span className="text-red-600 text-xs font-medium">{resendError}</span>
          ) : !resendSent ? (
            <button
              onClick={handleResend}
              disabled={resendSending}
              className="text-primary hover:underline text-xs font-medium disabled:opacity-50"
            >
              {t("auth.verify.resend")}
            </button>
          ) : (
            <span className="text-green-600 text-xs font-medium">{t("auth.verify.sent")}</span>
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
 *   1. הפרופיל שלי  → /producer/dashboard (producers) | /settings?tab=profile (consumers)
 *   2. הגדרות       → /settings?tab=security
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
  const t = useTranslations();
  const initial = (user.name || "?").trim().charAt(0).toUpperCase();
  const hasAvatar = !!user.avatar_url;
  const isProducer = user.role === "producer";
  const isAdmin = user.role === "admin";

  const items = [
    { href: isProducer ? "/producer/dashboard" : "/settings?tab=profile", label: t("account.menu.profile") },
    { href: "/settings?tab=security", label: t("account.menu.settings") },
    ...(isProducer ? [{ href: "/producer/dashboard", label: t("account.menu.dashboard") }] : []),
    ...(isAdmin ? [{ href: "/admin", label: t("account.menu.admin") }] : []),
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("account.menu.aria", { name: user.name })}
        className="w-[34px] h-[34px] rounded-full overflow-hidden flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
        style={{
          backgroundColor: hasAvatar ? "transparent" : "#2e6853",
          ...(transparent ? textShadow : {}),
        }}
      >
        {hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
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
            {t("account.menu.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
