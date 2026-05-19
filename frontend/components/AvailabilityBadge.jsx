"use client";

import { useTranslations } from "next-intl";

/**
 * AvailabilityBadge — colored-dot + Hebrew-text badge for producer
 * availability status (MEH-12).
 *
 * Spec (Google/Etsy/Airbnb-style — NO emoji on legacy states):
 *   - available → green dot  #22c55e + "פתוח להזמנות"
 *   - full      → orange dot #f97316 + "עמוס כרגע"
 *   - vacation  → gray dot   #9ca3af + "בהפסקה"
 *
 * Variants:
 *   - "card"   → card listings. Hides when status="available" so the
 *                default case doesn't clutter the card grid (only
 *                flags the exceptional states).
 *   - "detail" → producer detail header. Shows all three states so
 *                guests see the positive "open for orders" signal
 *                where it matters most.
 *
 * Unknown / missing status is treated as "available" for forward
 * compat: if the backend adds a new status value, cards won't crash.
 *
 * MEH-475 PR-C4a chunk 4b: STATUS_CONFIG split into data axis
 * ({color, labelKey, family}) and display axis (t()). Backend API contract
 * (the status string) is untouched; only the displayed label is i18n-aware.
 */

const STATUS_CONFIG = {
  // Legacy availability_status (MEH-12)
  available:        { color: "#22c55e", labelKey: "status_label.open_orders" },
  full:             { color: "#f97316", labelKey: "status_label.busy_week" },
  vacation:         { color: "#9ca3af", labelKey: "status_label.on_vacation" },
  // MEH-291 — new 4-state availability_state with emojis on card label
  accepting_orders: { color: "#22c55e", labelKey: "card_label.open_orders" },
  available_today:  { color: "#4cb08b", labelKey: "card_label.available_today" },
  full_this_week:   { color: "#f97316", labelKey: "card_label.busy_week" },
  on_vacation:      { color: "#9ca3af", labelKey: "card_label.on_vacation" },
};

// "Default open" states — suppressed in card variant so listings don't
// render a redundant "yes this is open" pill on every row.
const CARD_HIDDEN_STATES = new Set(["available", "accepting_orders"]);

const DOT_STYLE = {
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  display: "inline-block",
  marginLeft: "6px",
  flexShrink: 0,
};

export default function AvailabilityBadge({ status, variant = "card" }) {
  const t = useTranslations("producer.availability");
  const normalized = STATUS_CONFIG[status] ? status : "available";
  const config = STATUS_CONFIG[normalized];

  // Card variant: hide the "default open" states (legacy `available` +
  // new `accepting_orders`) to avoid cluttering the listings grid with
  // a "yes this is open" pill on every row.
  if (variant === "card" && CARD_HIDDEN_STATES.has(normalized)) {
    return null;
  }

  const label = t(config.labelKey);

  return (
    <span
      role="status"
      aria-label={label}
      data-testid="availability-badge"
      data-status={normalized}
      className="inline-flex items-center text-xs text-site-text"
    >
      <span
        aria-hidden="true"
        style={{ ...DOT_STYLE, background: config.color }}
      />
      {label}
    </span>
  );
}
