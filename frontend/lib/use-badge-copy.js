"use client";
/**
 * useBadgeCopy — the one reader of a badge's words (MEH-2740, MEH-1687 phase 7b).
 *
 * lib/badges.js decides WHICH badges a producer earns; the words for each live
 * in messages/{he,en}.json under `badges.<key>.label` / `badges.<key>.tooltip`,
 * so the English site no longer shows Hebrew pills. Every surface that renders
 * a badge passes it through the returned function, which adds `label` and
 * `tooltip` to a copy of the entry — the shape the renderers already read.
 */
import { useTranslations } from "next-intl";

export function useBadgeCopy() {
  const t = useTranslations("badges");
  return (badge) =>
    badge ? { ...badge, label: t(`${badge.key}.label`), tooltip: t(`${badge.key}.tooltip`) } : badge;
}
