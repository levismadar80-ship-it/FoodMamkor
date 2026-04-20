// MEH-50: שוק שישי mode — Thu 18:00 → Fri 14:00 Israel time.
// Pure function, no async, no deps. Uses Intl for correct DST handling.

export function isFridayMode() {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("friday_mode_override") === "1") {
      return true;
    }
  } catch {
    // localStorage unavailable (private mode, SSR context)
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "short",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === "weekday")?.value; // "Thu" / "Fri"
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    return (weekday === "Thu" && hour >= 18) || (weekday === "Fri" && hour < 14);
  } catch {
    return false;
  }
}

// Returns milliseconds until the next target time (weekday 0-6, hour).
// Used by the service worker scheduler.
export function msUntilNext(weekday, hour) {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentDay = dayNames.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "");
    const currentHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const currentMin = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    let daysAhead = weekday - currentDay;
    if (daysAhead < 0 || (daysAhead === 0 && (currentHour > hour || (currentHour === hour && currentMin > 0)))) {
      daysAhead += 7;
    }
    const minutesAhead = daysAhead * 24 * 60 + (hour - currentHour) * 60 - currentMin;
    return Math.max(0, minutesAhead * 60 * 1000);
  } catch {
    return 24 * 60 * 60 * 1000; // fallback: 24h
  }
}
