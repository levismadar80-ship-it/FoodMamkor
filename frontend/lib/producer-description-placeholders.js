// MEH-532: seasonal Hebrew placeholders for the producer-registration
// description field. One concrete first-person story per season, rotated
// by the local month so the placeholder feels current when the form loads.
//
// Month windows (Date.getMonth() is 0-indexed):
//   Spring 2..4   (March-May)
//   Summer 5..7   (June-August)
//   Fall   8..10  (September-November)
//   Winter else  (December-February)

export const SPRING_PLACEHOLDER =
  "במשק שלי בעמק יזרעאל, אני מגדלת תות שדה אורגני בעבודת יד מאז 2018. כשהתות הראשון של העונה מבשיל, אני יודעת שהאביב הגיע. כל בוקר אני קוטפת רק את הבשלים, וכל קונה מקבלת קופסה שנקטפה לה הבוקר.";

export const SUMMER_PLACEHOLDER =
  "החווה שלנו ברמת הגולן מתמחה בעגבניות שריגוניות שגדלות בשטח פתוח, בלי חממה. הקיץ שלנו ארוך וחם — וזה בדיוק מה שעגבניות אוהבות. כל עגבנייה נקטפת ביד ברגע השיא של הבשלות.";

export const FALL_PLACEHOLDER =
  "במכוורת שלי בגליל המערבי, אני מייצרת דבש מ-50 כוורות שגדלות בין שדות פרא. בסתיו, כשהאקליפטוס מתחיל לפרוח, אני מתחילה את הקטיף. הדבש שלי הוא תיעוד של עונה שלמה — של מה שהדבורים שלי טעמו.";

export const WINTER_PLACEHOLDER =
  "אני אופה לחמים ממחמצת בת 12 שנים בקיבוץ עינת. החורף הוא העונה שלי — הקור גורם למחמצת לעבוד לאט, והלחמים יוצאים יותר מורכבים. כל ליל שישי, אני אופה 80 לחמים — חצי לקבלות מראש, חצי לחנות.";

export function getSeasonalPlaceholder(now = new Date()) {
  const month = now.getMonth();
  if (month >= 2 && month <= 4) return SPRING_PLACEHOLDER;
  if (month >= 5 && month <= 7) return SUMMER_PLACEHOLDER;
  if (month >= 8 && month <= 10) return FALL_PLACEHOLDER;
  return WINTER_PLACEHOLDER;
}
