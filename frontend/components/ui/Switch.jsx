// @ts-check
/**
 * Switch — the one on/off toggle on the site (MEH-3065).
 *
 * Module:   Switch, SwitchTrack
 * Purpose:  Every role="switch" draws the same track: 40×24, a 16px knob that
 *           sits at the inline-START when off and the inline-END when on
 *           (logical insets, so it moves the right way in Hebrew and English).
 *             <Switch>       a standalone toggle — a <button role="switch">
 *                            with a 44px tap target around the track. Pass an
 *                            accessible name (aria-label / aria-labelledby).
 *             <SwitchTrack>  the track only (aria-hidden). For a whole row
 *                            that is itself the switch button (FilterSheet
 *                            rows, the dashboard pause row): the row keeps its
 *                            own button and puts the track inside it.
 * Does NOT: own state or labels — the caller passes `checked` and `onClick`.
 * Why:      until 13/11 the site had 13 hand-written switches in two sizes;
 *           the three in /admin/settings moved the knob with a physical
 *           transform, so in Hebrew it slid toward the wrong side.
 *           Guard: SwitchGuard.test.js.
 *
 * @example
 * <Switch checked={on} onClick={toggle} aria-labelledby="x-label" />
 * <button role="switch" aria-checked={on} className="group …">
 *   {label}<SwitchTrack on={on} />
 * </button>
 */

/**
 * @param {{ on: boolean, focusRing?: boolean, className?: string }} props
 *   focusRing — show the focus ring on the track when the PARENT button (with
 *   the `group` class) is keyboard-focused. Off for rows that ring themselves.
 */
export function SwitchTrack({ on, focusRing = true, className = "" }) {
  return (
    <span
      aria-hidden="true"
      data-switch-track=""
      className={`relative block shrink-0 w-10 h-6 rounded-full transition-colors ${
        focusRing ? "group-focus-visible:ring-2 group-focus-visible:ring-primary/40" : ""
      } ${on ? "bg-primary" : "bg-border"} ${className}`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-surface shadow-sm transition-all ${
          on ? "end-1" : "start-1"
        }`}
      />
    </span>
  );
}

/**
 * @param {{ checked: boolean, className?: string } & import("react").ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export default function Switch({ checked, className = "", type = "button", ...rest }) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      className={`group relative shrink-0 inline-flex items-center justify-center min-h-touch min-w-touch -my-2.5 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      <SwitchTrack on={checked} />
    </button>
  );
}
