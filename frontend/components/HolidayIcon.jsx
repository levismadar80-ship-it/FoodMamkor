import { Cheese, Flame, Jar, Leaf, Sparkle, Tree } from "@phosphor-icons/react";

/**
 * MEH-1687 batch D (ruling «⚖️ 03/11» §2) — the holiday glyph is a Phosphor
 * icon, never a colour emoji (Emoji LOCK, MEH-657/990). Regular weight only
 * (BRAND.md forbids duotone), one colour (`text-primary`), sized `1em` so it
 * takes the font size of the slot it sits in.
 *
 * holiday → icon, keyed by the `icon` field in lib/holidays.js:
 *   pesach       Sparkle  (no matza glyph; Bread would be chametz — wrong)
 *   shavuot      Cheese
 *   rosh_hashana Jar      (the honey of «תפוח ודבש»; Phosphor has no apple)
 *   sukkot       Leaf
 *   chanuka      Flame
 *   tu_bishvat   Tree
 * An unknown or missing name falls back to Sparkle.
 */
export const HOLIDAY_ICONS = { Cheese, Flame, Jar, Leaf, Sparkle, Tree };

export default function HolidayIcon({ name, className = "" }) {
  const Icon = HOLIDAY_ICONS[name] || Sparkle;
  return (
    <Icon
      size="1em"
      weight="regular"
      aria-hidden="true"
      data-holiday-icon={HOLIDAY_ICONS[name] ? name : "Sparkle"}
      className={`text-primary ${className}`.trim()}
    />
  );
}
