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
 *             tone="none"    no fill — the parent draws the circle (the green
 *                            account sheet keeps its white/10 ring)
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
  none: "",
};

/** @param {number} size */
function letterClass(size) {
  if (size <= 28) return "text-xs";
  if (size <= 44) return "text-sm";
  return "text-2xl";
}

/**
 * @param {{ src?: string | null, name?: string | null, size?: number, tone?: "primary" | "none", className?: string, fallback?: string }} props
 */
export default function Avatar({ src, name, size = 34, tone = "primary", className = "", fallback = "?" }) {
  return (
    <span
      data-avatar=""
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${src ? "" : TONES[tone]} ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // raw img: OAuth provider avatar — host not in next.config.js
        // images.remotePatterns (frozen, MEH-3069 keeps it as it was).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`${letterClass(size)} font-semibold leading-none`}>{avatarInitial(name, fallback)}</span>
      )}
    </span>
  );
}
