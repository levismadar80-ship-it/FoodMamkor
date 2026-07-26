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
