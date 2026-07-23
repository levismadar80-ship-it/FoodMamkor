"use client";

/**
 * Module:   WhatsThis
 * Purpose:  Reusable tap-to-expand "מה זה?" disclosure (MEH-1115). Business
 *           owners hit domain terms ("ערוץ ראשי", "טופס הזמנות", "קבוצת רכש")
 *           with no explanation at the point of decision — this renders a
 *           small text-link trigger that toggles a short explainer panel
 *           directly below it. Collapsed by default; tap/click only (no
 *           hover-only behavior — touch-first).
 * Does NOT: replace InfoTooltip.jsx — that is a hover/focus "i" bubble for
 *           one-line hints. WhatsThis is a persistent inline panel for
 *           multi-sentence explanations the owner may want to read slowly.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (ContactChannelsCard
 *           ×2), app/[locale]/producer/dashboard/group-buys/page.js (header).
 * History:  MEH-1115 (creation — producer-dashboard disclosure epic MEH-1089).
 */

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

export default function WhatsThis({ content, className = "", testId }) {
  const t = useTranslations("whats_this");
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={className}>
      {/* MEH-1115: ≥44px tap target (DESIGN.md interactive sizing minimums);
          text-sm meets the ≥14px interactive-text floor. */}
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="min-h-[44px] inline-flex items-center text-sm text-primary underline underline-offset-2 hover:text-primary-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-[6px] transition"
      >
        {t("trigger")}
      </button>
      {/* Kept mounted + hidden-toggled so aria-controls always resolves. */}
      <div
        id={panelId}
        hidden={!open}
        className="mb-2 max-w-prose rounded-[10px] bg-background-alt border border-border px-3 py-2 text-sm leading-relaxed text-text"
      >
        {content}
      </div>
    </div>
  );
}
