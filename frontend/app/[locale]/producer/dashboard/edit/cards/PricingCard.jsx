"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/PricingCard
 * Purpose:  Price editor for the top product.
 * Does NOT: edit the top product's name: that lives on the product row (ProductsSection.jsx).
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// ============================================================
// MEH-1242 PR3: producer-facing price-range editor.
// Frontend-only gap: the owner whitelist (_PRODUCER_WRITABLE_FIELDS,
// producer_me.py) already accepts `price_range` + `top_product_name` — there
// was just no UI in the edit tab. Mirrors LocationCard's card/save/dirty/
// inline-error contract; persists via PUT /producers/me.
//
// MEH-2094: the top-product TEXT INPUT that stood beside the price is gone.
// The same column is now written from the product row that owns the name
// (components/ProductsSection.jsx), which is what makes the public page's
// exact-string match (ProducerSections.jsx:174-177) reliable instead of a
// coin flip on stray whitespace. This card is price-only and no longer sends
// `top_product_name` at all.
// DO NOT re-add a free-text top-product field here — it would reintroduce the
// double-entry the ticket removed, and a mismatch silently duplicates the
// product on the public page (MEH-1233 B4 dedup stops firing).
// REUSES: edit/cards.jsx LocationCard (save/dirty/reportDirty contract).
// ============================================================

// Exported for isolation tests (EditTabPricingCard.test.jsx).
export function PricingCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.pricing");
  const seedPrice = profile?.price_range ?? "";
  const [priceRange, setPriceRange] = useState(seedPrice);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = priceRange !== seedPrice;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("pricing", dirty);
    return () => reportDirty("pricing", false);
  }, [dirty, reportDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      // MEH-2094: price only. `top_product_name` is deliberately ABSENT rather
      // than sent as null — producer_me.py:577 applies model_dump(exclude_unset)
      // and :612-614 setattrs only what is present, so an omitted field is left
      // untouched. Sending null here would silently CLEAR the owner's signature
      // product every time she saved a price.
      const payload = { price_range: priceRange.trim() || null };
      await api.put("/producers/me", payload);
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      <p className="text-xs text-fg-muted mb-1">{t("subtitle")}</p>
      {/* MEH-1539 T2: what "top product" means + where the pair surfaces. */}
      <p className="text-xs text-fg-muted mb-4">{t("scope_helper")}</p>

      <div className="space-y-3">
        <Input
          type="text"
          label={t("field_price_range")}
          value={priceRange}
          maxLength={60}
          onChange={(e) => setPriceRange(e.target.value)}
          placeholder={t("price_range_placeholder")}
          helperText={t("price_hint")}
        />
      </div>

      {errorMsg && (
        <InlineMessage size="xs" className="mt-3 flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </InlineMessage>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !dirty}
        variant="primary" size="sm" className="mt-4"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </Button>
    </div>
  );
}

// ============================================================
// MEH-2142: `HoursCard` — the thin wrapper around HoursEditor — stood here and
// was REMOVED along with the editor it wrapped. Store hours moved to the
// per-location field the owner already edits in LocationsEditor; the
// business-level `Producer.opening_hours` is no longer owner-writable
// (producer_me.py) and survives only as a public-page read fallback.
//
// `frontend/lib/hours-serialize.js` is deliberately LEFT in place even though
// HoursEditor was its only UI consumer: it is a tested, reusable day-row
// serializer that `lib/order-window.js` cites as the model for its own, and
// deleting a library plus its suite is a cleanup this ticket has no AC for.
// Knip will list it as unused — that is a warn-only signal and an accurate one.
// ============================================================
