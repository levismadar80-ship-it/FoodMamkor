// @ts-check
"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useFocusReturn } from "@/lib/use-focus-return";
import { trackEvent } from "@/lib/analytics";
import LoginPromptGoogle from "@/components/LoginPromptGoogle";

/**
 * LoginPromptModal — lightweight modal that nudges guests toward /login
 * when they attempt a write action (favoriting, etc.).
 *
 * Props:
 *   - open: boolean
 *   - onClose: () => void
 *   - title: string (default: modals.login_prompt.title, «רוצה לשמור?»)
 *            MEH-3130: the reviews / updates / rescue-bag hand-offs name
 *            their own action; the save hearts keep the default.
 *   - message: string (default: modals.login_prompt.default_message)
 *   - nextPath: string (the URL to redirect back to after login)
 *   - reason: string (MEH-3661 — which action asked; analytics only)
 *   - onSignedIn: () => void (MEH-3661 — Google sign-in inside the modal
 *            succeeded. Defaults to onClose. A caller whose onClose drops a
 *            pending action passes its own, or the action it kept for after
 *            sign-in is lost a render before it can run.)
 *
 * Accessibility:
 *   - role="dialog" + aria-modal="true" + aria-labelledby
 *   - Focus moves to the primary CTA on open
 *   - Esc + backdrop click + X button all close
 *   - Body scroll locked while open (map/page under the modal doesn't scroll)
 *
 * Rendering: the overlay is portalled to <body>; z-[9500] is meaningful only at
 * the root stacking context — that is why the portal exists. Mounted in place it
 * was a sibling of the gallery heart, inside ImageGallery's `absolute … z-20`
 * overlay wrapper (:375 imaged, :216 imageless at z-10). `position` + a z token
 * makes that wrapper a stacking context, so 9500 only ever ranked INSIDE it, and
 * the page's own root-level chrome — the `sticky z-[1050]` Header
 * (Header.jsx:321) and the `sticky z-30` /producer tab bar
 * (ProducerDetail.jsx:161) — painted straight over the modal. Raising 9500 is
 * the tempting non-fix: a bigger number inside a capped context is still capped.
 * Repo precedent for the portal: FilterSheet.jsx (MEH-1075), ui/Popover.jsx
 * (MEH-1592). Measured in qa-meh-2215-stacking-probe.mjs (MEH-2215).
 *
 * The one non-obvious consequence, recorded because it is invisible in a diff:
 * a portal moves the DOM node, NOT the React tree, so clicks inside this modal
 * still bubble to whatever React ancestor mounted the FavoriteButton. That is
 * inert today — the ancestors between here and `#section-images` carry no
 * `onClick` (ImageGallery.jsx:240 and :375 are handler-free; the banner's
 * `openLightbox` at :323 is a SIBLING of the overlay wrapper, not an ancestor).
 * It stops being inert the moment someone adds a click handler to the gallery
 * wrapper: a tap on "אולי אחר כך" would then also open the lightbox.
 *
 * Z-index: z-[9500] — below chat widget (9999) + cookie banner (9998),
 * above everything else (map legend 800, controls 1000).
 *
 * @param {object} p
 * @param {boolean} p.open
 * @param {() => void} p.onClose
 * @param {string} [p.title]
 * @param {string} [p.message]
 * @param {string} [p.nextPath]
 * @param {string} [p.reason]
 * @param {() => void} [p.onSignedIn]
 */
export default function LoginPromptModal({
  open,
  onClose: onCloseProp,
  title,
  message,
  nextPath = "/",
  reason = "save",
  onSignedIn,
}) {
  const t = useTranslations("modals.login_prompt");
  const promptMessage = message ?? t("default_message");
  const primaryRef = useRef(null);
  const modalRef = useRef(null);

  // MEH-3661: every way out without signing in (X, «אולי אחר כך», Esc, the
  // scrim) is one "dismiss" — measured here, once, not at each control.
  // Read through a ref: callers pass a new arrow every render, and the
  // open-effect below must not re-run (and re-focus «היכנסו») on each one —
  // a re-render from the auth store would pull focus off the Google button.
  const dismissRef = useRef(() => {});
  dismissRef.current = () => {
    trackEvent("login_prompt_action", { reason, action: "dismiss" });
    onCloseProp();
  };
  const onClose = useCallback(() => dismissRef.current(), []);
  const handleSignedIn = () => {
    trackEvent("login_prompt_action", { reason, action: "google" });
    (onSignedIn ?? onCloseProp)();
  };
  useEffect(() => {
    if (open) trackEvent("login_prompt_shown", { reason });
  }, [open, reason]);

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

      // MEH-3271: focus that has left the panel (a click on the scrim, a
      // removed element) is pulled back in, not allowed to walk the page.
      const outside = !modalRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || outside)) {
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
  }, [open, onClose]); // onClose is stable (dismissRef) — runs once per open

  if (!open) return null;

  const loginHref = `/login?redirect=${encodeURIComponent(nextPath)}`;

  const overlay = (
    <div
      className="fixed inset-0 z-modal-interrupt flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-surface rounded-lg max-w-sm w-full p-6 shadow-xl text-center"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close_aria")}
          className="absolute top-3 end-3 w-11 h-11 flex items-center justify-center text-fg-muted hover:text-text transition rounded-lg focus-visible:ring-2 focus-visible:ring-primary"
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
          {title ?? t("title")}
        </h2>
        <p className="text-text mb-6 leading-relaxed">{promptMessage}</p>

        {/* MEH-3661: Google first, as on /login and /register — one tap and
            she never leaves the page. Hidden when Google is not configured. */}
        <LoginPromptGoogle onSuccess={handleSignedIn} />

        <a
          ref={primaryRef}
          href={loginHref}
          onClick={() => trackEvent("login_prompt_action", { reason, action: "login" })}
          className="block w-full bg-primary text-white py-3 rounded-full hover:bg-primary-dark transition font-medium focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {t("login_cta")}
        </a>
        <button
          type="button"
          onClick={onClose}
          className="block w-full mt-2 text-sm text-fg-muted hover:text-text transition py-2 rounded-lg focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("dismiss_cta")}
        </button>
      </div>
    </div>
  );

  // MEH-2215: `document` is safe to read here — the early `if (!open) return
  // null` above means this line is reached only when the modal is open, and
  // `open` is only ever set by a client-side click. Same reasoning as
  // FilterSheet's matchMedia note. The guard stays anyway, so a hypothetical
  // server-rendered `open` degrades to in-place rendering rather than crashing.
  return typeof document !== "undefined"
    ? createPortal(overlay, document.body)
    : overlay;
}
