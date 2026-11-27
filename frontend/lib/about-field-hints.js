// @ts-check
/**
 * Module:   about-field-hints
 * Purpose:  Find facts a business wrote only in its «אודות» text (or that
 *           contradict a field), so the admin can move each one into the
 *           field the page, the filters and the JSON-LD actually read.
 * Touches:  nothing — pure, no I/O, no i18n (the panel owns the copy).
 * Does NOT: change the text or any field. It only points; the admin decides.
 *           It is a heuristic: a hint is «look here», never «this is wrong».
 * Related:  components/admin/AdminAboutFieldHints.jsx (the panel),
 *           lib/hours.js resolveStoreHours (store hours, location-aware).
 * History:  MEH-3953 (creation, after the 27/11 audit of the 14 live pages:
 *           payment, pickup, cutoffs, fees and workshops were text-only).
 */
import { resolveStoreHours } from "@/lib/hours";

/** @param {any} p */
const areas = (p) => (Array.isArray(p?.delivery_areas) ? p.delivery_areas : []);
/** @param {any} p */
/** null and undefined both mean «not filled». */
const isSet = (v) => v !== null && v !== undefined;
const locs = (p) => (Array.isArray(p?.locations) ? p.locations : []);

/**
 * Each rule: `says` — the text cue; `missing` — true when the matching field
 * does not hold it. A hint fires only when both are true.
 * @type {Array<{ code: string, says: RegExp, missing: (p: any) => boolean }>}
 */
const RULES = [
  {
    code: "payment",
    // A whole word only: «ביט» inside «ביטוח» or «ביטחון» is not a payment.
    says: /(?<![א-ת])[בו]?(?:ביט|פייבוקס|מזומן|אשראי)(?![א-ת])|העברה בנקאית/,
    missing: (p) => !(p.payment_info?.methods || []).length,
  },
  {
    code: "pickup",
    says: /לאסוף|איסוף עצמי/,
    missing: (p) => !p.offers_pickup && !p.has_physical_location && !p.by_arrangement,
  },
  {
    // A text that says the business is NOT kosher («לא כשר», «אינו כשר»,
    // «ללא כשרות») is not asking for a certificate, even when it also says
    // «השחיטה כשרה» — so it never fires. «כשר» counts only as its own word,
    // so «הכשרה מקצועית» (training) does not.
    code: "kashrut",
    says: /^(?![\s\S]*(?:לא|אינו|אינה|אינם|בלי|ללא) כשר)[\s\S]*(?:(?<![א-ת])[ו]?(?:כשר|כשרה|כשרים|כשרות)(?![א-ת])|בהשגחת)/,
    missing: (p) => !(p.kashrut_badges || []).length,
  },
  {
    code: "hours_24_7",
    says: /24\/7|24 שעות ביממה|מסביב לשעון/,
    missing: (p) => Boolean(resolveStoreHours(p)) && !/00:00-23:59|00:00-24:00/.test(String(resolveStoreHours(p))),
  },
  {
    code: "no_delivery",
    says: /אין משלוחים|בלי משלוחים/,
    missing: (p) => Boolean(p.offers_delivery),
  },
  {
    code: "delivery_fee",
    says: /דמי משלוח|תוספת (?:משלוח )?(?:של )?[\d.]{1,7} ?₪|[\d.]{1,7} ?₪ (?:ל)?משלוח/,
    missing: (p) => Boolean(p.offers_delivery) && !isSet(p.delivery_fee) && !areas(p).some((a) => isSet(a.delivery_fee)),
  },
  {
    code: "cutoff",
    says: /(?:מזמינים|הזמנות|להזמנה|למשלוח)[^.\n]{0,25}עד [^.\n]{0,15}\d{1,2}:\d{2}/,
    missing: (p) =>
      !p.order_window &&
      !areas(p).some((a) => a.order_cutoff_time) &&
      !locs(p).some((l) => l.order_cutoff_time),
  },
  {
    code: "lead_time",
    says: /זמן (?:ה)?(?:אספקה|משלוח)|(?:תוך|בתוך) \S+ (?:ימים|ימי עסקים)|יום עד \S+ ימים/,
    missing: (p) => !isSet(p.delivery_days_min) && !areas(p).some((a) => isSet(a.delivery_days_min)),
  },
  {
    code: "order_days",
    says: /(?:מקבלים|מקבלת) הזמנות ב?ימים/,
    missing: (p) => !p.order_window,
  },
  {
    code: "year",
    says: /(?:מאז|בשנת|הוקם ב|נוסד ב|באביב|בקיץ|בסתיו|בחורף)[ -]?(?:שנת )?(?:19|20)\d{2}/,
    missing: (p) => !p.established_year,
  },
  {
    code: "vegan",
    says: /טבעונ/,
    missing: (p) => !p.vegan_scope || p.vegan_scope === "unknown",
  },
  {
    // GET /admin/producers/{id} carries no has_listed_experience (only the
    // public listing does), so on the edit page this reads «not known» and
    // the copy says «if not listed yet» instead of claiming none exists.
    code: "experience",
    says: /סדנ|קטיף עצמי|סיור/,
    missing: (p) => !p.has_listed_experience && !p.has_upcoming_event,
  },
];

/** Every hint code, in display order. The panel's copy has one entry each. */
export const ABOUT_HINT_CODES = RULES.map((r) => r.code);

/**
 * @param {any} producer — the admin producer payload (ProducerAdminOut)
 * @returns {string[]} hint codes, in RULES order; [] when nothing to point at
 */
export function aboutFieldHints(producer) {
  const text = String(producer?.description || "");
  if (!text.trim()) return [];
  return RULES.filter((r) => r.says.test(text) && r.missing(producer)).map((r) => r.code);
}
