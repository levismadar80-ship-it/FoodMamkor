// @ts-check
/**
 * InlineMessage — a short message inside a page or form (MEH-3072).
 *
 * Module:   InlineMessage
 * Purpose:  The one look for a form-level or page-level message that appears
 *           in place: a submit error, «נשמר», a load error in a row.
 *             tone="error"   (default) role="alert", the one red: text-error
 *             tone="success" role="status", text-primary
 *             tone="info"    role="status", text-fg-muted
 *             size="sm" (default) 14px · "xs" 12px · "inherit" no size class
 *             variant="text" (default) coloured text only
 *             variant="box"  + a tinted panel (danger-50 fill, danger-200 line
 *                            for an error) — padding / radius stay the caller's
 * Does NOT: a field's own error under its input (id + aria-describedby) — that
 *           belongs to the form-field primitives (MEH-3060); a full-page error
 *           state (centred card) — that is EmptyState's job.
 * Why:      until 13/11 the site had 99 role="alert" nodes in 44 class
 *           combinations and two reds: text-error (#b3261e) and
 *           the danger-500/600/700 shades (danger-600 reads below 4.5:1 on the cream
 *           page). Guard: InlineMessageGuard.test.js.
 *
 * @example
 * {error && <InlineMessage className="mt-2">{error}</InlineMessage>}
 * <InlineMessage tone="success" size="xs">{t("saved")}</InlineMessage>
 */

const COLOR = { error: "text-error", success: "text-primary", info: "text-fg-muted" };
const BOX = {
  error: "bg-danger-50 border border-danger-200",
  success: "bg-green-50 border border-primary/20",
  info: "bg-background-alt border border-border",
};
const SIZE = { sm: "text-sm", xs: "text-xs", inherit: "" };

/**
 * @param {{ as?: any, tone?: "error" | "success" | "info", size?: "sm" | "xs" | "inherit", variant?: "text" | "box", className?: string, children?: import("react").ReactNode, [key: string]: any }} props
 */
export default function InlineMessage({
  as: Tag = "p",
  tone = "error",
  size = "sm",
  variant = "text",
  className = "",
  children,
  ...rest
}) {
  const role = tone === "error" ? "alert" : "status";
  const box = variant === "box" ? BOX[tone] : "";
  return (
    // rest first: role follows tone and cannot be overridden by a caller
    <Tag {...rest} role={role} className={`${SIZE[size]} ${COLOR[tone]} ${box} ${className}`.replace(/\s+/g, " ").trim()}>
      {children}
    </Tag>
  );
}
