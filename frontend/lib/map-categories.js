/**
 * MEH-1453: category presentation data was consolidated into
 * lib/category-registry.js (the single import hub for both pin styles and
 * glyphs). This file is a temporary re-export shim so existing importers keep
 * working during the migration — Chunk 2 migrates every consumer to import
 * category-registry.js directly and deletes this file.
 *
 * DO NOT add new category data here — edit lib/category-registry.js.
 */
export {
  CATEGORY_STYLES,
  DEFAULT_CATEGORY_STYLE,
  CATEGORY_LEGEND,
  styleForProducer,
} from "@/lib/category-registry";
