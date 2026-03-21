"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-primary">
          מהמקור
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-text-secondary hover:text-primary transition">
            דף בית
          </Link>
          <Link href="/map" className="text-text-secondary hover:text-primary transition">
            מפה
          </Link>
          <Link
            href="/register/producer"
            className="bg-primary text-white px-4 py-2 rounded-[12px] hover:bg-primary-light transition"
          >
            הצטרף כיצרן
          </Link>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-text-secondary">{user.name}</span>
              {user.role === "admin" && (
                <Link href="/admin" className="text-accent hover:underline text-sm">
                  אדמין
                </Link>
              )}
              <button onClick={logout} className="text-sm text-text-secondary hover:text-red-500">
                התנתק
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-text-secondary hover:text-primary transition">
              התחבר
            </Link>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button className="md:hidden p-2" onClick={() => setMenuOpen(!menuOpen)}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-3">
          <Link href="/" className="block text-text-secondary" onClick={() => setMenuOpen(false)}>
            דף בית
          </Link>
          <Link href="/map" className="block text-text-secondary" onClick={() => setMenuOpen(false)}>
            מפה
          </Link>
          <Link href="/register/producer" className="block text-primary font-semibold" onClick={() => setMenuOpen(false)}>
            הצטרף כיצרן
          </Link>
          {user ? (
            <>
              {user.role === "admin" && (
                <Link href="/admin" className="block text-accent" onClick={() => setMenuOpen(false)}>
                  אדמין
                </Link>
              )}
              <button onClick={() => { logout(); setMenuOpen(false); }} className="block text-red-500">
                התנתק
              </button>
            </>
          ) : (
            <Link href="/login" className="block text-text-secondary" onClick={() => setMenuOpen(false)}>
              התחבר
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
