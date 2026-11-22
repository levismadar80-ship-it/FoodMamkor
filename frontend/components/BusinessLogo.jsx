// @ts-check
/**
 * Module:   BusinessLogo
 * Purpose:  A business's logo in a white circle beside its name (MEH-3611).
 *           Renders nothing without a logo, so each caller keeps whatever it
 *           showed before (a letter avatar, or no mark at all).
 * Does NOT: fall back to the first letter — callers that want the letter
 *           pass `src` to Avatar themselves (OwnerRow).
 * History:  MEH-3611 (creation)
 */
import Avatar from "@/components/ui/Avatar";
import { optimizeCloudinary } from "@/lib/cloudinary";

// Twice the largest size it is drawn at, for a sharp circle on a 2× screen.
const LOGO_PX = 160;

/** @param {{ url?: string | null, size?: number, className?: string }} props */
export default function BusinessLogo({ url, size = 56, className = "" }) {
  if (!url) return null;
  return (
    <Avatar
      src={optimizeCloudinary(url, { width: LOGO_PX })}
      size={size}
      fit="contain"
      decorative
      className={`bg-surface border border-border ${className}`}
      data-testid="business-logo"
    />
  );
}
