// @ts-check
/**
 * IconButton — a button whose only content is an icon (MEH-3832, parent MEH-3826).
 *
 * Module:   IconButton
 * Purpose:  The one place an icon-only button is written. `label` is required
 *           and becomes the accessible name (`aria-label`), so a nameless icon
 *           button cannot be written with it. `.tap-area` (app/globals.css,
 *           MEH-3827) grows the part a finger can hit to at least 44×44
 *           without changing the drawn size, so a 24px close «×» keeps its look.
 * Does NOT: draw the button. The caller's `className` is the whole look
 *           (size, colour, hover, position), exactly as on the raw <button> it
 *           replaced: the 33 icon buttons on the site had 20 different looks,
 *           and forcing one would have been a redesign, not a migration.
 *           A button with words in it is ui/Button.jsx. An icon on a photo
 *           (heart, share) is ui/overlay-icon-button.js.
 * Why no library: Radix has no button primitive, and React Aria's `useButton`
 *           re-adds what a native <button> already gives (keyboard, focus,
 *           disabled). Nothing here needs press events across pointer types.
 * Related:  ui/Button.jsx, app/globals.css `.tap-area`,
 *           eslint-rules/design-system.mjs (`no-html-button` counts raw ones).
 * History:  MEH-3832 (creation, codemod moved the raw icon buttons onto it).
 *
 * label     : the accessible name; required.
 * type      : defaults to "button" (a native button defaults to "submit").
 * Every other prop (onClick, disabled, aria-*, data-testid, ref) goes to the
 * native button.
 *
 * @example
 * <IconButton label={t("close")} onClick={onClose} className="w-8 h-8 rounded-full">
 *   <X size={18} aria-hidden="true" />
 * </IconButton>
 */
import { forwardRef } from "react";

/**
 * @typedef {{
 *   label: string,
 *   children?: any,
 *   className?: string,
 *   type?: "button" | "submit" | "reset",
 * } & Omit<import("react").ButtonHTMLAttributes<HTMLButtonElement>, "type">} IconButtonProps
 */

const IconButton = forwardRef(
  /**
   * @param {IconButtonProps} props
   * @param {any} ref
   */
  function IconButton({ label, children, className = "", type = "button", ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} className={`tap-area ${className}`} {...rest}>
        {children}
      </button>
    );
  },
);

export default IconButton;
