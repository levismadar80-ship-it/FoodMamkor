"use client";

import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { useFocusReturn } from "@/lib/use-focus-return";

/**
 * LoginPromptModal — lightweight modal that nudges guests toward /login
 * when they attempt a write action (favoriting, etc.).
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - message: string (default: "כדי לשמור עסקים אוהבים — היכנסי")
 *   - nextPath: string (the URL to redirect back to after login)
 *
 * Accessibility:
 *   - role="dialog" + aria-modal="true" + aria-labelledby
 *   - Focus moves to the primary CTA on open
 *   - Esc + backdrop click + X button all close
 *   - Body scroll locked while open (map/page under the modal doesn't scroll)
 *
 * Z-index: z-[9500] — below chat widget (9999) + cookie banner (9998),
 * above everything else (map legend 800, controls 1000).
 */
export default function LoginPromptModal({
  open,
  onClose,
  message = "כדי לשמור עסקים אוהבים — היכנסי",
  nextPath = "/",
}) {
  const primaryRef = useRef(null);

  // Capture trigger before CTA-focus effect runs (effect order matters).
  useFocusReturn(open);

  // Esc to close + focus primary CTA on open + lock body scroll.
  useEffect(() => {
    if (!open) return;

    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);

    // Move focus to "היכנסי" on open so keyboard users can Enter-confirm.
    primaryRef.current?.focus();

    // Body scroll lock — restore on close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-[16px] max-w-sm w-full p-6 shadow-xl text-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="סגרי חלונית"
          className="absolute top-3 start-3 text-site-muted hover:text-site-text transition p-1 rounded focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>

        <h2
          id="login-prompt-title"
          className="font-headline text-xl font-bold text-site-text mb-3"
        >
          רוצה לשמור? 🌿
        </h2>
        <p className="text-site-text mb-6 leading-relaxed">{message}</p>

        <a
          ref={primaryRef}
          href={loginHref}
          className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          היכנסי
        </a>
        <button
          type="button"
          onClick={onClose}
          className="block w-full mt-2 text-sm text-site-muted hover:text-site-text transition py-2 rounded focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          אולי אחר כך
        </button>
      </div>
    </div>
  );
}
