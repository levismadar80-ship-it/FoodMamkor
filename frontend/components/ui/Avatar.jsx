// @ts-check
/**
 * Avatar — a person's round picture, or their initial (MEH-3069).
 *
 * Module:   Avatar, avatarInitial
 * Purpose:  One circle for the signed-in person everywhere it shows (Header
 *           menu button, BottomNav, account sheet, settings): their photo when
 *           there is one, otherwise ONE letter — the first code point of the
 *           name, upper-cased, «?» when there is no name.
 *             tone="primary" (default) white letter on bg-primary
 *             tone="soft"    green letter on bg-green-50 (an owner / host mark)
 *             tone="none"    no fill — the parent draws the circle (the green
 *                            account sheet keeps its white/10 ring), or the
 *                            caller passes its own colours in `className`
 *           MEH-3461: also the owner's / host's initial on public pages
 *           (organizer masthead, OwnerCard, OwnerRow, the event and workshop
 *           bylines, the event-row mark) — each drew its own circle before.
 *           `letterClassName` sets the letter's type when the default ladder
 *           does not fit; extra props (aria-hidden, data-testid) pass through.
 * Does NOT: decide who is signed in, or draw the guest icon — callers keep
 *           their own `<User>` glyph for a guest. Not for business logos.
 * Why:      until 13/11 the same `name.trim().charAt(0).toUpperCase()` line was
 *           copied into four files, in four circle styles, and charAt(0) splits
 *           a name that opens with an emoji (OwnerCard had already moved to
 *           Array.from, MEH-2592). Guard: AvatarGuard.test.js.
 *
 * @example
 * <Avatar src={user.avatar_url} name={user.name} size={34} />
 */

/**
 * The single initial for a name: first code point (not UTF-16 unit), upper-cased.
 * @param {string | null | undefined} name
 * @param {string} [fallback]
 */
export function avatarInitial(name, fallback = "?") {
  const trimmed = (name || "").trim();
  if (!trimmed) return fallback;
  return Array.from(trimmed)[0].toUpperCase();
}

const TONES = {
  primary: "bg-primary text-white",
  soft: "bg-green-50 text-primary",
  none: "",
};

/** @param {number} size */
function letterClass(size) {
  if (size <= 28) return "text-xs";
  if (size <= 44) return "text-sm";
  return "text-2xl";
}

// MEH-3461: a caller that places the circle itself (absolute on a cover or a
// photo) must not also get `relative` — the two utilities clash.
const PLACED = /(^|\s)(absolute|fixed|sticky)(\s|$)/;

/**
 * @param {{ src?: string | null, name?: string | null, size?: number, tone?: "primary" | "soft" | "none", className?: string, letterClassName?: string, fallback?: string, style?: import("react").CSSProperties, [key: string]: any }} props
 */
export default function Avatar({
  src,
  name,
  size = 34,
  tone = "primary",
  className = "",
  letterClassName,
  fallback = "?",
  style,
  ...rest
}) {
  const position = PLACED.test(className) ? "" : "relative ";
  return (
    <span
      data-avatar=""
      {...rest}
      className={`${position}inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${src ? "" : TONES[tone]} ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      {src ? (
        // raw img: OAuth provider avatar — host not in next.config.js
        // images.remotePatterns (frozen, MEH-3069 keeps it as it was).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={letterClassName ?? `${letterClass(size)} font-semibold leading-none`}>
          {avatarInitial(name, fallback)}
        </span>
      )}
    </span>
  );
}
