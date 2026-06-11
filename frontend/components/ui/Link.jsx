import NextLink from "next/link";

/**
 * Link — styled Next.js link primitive (MEH-602).
 *
 * Module:   Link
 * Purpose:  Wrap next/link with the project's link styles so pages stop
 *           repeating inline link colors. Net-new atom.
 * Does NOT: replace Button — for actions that aren't navigation, use Button.jsx.
 * Related:  Header.jsx NavLink:390-414 (nav variant + gold-underline active),
 *           Footer.jsx (muted/default link ink).
 * History:  MEH-602 (creation).
 *
 * variant : default (primary ink, hover underline) | muted (fg-muted → text) |
 *           accent (gold) | nav (header link; pass `active` for the gold
 *           underline + aria-current="page")
 *
 * Keyboard-accessible: native <a> from next/link keeps focus order; a
 * focus-ring + rounded focus rect is applied in every variant.
 *
 * @example
 * <Link href="/about">קראו עוד</Link>
 * <Link href="/map" variant="nav" active>מפה</Link>
 */
const VARIANT_CLASSES = {
  default: "text-primary hover:text-primary-dark underline-offset-2 hover:underline",
  muted: "text-fg-muted hover:text-text",
  accent: "text-accent hover:text-accent underline-offset-2 hover:underline",
  nav: "text-text hover:text-primary font-medium",
};

// Gold-underline active indicator — mirrors Header.jsx NavLink:405-407.
const NAV_ACTIVE =
  "relative text-text after:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent";

export default function Link({
  href,
  variant = "default",
  active = false,
  className = "",
  children,
  ...rest
}) {
  const isNavActive = variant === "nav" && active;

  return (
    <NextLink
      href={href}
      aria-current={isNavActive ? "page" : undefined}
      className={[
        "transition-colors duration-fast ease-quart focus-ring rounded-sm",
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.default,
        isNavActive ? NAV_ACTIVE : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </NextLink>
  );
}
