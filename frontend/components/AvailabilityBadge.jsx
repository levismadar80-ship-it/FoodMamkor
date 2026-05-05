/**
 * AvailabilityBadge — colored-dot + Hebrew-text badge for producer
 * availability status (MEH-12).
 *
 * Spec (Google/Etsy/Airbnb-style — NO emoji):
 *   - available → green dot  #22c55e + "פתוח להזמנות"
 *   - full      → orange dot #f97316 + "עמוס כרגע"
 *   - vacation  → gray dot   #9ca3af + "בהפסקה"
 *
 * Dot CSS (literal from spec):
 *   width:8px; height:8px; border-radius:50%;
 *   display:inline-block; margin-left:6px
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
 */

// MEH-12 legacy availability_status (3 keys) + MEH-291 availability_state
// (4 keys). Both flow through the same component so callers can migrate
// without a v2 component. Phase 4 will drop the legacy keys after the
// 7-day overlap window.
const STATUS_CONFIG = {
  // Legacy availability_status keys (kept during overlap)
  available: {
    color: "#22c55e",
    label: "פתוח להזמנות",
  },
  full: {
    color: "#f97316",
    label: "עמוס כרגע",
  },
  vacation: {
    color: "#9ca3af",
    label: "בהפסקה",
  },
  // MEH-291 — new 4-state availability_state. Labels verbatim per spec.
  accepting_orders: {
    color: "#22c55e",
    label: "פתוח להזמנות",
  },
  available_today: {
    color: "#4cb08b",
    label: "זמינה היום 🟢",
  },
  full_this_week: {
    color: "#f97316",
    label: "עמוסה השבוע 🟠",
  },
  on_vacation: {
    color: "#9ca3af",
    label: "בהפסקה ⏸",
  },
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
  const normalized = STATUS_CONFIG[status] ? status : "available";
  const config = STATUS_CONFIG[normalized];

  // Card variant: hide the "default open" states (legacy `available` +
  // new `accepting_orders`) to avoid cluttering the listings grid with
  // a "yes this is open" pill on every row.
  if (variant === "card" && CARD_HIDDEN_STATES.has(normalized)) {
    return null;
  }

  return (
    <span
      role="status"
      aria-label={config.label}
      data-testid="availability-badge"
      data-status={normalized}
      className="inline-flex items-center text-xs text-site-text"
    >
      <span
        aria-hidden="true"
        style={{ ...DOT_STYLE, background: config.color }}
      />
      {config.label}
    </span>
  );
}
