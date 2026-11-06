/**
 * Purpose:  MEH-2748 — attach the words to a filter chip at render time.
 *           lib/filter-taxonomy.js (FILTER_AXES) and lib/map-chips.js
 *           (CATEGORY_CHIPS) hold keys and wiring only; the consumer strings
 *           live in messages/{he,en}.json:
 *             filter_axes.<key>.label / .subtext   (toggle axes)
 *             map_category_chips.<key>             (/map aggregate categories)
 * Contract: a chip that already carries a `label` (a DB category, the city
 *           chip, a translated "all" sentinel) is returned untouched, so one
 *           resolver can sit in front of every mixed chip row.
 * Related:  lib/use-chip-copy.js (the React hook) ·
 *           app/[locale]/producers/diet/[dietSlug]/page.js (server use).
 */
import { FILTER_AXES } from "@/lib/filter-taxonomy";
import { CATEGORY_CHIPS } from "@/lib/map-chips";

// Derived, not restated: the /map aggregate category chips own their keys.
const MAP_CATEGORY_KEYS = new Set(CATEGORY_CHIPS.map((c) => c.key));

/**
 * A registry chip whose key is in neither registry is returned unlabeled;
 * ChipCopyMessages.test.jsx pins that every FILTER_AXES and CATEGORY_CHIPS
 * key has a he + en message (and that `hasSubtext` matches), so that path is
 * a test failure, not a blank pill.
 *
 * @param {(key: string) => string} t  a ROOT-namespace translator
 * @param {object} chip
 */
export function resolveChipCopy(t, chip) {
  if (!chip || chip.label != null) return chip;
  const axis = FILTER_AXES[chip.key];
  if (axis) {
    return {
      ...chip,
      label: t(`filter_axes.${chip.key}.label`),
      subtext: axis.hasSubtext ? t(`filter_axes.${chip.key}.subtext`) : null,
    };
  }
  if (MAP_CATEGORY_KEYS.has(chip.key)) {
    return { ...chip, label: t(`map_category_chips.${chip.key}`) };
  }
  return chip;
}

/** The label alone, for a bare axis key (diet page H1, aria strings). */
export function axisLabel(t, key) {
  return FILTER_AXES[key] ? t(`filter_axes.${key}.label`) : null;
}
