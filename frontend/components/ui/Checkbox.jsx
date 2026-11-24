// @ts-check
/**
 * Checkbox — the one checkbox on the site (MEH-3830, parent MEH-3826).
 *
 * Module:   Checkbox
 * Purpose:  A native <input type="checkbox"> inside its own <label>, so the
 *           whole row (box + text) is the hit area: at least 44px tall below
 *           md and 32px from md up (DESIGN.md «Interactive sizing minimums»).
 *           The box is 20px in the brand green (`accent-primary`).
 * Does NOT: own state — the caller passes `checked` / `onChange` (or
 *           `defaultChecked`), exactly as on a native input. Not a switch:
 *           an on/off setting that takes effect at once is ui/Switch.jsx.
 * Why native: the browser gives keyboard, form submit, `required` and screen
 *           reader support for free. Radix Checkbox (MIT) and React Aria
 *           (Apache-2.0) both rebuild those on a <button>; nothing here needs
 *           a tri-state or a custom-drawn box, so neither is worth the bundle.
 * Related:  ui/Switch.jsx (toggle), eslint-rules/design-system.mjs
 *           (`no-html-checkbox`, which counts the raw ones left).
 * History:  MEH-3830 (creation).
 *
 * className    : on the <label> row — text size and colour, alignment, width.
 * boxClassName : extra classes on the box itself (rare; e.g. a top offset).
 * Every other prop (checked, onChange, required, name, value, id,
 * data-testid, aria-*) goes to the native input.
 *
 * @example
 * <Checkbox checked={ok} onChange={(e) => setOk(e.target.checked)}>
 *   {t("terms")}
 * </Checkbox>
 */

/**
 * @param {{
 *   children?: any,
 *   className?: string,
 *   boxClassName?: string,
 *   [rest: string]: any,
 * }} props
 */
export default function Checkbox({ children, className = "", boxClassName = "", ...rest }) {
  // The caller's unprefixed display / alignment / gap replace the defaults:
  // two display utilities on one element resolve by stylesheet order, not by
  // class order. A prefixed one (md:flex) needs nothing: it already comes
  // later in the stylesheet and wins at its breakpoint.
  const display = /(^|\s)(inline-)?(flex|grid)(\s|$)/.test(className) ? "" : "inline-flex";
  const align = /(^|\s)items-/.test(className) ? "" : "items-center";
  const gap = /(^|\s)gap-/.test(className) ? "" : "gap-2";
  return (
    <label
      className={`${display} ${align} ${gap} min-h-touch md:min-h-8 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${className}`}
    >
      <input
        type="checkbox"
        className={`w-5 h-5 shrink-0 accent-primary cursor-[inherit] focus-ring rounded-sm ${boxClassName}`}
        {...rest}
      />
      {children}
    </label>
  );
}
