"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";

/**
 * Module:   DietaryScopeCard
 * Purpose:  MEH-1508 ch2 Phase B — owner declares business-level dietary scope.
 *           Two YES/NO questions (is the WHOLE catalog vegan / vegetarian) map
 *           to all|some; the gluten question is 3-way facility state
 *           (dedicated|shared|unknown). Writes producers.{vegan_scope,
 *           vegetarian_scope, gluten_free_facility} via PUT /producers/me.
 * Does NOT: render any public chip / badge / filter (chunk 3); touch lactose
 *           (§6.3 — question cut, column stays 'unknown'); own the accordion
 *           chrome (page.js wraps it, MEH-1116).
 * Related:  cards.jsx PricingCard (save/dirty contract; its chrome namespace is
 *           reused for the save button per §6.5); backend ProducerUpdate
 *           validators (schemas.py) enforce the enum server-side.
 * History:  MEH-1508 chunk 2 Phase B (creation). Copy locked in Linear §6.5.
 */

// Module-level so it is not recreated each render (no radio remount/focus loss).
function RadioGroup({ legend, name, value, options, onChange }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-text">{legend}</legend>
      <div className="flex flex-col gap-1.5">
        {options.map(([v, label]) => (
          <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="w-4 h-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function DietaryScopeCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.dietaryScope");
  // §6.5: reuse the standard PricingCard save chrome — no new save strings.
  const tChrome = useTranslations("dashboard.producer.pricing");

  const seedVegan = profile?.vegan_scope ?? "unknown";
  const seedVegetarian = profile?.vegetarian_scope ?? "unknown";
  const seedGluten = profile?.gluten_free_facility ?? "unknown";
  const [vegan, setVegan] = useState(seedVegan);
  const [vegetarian, setVegetarian] = useState(seedVegetarian);
  const [gluten, setGluten] = useState(seedGluten);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty =
    vegan !== seedVegan || vegetarian !== seedVegetarian || gluten !== seedGluten;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("dietaryScope", dirty);
    return () => reportDirty("dietaryScope", false);
  }, [dirty, reportDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      // Send all three: valid enum values (incl. 'unknown') pass the server
      // validator; lactose is never written (§6.3), stays DB-default 'unknown'.
      const payload = {
        vegan_scope: vegan,
        vegetarian_scope: vegetarian,
        gluten_free_facility: gluten,
      };
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

  // YES → all, NO → some. 'unknown' is the not-yet-answered state (§6.2): neither
  // radio is selected until the owner answers.
  const yesNo = [
    ["all", t("opt_yes")],
    ["some", t("opt_no")],
  ];

  return (
    <div className="space-y-4">
      {/* Chrome + heading live in the page.js sub-section header (MEH-1116). */}
      <p className="text-xs text-fg-muted">{t("helper")}</p>

      <RadioGroup
        legend={t("q_vegan")}
        name="vegan_scope"
        value={vegan}
        options={yesNo}
        onChange={setVegan}
      />
      <RadioGroup
        legend={t("q_vegetarian")}
        name="vegetarian_scope"
        value={vegetarian}
        options={yesNo}
        onChange={setVegetarian}
      />
      <RadioGroup
        legend={t("q_gluten")}
        name="gluten_free_facility"
        value={gluten}
        options={[
          ["dedicated", t("gluten_dedicated")],
          ["shared", t("gluten_shared")],
          ["unknown", t("opt_unknown")],
        ]}
        onChange={setGluten}
      />

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-xs text-red-600" role="alert">
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
