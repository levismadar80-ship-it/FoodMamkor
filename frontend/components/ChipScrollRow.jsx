"use client";

/**
 * Scrollable chip row for filter bars.
 *
 * variant="category" — radio semantics; one chip active at a time.
 *   activeKey: string key of the selected chip.
 *
 * variant="toggle" — boolean; any combination can be active.
 *   activeKeys: object { chipKey: boolean }.
 *
 * Inline-end edge fade signals overflowed content (RTL: left edge).
 * Shrink-0 w-8 spacer at scroll-end fixes RTL padding-inline-end clipping.
 */
export default function ChipScrollRow({
  chips,
  variant = "toggle",
  activeKey,
  activeKeys = {},
  onChipClick,
  fadeBg = "#ffffff",
  className = "",
}) {
  function isActive(chip) {
    return variant === "category" ? chip.key === activeKey : !!activeKeys[chip.key];
  }

  return (
    <div className={`relative ${className}`} dir="rtl">
      {/* Inline-start (right in RTL) fade — signals row is scrollable */}
      <div
        className="pointer-events-none absolute inset-y-0 start-0 w-8 z-10"
        style={{ background: `linear-gradient(to left, ${fadeBg}, transparent)` }}
        aria-hidden="true"
      />
      {/* Inline-end (left in RTL) fade — signals more chips off-screen */}
      <div
        className="pointer-events-none absolute inset-y-0 end-0 w-8 z-10"
        style={{ background: `linear-gradient(to right, ${fadeBg}, transparent)` }}
        aria-hidden="true"
      />
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        role={variant === "category" ? "radiogroup" : "toolbar"}
        aria-label={variant === "category" ? "סינון לפי קטגוריה" : "סינון לפי תכונה"}
      >
        {chips.map((chip) => {
          const active = isActive(chip);
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChipClick(chip.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-medium border transition shrink-0 ${
                active
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
              }`}
            >
              {chip.icon && <span aria-hidden="true">{chip.icon}</span>}
              {chip.label}
            </button>
          );
        })}
        {/* RTL scroll-end spacer: padding-inline-end is excluded from scrollWidth,
            so a real flex child is the only reliable way to reserve this space. */}
        <div className="shrink-0 w-8" aria-hidden="true" />
      </div>
    </div>
  );
}
