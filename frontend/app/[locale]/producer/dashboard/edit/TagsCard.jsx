"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";

/**
 * Module:   TagsCard
 * Purpose:  MEH-2729 — ONE «תגים» card for the attributes a business declares
 *           about itself, each under its own sub-heading. Today: «תזונה»
 *           (MEH-1508 — whole-catalog vegan / vegetarian + gluten facility) and
 *           «גידול במרעה» (MEH-1851 row 23 — grass_fed). A future declared tag
 *           is a new sub-section HERE, not a new accordion card: Sapir (6/11)
 *           saw the products group growing one card per tag. Same pattern as
 *           Google Business Profile's attribute groups and Airbnb's amenity
 *           categories — one place, sub-headings inside.
 * Does NOT: hold kashrut (a certificate we check — «רישיון וכשרות») or the
 *           reservist switch (part of the owner's story — OwnerStoryCard);
 *           render any public badge or chip (lib/badges.js, filter-taxonomy);
 *           own the accordion chrome (page.js wraps it, MEH-1116).
 * Related:  backend ProducerUpdate validators (schemas.py) enforce the enums;
 *           lib/map-chips.js TOGGLE_CHIPS grass_fed (the consumer string the
 *           checkbox label must match).
 * History:  MEH-2729 (creation) — merges DietaryScopeCard (MEH-1508 ch2 Phase
 *           B) and GrassFedCard (MEH-1851 row 23), whose copy is reused as is.
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

/** How many declared tags are ON — drives the card's summary line. */
export function activeTagCount(profile) {
  if (!profile) return 0;
  return [
    profile.vegan_scope === "all",
    profile.vegetarian_scope === "all",
    profile.gluten_free_facility === "dedicated",
    !!profile.grass_fed,
  ].filter(Boolean).length;
}

export default function TagsCard({ profile, onSave, reportDirty = () => {} }) {
  const tDiet = useTranslations("dashboard.producer.dietaryScope");
  const tGrass = useTranslations("dashboard.producer.grassFed");
  // Reuse the standard PricingCard save chrome — no new save strings (§6.5).
  const tChrome = useTranslations("dashboard.producer.pricing");

  const seed = {
    vegan_scope: profile?.vegan_scope ?? "unknown",
    vegetarian_scope: profile?.vegetarian_scope ?? "unknown",
    gluten_free_facility: profile?.gluten_free_facility ?? "unknown",
    grass_fed: !!profile?.grass_fed,
  };
  const [vegan, setVegan] = useState(seed.vegan_scope);
  const [vegetarian, setVegetarian] = useState(seed.vegetarian_scope);
  const [gluten, setGluten] = useState(seed.gluten_free_facility);
  const [grassFed, setGrassFed] = useState(seed.grass_fed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // One «נשמר» timer at a time: an earlier save's timer must not clear a newer
  // confirmation, and none may fire after unmount.
  const savedTimer = useRef(null);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const [errorMsg, setErrorMsg] = useState(null);

  const current = {
    vegan_scope: vegan,
    vegetarian_scope: vegetarian,
    gluten_free_facility: gluten,
    grass_fed: grassFed,
  };
  // Only the fields that changed are sent: PUT /producers/me is shared by
  // every card on the page, and a key this card did not touch must not
  // overwrite a value another surface saved in the meantime.
  const changed = Object.fromEntries(
    Object.entries(current).filter(([k, v]) => v !== seed[k]),
  );
  const dirty = Object.keys(changed).length > 0;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("tags", dirty);
    return () => reportDirty("tags", false);
  }, [dirty, reportDirty]);

  // Any edit clears the «נשמר» confirmation — radios and the checkbox alike.
  const edit = (setter) => (v) => {
    setter(v);
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = changed;
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || tChrome("save_error"));
    } finally {
      setSaving(false);
    }
  };

  // YES → all, NO → some. 'unknown' is the not-yet-answered state (MEH-1508
  // §6.2): neither radio is selected until the owner answers.
  const yesNo = [
    ["all", tDiet("opt_yes")],
    ["some", tDiet("opt_no")],
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-4" data-testid="tags-section-diet">
        <h3 className="text-sm font-bold text-primary">{tDiet("heading")}</h3>
        <p className="text-xs text-fg-muted">{tDiet("helper")}</p>
        {/* MEH-1597: the payoff half — which surface the answers drive. */}
        <p className="text-xs text-fg-muted">{tDiet("scope_helper")}</p>
        <RadioGroup
          legend={tDiet("q_vegan")}
          name="vegan_scope"
          value={vegan}
          options={yesNo}
          onChange={edit(setVegan)}
        />
        <RadioGroup
          legend={tDiet("q_vegetarian")}
          name="vegetarian_scope"
          value={vegetarian}
          options={yesNo}
          onChange={edit(setVegetarian)}
        />
        <RadioGroup
          legend={tDiet("q_gluten")}
          name="gluten_free_facility"
          value={gluten}
          options={[
            ["dedicated", tDiet("gluten_dedicated")],
            ["shared", tDiet("gluten_shared")],
            ["unknown", tDiet("opt_unknown")],
          ]}
          onChange={edit(setGluten)}
        />
      </section>

      <section
        className="space-y-3 border-t border-border pt-4"
        data-testid="tags-section-grass-fed"
      >
        <h3 className="text-sm font-bold text-primary">{tGrass("heading")}</h3>
        {/* MEH-1539 dashboard-field standard: a "where it appears" line. */}
        <p className="text-xs text-fg-muted">{tGrass("scope_helper")}</p>
        {/* A single checkbox, not a yes/no pair: the column is a plain Boolean
            defaulting to false, so "no" and "not answered" are one value. */}
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="grass_fed"
            checked={grassFed}
            onChange={(e) => {
              setGrassFed(e.target.checked);
              setSaved(false);
            }}
            className="w-4 h-4 accent-primary"
          />
          {tGrass("label")}
        </label>
      </section>

      {errorMsg && (
        <p className="flex items-center gap-1.5 text-xs text-danger-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !dirty}
        variant="primary" size="sm"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? tChrome("saving") : saved ? tChrome("saved") : tChrome("save_cta")}
        </span>
      </Button>
    </div>
  );
}
