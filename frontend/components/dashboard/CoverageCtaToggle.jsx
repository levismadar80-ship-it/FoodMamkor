"use client";

/**
 * Module:   CoverageCtaToggle
 * Purpose:  The owner's on/off for the public «לא מגיעים אליך?» CTA on her
 *           page. Saves immediately (one field, no form), like the alert
 *           switches in AlertPrefsPanel.
 * Touches:  PUT /producers/me { coverage_cta_enabled } — the column since
 *           MEH-1677; CoverageRequestCta.jsx already hides itself on false.
 * Does NOT: decide where the CTA shows — CoverageRequestCta owns that.
 * History:  MEH-1676 (creation; copy approved 03/11, Sapir's delegation).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

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
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="coverage-cta-label"
        aria-describedby="coverage-cta-helper"
        disabled={saving}
        onClick={toggle}
        data-testid="coverage-cta-switch"
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
          on ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
            on ? "end-1" : "start-1"
          }`}
        />
      </button>
    </div>
  );
}
