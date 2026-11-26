// @ts-check
// MEH-50: שוק שישי mode — Thu 18:00 → Fri 14:00 Israel time.
// Pure function, no async, no deps. Uses Intl for correct DST handling.

export function isFridayMode() {
  try {
    // eslint-disable-next-line no-restricted-syntax -- the same test runs before the first paint (data-friday-mode, lib/prehydration-flags-inline.js), and spec 50 seeds the override (MEH-3860)
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
      // h23, not hour12:false: some engines print midnight as "24" (MEH-3860).
      hourCycle: "h23",
    }).formatToParts(new Date());
    const weekday = parts.find((p) => p.type === "weekday")?.value; // "Thu" / "Fri"
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    return (weekday === "Thu" && hour >= 18) || (weekday === "Fri" && hour < 14);
  } catch {
    return false;
  }
}
