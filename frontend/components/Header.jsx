"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
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
            גלה
          </Link>
          <Link href="/map" className="text-site-muted hover:text-primary transition">
            מפה
          </Link>
          <Link href="/events" className="text-site-muted hover:text-primary transition">
            אירועים
          </Link>
          <Link href="/neighbor" className="text-site-muted hover:text-primary transition inline-flex items-center gap-1">
            מהשכן
            <House size={16} weight="duotone" aria-hidden="true" />
          </Link>
          <Link href="/about" className="text-site-muted hover:text-primary transition">
            אודות
          </Link>
          <Link
            href="/register/producer"
            className="bg-primary text-white px-4 py-2 rounded-full hover:bg-primary-light transition focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            הוסיפי את העסק שלך 🌿
          </Link>
          {user ? (
            <div className="flex items-center gap-4">
              <Link
                href="/favorites"
                className="text-site-muted hover:text-primary transition inline-flex items-center gap-1"
                aria-label="מועדפים"
              >
                <Heart size={18} weight="duotone" />
                <span className="hidden lg:inline">מועדפים</span>
              </Link>
              <Link href="/settings" className="text-site-muted hover:text-primary transition text-sm">
                {user.name}
              </Link>
              {user.role === "admin" && (
                <Link href="/admin" className="text-secondary hover:underline text-sm">
                  אדמין
                </Link>
              )}
              <button onClick={logout} className="text-sm text-site-muted hover:text-red-500">
                התנתק
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-site-muted hover:text-primary transition">
              כניסה לחשבון
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
            גלה
          </Link>
          <Link href="/map" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            מפה
          </Link>
          <Link href="/events" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            אירועים
          </Link>
          <Link href="/neighbor" className="flex items-center gap-1 text-site-muted" onClick={() => setMenuOpen(false)}>
            מהשכן
            <House size={16} weight="duotone" aria-hidden="true" />
          </Link>
          <Link href="/about" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
            אודות
          </Link>
          <Link href="/register/producer" className="block text-primary font-semibold" onClick={() => setMenuOpen(false)}>
            הוסיפי את העסק שלך 🌿
          </Link>
          {user ? (
            <>
              <Link href="/favorites" className="flex items-center gap-1 text-site-muted" onClick={() => setMenuOpen(false)}>
                <Heart size={16} weight="duotone" aria-hidden="true" />
                מועדפים
              </Link>
              {user.role === "admin" && (
                <Link href="/admin" className="block text-secondary" onClick={() => setMenuOpen(false)}>
                  אדמין
                </Link>
              )}
              <button onClick={() => { logout(); setMenuOpen(false); }} className="block text-red-500">
                התנתק
              </button>
            </>
          ) : (
            <Link href="/login" className="block text-site-muted" onClick={() => setMenuOpen(false)}>
              כניסה לחשבון
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
