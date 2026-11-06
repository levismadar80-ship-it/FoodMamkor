"use client";
/**
 * MEH-2748 — React hook over lib/chip-copy.js. Returns a stable
 * `withCopy(chip)` that adds `label` / `subtext` from messages to a registry
 * chip (FILTER_AXES or map CATEGORY_CHIPS) and leaves any chip that already
 * has a label untouched.
 */
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { resolveChipCopy } from "@/lib/chip-copy";

export function useChipCopy() {
  const t = useTranslations();
  return useCallback((chip) => resolveChipCopy(t, chip), [t]);
}
