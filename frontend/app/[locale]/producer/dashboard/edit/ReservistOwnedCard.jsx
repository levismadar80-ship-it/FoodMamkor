"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";

/**
 * Module:   ReservistOwnedCard
 * Purpose:  «עסק של מילואימניקים» — the owner declares that one of the owners
 *           serves in the IDF reserves. Self-declared: no document is asked
 *           for or stored. Drives a badge only, never ranking (ADR-027/030).
 * Does NOT: render the public badge (lib/badges.js); add a filter axis (none
 *           until ≥5 businesses carry it — Sapir 05/11).
 * Related:  GrassFedCard.jsx (same single-checkbox shape, same reasons).
 */
export default function ReservistOwnedCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.reservistOwned");
  // Reuse the standard PricingCard save chrome — no new save strings.
  // REUSES: DietaryScopeCard.jsx:53 — same decision, same reason (MEH-1508 §6.5).
  const tChrome = useTranslations("dashboard.producer.pricing");

  const seed = !!profile?.reservist_owned;
  const [checked, setChecked] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = checked !== seed;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("reservistOwned", dirty);
    return () => reportDirty("reservistOwned", false);
  }, [dirty, reportDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      // A single checkbox, not a yes/no radio pair: the column is a plain
      // Boolean defaulting to false (models.py — reservist_owned), so "no" and "not yet
      // answered" are the SAME stored value. A radio pair would render that
      // one value as two distinct states and claim an answer nobody gave —
      // the over-claim class labels.md exists to prevent.
      const payload = { reservist_owned: checked };
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || tChrome("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Chrome + heading live in the page.js sub-section header (MEH-1116). */}
      {/* MEH-1539 dashboard-field standard: a "where it appears" line is
          mandatory for every new owner field. */}
      <p className="text-xs text-fg-muted">{t("scope_helper")}</p>

      <label className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          name="reservist_owned"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            setSaved(false);
          }}
          className="w-4 h-4 accent-primary"
        />
        {t("label")}
      </label>

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-xs text-error" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? tChrome("saving") : saved ? tChrome("saved") : tChrome("save_cta")}
        </span>
      </button>
    </div>
  );
}
