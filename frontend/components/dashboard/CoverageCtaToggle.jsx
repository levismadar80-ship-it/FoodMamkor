"use client";

/**
 * Module:   CoverageCtaToggle
 * Purpose:  The owner's on/off for the public «לא מגיעים אליך?» CTA on her
 *           page. Saves immediately (one field, no form), like the alert
 *           switches in AlertPrefsPanel.
 * Touches:  PUT /producers/me { coverage_cta_enabled } — the column since
 *           MEH-1677; CoverageRequestCta.jsx already hides itself on false.
 * Does NOT: decide where the CTA shows — CoverageRequestCta owns that. The
 *           switch only renders when the owner's page CAN show the CTA, read
 *           from the same gate (lib/delivery-coverage.js coverageCtaReachable).
 * History:  MEH-1676 (creation; copy approved 03/11, Sapir's delegation;
 *           03/11 ערב: 44×44 hit area + hidden where the CTA never renders).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { coverageCtaReachable } from "@/lib/delivery-coverage";

export default function CoverageCtaToggle({ producer, onSaved }) {
  const t = useTranslations("dashboard.producer.coverage_cta");
  const tErr = useTranslations("dashboard.producer.contact_channels");
  // The column defaults true; an older payload without the key keeps the CTA.
  const [on, setOn] = useState(producer?.coverage_cta_enabled !== false);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setSaving(true);
    try {
      await api.put("/producers/me", { coverage_cta_enabled: next });
      onSaved?.({ coverage_cta_enabled: next });
    } catch {
      setOn(!next);
      showToast.error(tErr("save_error"));
    } finally {
      setSaving(false);
    }
  };

  // An owner whose page never renders the CTA (no delivery, nationwide with no
  // exclusions, no named areas, or no WhatsApp phone) gets no switch: turning
  // it on or off would change nothing she can see. After the hooks above, so
  // the hook order is the same on every render.
  if (!coverageCtaReachable(producer)) return null;

  return (
    <div className="flex items-start justify-between gap-4 py-3" data-testid="coverage-cta-toggle">
      <div className="min-w-0">
        <p id="coverage-cta-label" className="text-sm font-medium text-text">
          {t("label")}
        </p>
        <p id="coverage-cta-helper" className="text-xs text-fg-muted mt-1">
          {t("helper")}
        </p>
      </div>
      {/* The track stays 40×24; the button around it is the 44×44 tap
          target (03/11 ערב, MEH-1687 E: 44 on mobile, no exceptions). The
          negative block margin keeps the row height it had. */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="coverage-cta-label"
        aria-describedby="coverage-cta-helper"
        disabled={saving}
        onClick={toggle}
        data-testid="coverage-cta-switch"
        className="group relative shrink-0 inline-flex items-center justify-center min-h-touch min-w-touch -my-2.5 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={`relative block w-10 h-6 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary/40 ${on ? "bg-primary" : "bg-border"}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-surface shadow-sm transition-all ${
              on ? "end-1" : "start-1"
            }`}
          />
        </span>
      </button>
    </div>
  );
}
