"use client";

import { useEffect, useRef } from "react";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useFocusReturn } from "@/lib/use-focus-return";

/**
 * LoginPromptModal — lightweight modal that nudges guests toward /login
 * when they attempt a write action (favoriting, etc.).
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - message: string (default: modals.login_prompt.default_message)
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
  message,
  nextPath = "/",
}) {
  const t = useTranslations("modals.login_prompt");
  const promptMessage = message ?? t("default_message");
  const primaryRef = useRef(null);
  const modalRef = useRef(null);

  // Capture trigger before CTA-focus effect runs (effect order matters).
  useFocusReturn(open);

  // Esc to close + Tab trap + focus primary CTA on open + lock body scroll.
  useEffect(() => {
    if (!open) return;

    const handleKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;

      const focusables = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKey);

    // Move focus to the login CTA on open so keyboard users can Enter-confirm.
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

  const loginHref = `/login?redirect=${encodeURIComponent(nextPath)}`;

  return (
    <div
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-[16px] max-w-sm w-full p-6 shadow-xl text-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close_aria")}
          className="absolute top-3 end-3 w-11 h-11 flex items-center justify-center text-fg-muted hover:text-text transition rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X size={20} weight="bold" aria-hidden="true" />
        </button>

        {/* MEH-2038: the button spans 12→56px in from the card edge (end-3 +
            w-11) and the p-6 content box starts at 24px, so 32px needs
            clearing — px-8. Reserved SYMMETRICALLY (px-8, not pe-8) because
            this panel is text-center: a one-sided pad would visibly shift the
            heading off its centre while the body copy below stayed centred.
            The reserve is tied to the button's WIDTH, so it grew with it — at
            the earlier 28px button px-6 was enough. Growing a close button
            without re-deriving this number re-opens the collision. */}
        <h2
          id="login-prompt-title"
          className="font-headline-md text-xl font-bold text-text mb-3 px-8"
        >
          {t("title")}
        </h2>
        <p className="text-text mb-6 leading-relaxed">{promptMessage}</p>

        <a
          ref={primaryRef}
          href={loginHref}
          className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("login_cta")}
        </a>
        <button
          type="button"
          onClick={onClose}
          className="block w-full mt-2 text-sm text-fg-muted hover:text-text transition py-2 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("dismiss_cta")}
        </button>
      </div>
    </div>
  );
}
