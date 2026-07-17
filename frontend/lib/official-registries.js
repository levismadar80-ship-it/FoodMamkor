/**
 * Module:   official-registries
 * Purpose:  Canonical URLs for the official government registries admins
 *           cross-check against when verifying producers (Tier-1 "מאומת").
 *           Named constants so the two admin surfaces don't inline-duplicate
 *           the strings (MEH-1271).
 * Does NOT: perform any lookup — links open the registry in a new tab for a
 *           manual cross-check. Auto cross-check is a separate post-launch ticket.
 * Related:  frontend/components/admin/ProducerForm.jsx (license link),
 *           frontend/app/[locale]/admin/kashrut/page.js (kashrut portal link),
 *           docs/VERIFICATION.md §"בדיקה מול מאגרים רשמיים".
 * History:  MEH-1271 (creation).
 */

// משרד הבריאות — מאגר יצרני מזון (בדיקת רישיון יצרן מול שם עסק / מספר רישיון).
export const HEALTH_MINISTRY_FOOD_REGISTRY_URL =
  "https://registries.health.gov.il/FoodManufacturers";

// gov.il — פורטל כשרות בתי עסק (הצלבת תעודת כשרות מול שם העסק ותוקף).
export const KASHRUT_BUSINESS_PORTAL_URL =
  "https://www.gov.il/he/pages/kashrut_portal";
