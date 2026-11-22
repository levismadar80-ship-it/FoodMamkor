// @ts-check
"use client";

/**
 * Module:   GroupBuySafetyFields
 * Purpose:  Two things a participant needs to collect safely (MEH-3610): the
 *           branch she picks up from, and the allergens the business
 *           declares — the same two a rescue bag carries. Used by the create
 *           form and by the owner's settings on a running group.
 * Touches:  GET /producers/me/locations (the business's own branches).
 * Does NOT: send anything — the form around it does (POST /group-buys,
 *           PATCH /group-buys/{id}/settings).
 * Related:  components/AllergenPicker.jsx (shared with the bag) ·
 *           services/group_buy_pickup_place.py (the branch must be hers)
 * History:  MEH-3610 (creation)
 *
 * @param {{
 *   idPrefix: string,
 *   allergens: string[],
 *   onAllergens: (next: string[]) => void,
 *   locationId: string,
 *   onLocation: (id: string) => void,
 *   showPlace?: boolean,
 * }} props
 */
import { useTranslations } from "next-intl";
import Select from "@/components/ui/Select";
import AllergenPicker from "@/components/AllergenPicker";
import { useUserApi } from "@/lib/use-api";

/** @param {any} loc */
function placeName(loc) {
  const where = [loc.address, loc.city].filter(Boolean).join(", ");
  return [loc.label, where].filter(Boolean).join(" — ") || loc.city || "";
}

export default function GroupBuySafetyFields({ idPrefix, allergens, onAllergens, locationId, onLocation, showPlace = true }) {
  const t = useTranslations("group_buys.dashboard.safety");
  const { data } = useUserApi(showPlace ? "/producers/me/locations" : null);
  const locations = Array.isArray(data) ? data : [];
  const headingId = `${idPrefix}-allergens-heading`;
  return (
    <div className="space-y-4" data-testid={`${idPrefix}-safety`}>
      {showPlace && locations.length > 0 && (
        <Select
          label={t("place_label")}
          helperText={t("place_help")}
          value={locationId}
          onChange={(e) => onLocation(e.target.value)}
          data-testid={`${idPrefix}-place`}
        >
          <option value="">{t("place_none")}</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{placeName(loc)}</option>
          ))}
        </Select>
      )}
      <div>
        <p id={headingId} className="text-sm text-text font-medium">{t("allergens_title")}</p>
        <p className="text-xs text-fg-muted mb-2">{t("allergens_help")}</p>
        <AllergenPicker value={allergens} onChange={onAllergens} labelledBy={headingId} testId={`${idPrefix}-allergen`} groupTestId={`${idPrefix}-allergens`} />
      </div>
    </div>
  );
}
