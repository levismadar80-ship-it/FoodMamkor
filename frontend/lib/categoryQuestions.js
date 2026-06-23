/**
 * Category-aware WhatsApp question defaults (MEH-210 Phase 1).
 * Keys are the Hebrew category names as stored in the DB (seed_data.py CATEGORIES list).
 * Phase 2 (MEH-210): custom_questions on the producer overrides these defaults.
 */

export const CATEGORY_QUESTIONS = {
  "בשר": [
    "מה יש במלאי השבוע?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "חלב וגבינות": [
    "אילו גבינות חדשות?",
    "יש לבן השבוע?",
    "איך מזמינים?",
  ],
  "ביצים": [
    "יש ביצים חופש השבוע?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "לחמים ואפייה": [
    "אילו לחמים יש השבוע?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  // MEH-743: honey split off; same generic Q-set duplicated for both.
  "שמנים": [
    "מה יש במלאי?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "דבש": [
    "מה יש במלאי?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "ירקות": [
    "מה עונתי עכשיו?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "פירות": [
    "מה עונתי עכשיו?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "מותססים וכבושים": [
    "מה חדש אצלך?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "מוצרים מוכנים": [
    "מה חדש אצלך?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "צמחי מרפא ותוספים": [
    "איך מזמינים?",
    "יש ייעוץ?",
    "יש משלוח?",
  ],
  "סבונים טבעיים": [
    "מה חדש אצלך?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "קרמים ושמנים": [
    "מה חדש אצלך?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
  "נרות וארומה": [
    "מה חדש אצלך?",
    "איך מזמינים?",
    "יש משלוח?",
  ],
};

export const DEFAULT_QUESTIONS = ["איך מזמינים?", "יש משלוח?", "מה חדש אצלך?"];

export function getProducerQuestions(producer) {
  if (producer.custom_questions?.length > 0) return producer.custom_questions;
  const primaryCategory = producer.categories?.[0]?.name;
  return CATEGORY_QUESTIONS[primaryCategory] ?? DEFAULT_QUESTIONS;
}
