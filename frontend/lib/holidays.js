/**
 * MEH-55: Israel food holiday calendar.
 * Holidays include advance window (7 days before) and active period.
 * Used by: HolidayBanner (homepage), producer dashboard hint.
 */

export const HOLIDAYS = {
  pesach: {
    name: "פסח",
    emoji: "🫓",
    start: "2026-04-01",
    end: "2026-04-09",
    tagline: "מצאי מוצרים כשרים לפסח ממקורות מקומיים",
    cta: "הצגת עסקים לפסח",
    searchParams: { q: "כשר לפסח" },
    featured: ["ירקות טריים", "פירות", "שמן זית", "דבש", "בשר"],
    dashboardHint: "פסח מתקרב — יש לך מוצרים כשרים לפסח? עדכנו עכשיו",
    color: "#B45309", // amber-700
  },
  shavuot: {
    name: "שבועות",
    emoji: "🧀",
    start: "2026-05-22",
    end: "2026-05-23",
    tagline: "גבינות ומוצרי חלב איכותיים לחג",
    cta: "הצגת גבינות ומוצרי חלב",
    searchParams: { q: "גבינות" },
    featured: ["גבינות", "חלב", "יוגורט", "שמנת"],
    dashboardHint: "שבועות מתקרב — ספקי חלב וגבינות: הוסיפו את המוצרים שלך",
    color: "#1D4ED8", // blue-700
  },
  rosh_hashana: {
    name: "ראש השנה",
    emoji: "🍎",
    start: "2026-09-20",
    end: "2026-09-22",
    tagline: "תפוח ודבש, רימון ועוד — מהמיטב המקומי",
    cta: "הצגת מוצרי ראש השנה",
    searchParams: { q: "דבש" },
    featured: ["דבש", "תפוחים", "רימון", "תמרים"],
    dashboardHint: "ראש השנה מתקרב — תפוחים, דבש, רימון: עדכנו את הקטלוג",
    color: "#B45309",
  },
  sukkot: {
    name: "סוכות",
    emoji: "🌿",
    start: "2026-10-05",
    end: "2026-10-12",
    tagline: "פירות הארץ ומוצרי עונה טריים",
    cta: "הצגת מוצרי סוכות",
    searchParams: { q: "פירות" },
    featured: ["פירות", "ירקות", "אתרוג", "ארבעת המינים"],
    dashboardHint: "סוכות מתקרב — פירות הארץ בעונה: עדכנו את המוצרים שלך",
    color: "#15803D",
  },
  chanuka: {
    name: "חנוכה",
    emoji: "🕎",
    start: "2026-12-14",
    end: "2026-12-22",
    tagline: "שמן זית כתית מהמיטב — הדליקי אור",
    cta: "הצגת שמן זית",
    searchParams: { q: "שמן זית" },
    featured: ["שמן זית", "שמן זית כתית"],
    dashboardHint: "חנוכה מתקרב — יש לך שמן זית? חג השמן הוא ההזדמנות שלך",
    color: "#1D4ED8",
  },
  tu_bishvat: {
    name: "ט\"ו בשבט",
    emoji: "🌳",
    start: "2027-02-02",
    end: "2027-02-02",
    tagline: "דבש, פירות יבשים ופירות הארץ",
    cta: "הצגת מוצרי ט׳ו בשבט",
    searchParams: { q: "דבש" },
    featured: ["דבש", "פירות יבשים", "שקדים", "תאנים"],
    dashboardHint: "ט׳ו בשבט מתקרב — מוצרי ארץ ישראל: עדכנו את הקטלוג",
    color: "#15803D",
  },
};

const BANNER_ADVANCE_DAYS = 7;
const DASHBOARD_ADVANCE_DAYS = 14;

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayMs(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
}

/**
 * Returns the active or upcoming holiday for the given date.
 * Pass overrideKey to force a specific holiday (admin testing).
 */
export function getActiveHoliday(overrideKey = null, today = new Date()) {
  if (overrideKey && HOLIDAYS[overrideKey]) {
    return { ...HOLIDAYS[overrideKey], key: overrideKey, upcoming: false };
  }

  const now = todayMs(today);
  const advance = BANNER_ADVANCE_DAYS * 86400000;

  for (const [key, holiday] of Object.entries(HOLIDAYS)) {
    const start = parseLocalDate(holiday.start).getTime();
    const end = parseLocalDate(holiday.end).getTime() + 86400000; // inclusive
    if (now >= start - advance && now < end) {
      return { ...holiday, key, upcoming: now < start };
    }
  }
  return null;
}

/**
 * Returns the next upcoming holiday within advanceDays, for the dashboard hint.
 * Also returns daysUntil (negative = already active).
 */
export function getUpcomingHoliday(advanceDays = DASHBOARD_ADVANCE_DAYS, today = new Date()) {
  const now = todayMs(today);
  const advance = advanceDays * 86400000;

  for (const [key, holiday] of Object.entries(HOLIDAYS)) {
    const start = parseLocalDate(holiday.start).getTime();
    const end = parseLocalDate(holiday.end).getTime() + 86400000;
    if (now >= start - advance && now < end) {
      const daysUntil = Math.ceil((start - now) / 86400000);
      return { ...holiday, key, upcoming: now < start, daysUntil };
    }
  }
  return null;
}
