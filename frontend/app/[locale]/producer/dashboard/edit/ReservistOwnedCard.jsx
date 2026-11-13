"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { BADGE_CONFIG } from "@/lib/badges";
import { useBadgeCopy } from "@/lib/use-badge-copy";
import { badgeIcon } from "@/lib/chip-icons";

/**
 * Module:   ReservistOwnedCard
 * Purpose:  «עסק של מילואימניקים» — the owner declares that one of the owners
 *           serves in the IDF reserves. Self-declared: no document is asked
 *           for or stored. Drives a badge only, never ranking (ADR-027/030).
 * Shape:    MEH-2699 — a switch that saves on toggle (no Save button), shown
 *           inside the «מאחורי העסק» accordion rather than as its own card.
 *           Google Business Profile / Yelp present this claim as one yes/no
 *           row inside an identity group; a whole card + a two-step
 *           check-then-save for one boolean was the friction Sapir flagged.
 *           Instant save is safe here because the write is one boolean and a
 *           failed PUT rolls the switch back.
 * Does NOT: render the public badge (lib/badges.js); add a filter axis (none
 *           until ≥5 businesses carry it — Sapir 05/11); report dirty state —
 *           there is never an unsaved value to lose.
 * Related:  page.js (mounted under OwnerStoryCard), TagsCard.jsx.
 */
export default function ReservistOwnedCard({ profile, onSave }) {
  const t = useTranslations("dashboard.producer.reservistOwned");
  const tChrome = useTranslations("dashboard.producer.pricing");

  const [checked, setChecked] = useState(!!profile?.reservist_owned);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const toggle = async () => {
    if (saving) return;
    const next = !checked;
    setChecked(next);
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      // A single on/off, not a yes/no pair: the column is a plain Boolean
      // defaulting to false, so "no" and "not answered" are the same stored
      // value (labels.md over-claim class).
      const payload = { reservist_owned: next };
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setChecked(!next);
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || tChrome("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const badge = useBadgeCopy()(BADGE_CONFIG.reservist_owned);
  const icon = badgeIcon("reservist_owned");

  return (
    <div data-testid="reservist-owned-row" className="space-y-2 border-t border-border pt-4">
      {/* Same switch as CoverageCtaToggle.jsx (house pattern): 40×24 track
          inside a 44×44 tap target, knob on logical start/end. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="reservist-owned-label" className="text-sm font-medium text-text">
            {t("label")}
          </p>
          {/* MEH-1539 dashboard-field standard: the "where it appears" line. */}
          <p id="reservist-owned-helper" className="text-xs text-fg-muted mt-1">
            {t("scope_helper")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby="reservist-owned-label"
          aria-describedby="reservist-owned-helper"
          // aria-disabled, not disabled: a disabled button drops keyboard /
          // screen-reader focus for the length of the PUT; toggle() already
          // ignores clicks while saving.
          aria-disabled={saving}
          onClick={toggle}
          data-testid="reservist-owned-switch"
          className="group relative shrink-0 inline-flex items-center justify-center min-h-touch min-w-touch -my-2.5 focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className={`relative block w-10 h-6 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-primary/40 ${checked ? "bg-primary" : "bg-border"}`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-surface shadow-sm transition-all ${
                checked ? "end-1" : "start-1"
              }`}
            />
          </span>
        </button>
      </div>

      {checked && (
        <span
          data-testid="reservist-owned-preview"
          className="inline-flex items-center gap-1 px-2.5 text-xs py-0.5 rounded-full font-medium bg-surface-card text-green-700 border border-border"
        >
          {icon && <span aria-hidden="true" className="inline-flex">{icon}</span>}
          {badge.label}
        </span>
      )}

      <p aria-live="polite" className="text-xs text-primary min-h-[1rem]">
        {saved ? tChrome("saved") : ""}
      </p>

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-xs text-error" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}
    </div>
  );
}
