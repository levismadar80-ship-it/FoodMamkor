"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

/**
 * OnboardingTip — small tooltip bubble for first-visit tours.
 *
 * placement="inline"  → renders as a block in the document flow (homepage steps).
 * placement="above"   → expects parent to be relative; positions itself absolute
 *                       above the parent element (BottomNav tab steps).
 *
 * The "×" close button uses logical end-3 (visual left in RTL) so it sits
 * away from the right-aligned Hebrew text without overlap. (rtl-ok: comment-only)
 */
export default function OnboardingTip({
  show,
  text,
  cta,
  onNext,
  onDismiss,
  placement = "inline",
}) {
  const t = useTranslations("modals.onboarding_tip");
  const ctaLabel = cta ?? t("cta_default");
  const isAbove = placement === "above";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: isAbove ? 6 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isAbove ? 6 : -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={
            isAbove
              ? "absolute bottom-full mb-3 end-0 z-[900] w-[220px]"
              : "relative z-[900] mb-4"
          }
          role="status"
          aria-live="polite"
          dir="rtl"
        >
          <div className="bg-primary-dark text-white rounded-[12px] px-4 py-3 shadow-xl text-start text-sm">
            <button
              type="button"
              onClick={onDismiss}
              className="absolute top-2 end-3 text-white/60 hover:text-white text-base leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg"
              aria-label={t("close_aria")}
            >
              ×
            </button>
            <p className="pe-5 leading-snug">{text}</p>
            <button
              type="button"
              onClick={onNext ?? onDismiss}
              className="mt-2 text-xs font-semibold text-green-50 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-lg"
            >
              {ctaLabel} ←
            </button>
          </div>
          {/* Caret — points down toward the BottomNav tab */}
          {isAbove && (
            <div
              className="absolute -bottom-1.5 end-5 w-3 h-3 bg-primary-dark rotate-45"
              aria-hidden="true"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
