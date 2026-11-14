/**
 * Module:   EntityCover
 * Purpose:  The masthead of an entity detail page — the entity's photo, else a
 *           coloured band carrying its category icon (never an empty frame),
 *           an actions corner (the save heart) and an optional date tile that
 *           overlaps the cover's edge on phones.
 * Does NOT: fetch anything, pick the icon or the date strings (the page owns
 *           those), or render share / calendar (they live in the details card).
 * Related:  app/[locale]/events/[id]/EventDetailClient.jsx ·
 *           app/[locale]/experiences/[id]/ExperienceDetailClient.jsx.
 * History:  MEH-2548 (event cover) · MEH-2549 (experience copy of it) ·
 *           MEH-2559 (save heart corner) · MEH-2992 (one shared component —
 *           the two pages carried byte-identical copies).
 */
import { cssUrl } from "@/lib/css-url";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";

// Tailwind needs literal class names — one row per tone, never a template.
const TONES = {
  primary: { band: "bg-primary", tile: "bg-primary" },
  accent: { band: "bg-accent", tile: "bg-accent" },
};

/**
 * @param {object}   props
 * @param {string=}  props.imageUrl   Cloudinary URL; falsy → the band.
 * @param {string}   props.alt        Accessible name of the photo (the title).
 * @param {"primary"|"accent"=} props.tone
 * @param {Function} props.Icon       Category icon for the band.
 * @param {React.ReactNode=} props.actions  Corner actions (save heart).
 * @param {{month:string, day:string|number, weekday:string}=} props.dateTile
 * @param {string}   props.testIdPrefix  "event" → event-cover / -band / -actions / -date-tile.
 */
export default function EntityCover({ imageUrl, alt, tone = "primary", Icon, actions, dateTile, testIdPrefix }) {
  const t = TONES[tone] ?? TONES.primary;
  return (
    <div className="relative max-w-[1100px] mx-auto lg:px-4 lg:pt-6">
      {/* MEH-2559: the save heart on the cover's corner — the corner the recipe
          and business pages use. Not in the share/calendar row: a third
          button there wraps «הוספה ליומן» onto two lines below 375px. */}
      {actions && (
        <div className="absolute top-3 end-3 lg:top-9 lg:end-7 z-10" data-testid={`${testIdPrefix}-cover-actions`}>
          {actions}
        </div>
      )}
      {imageUrl ? (
        <div
          data-testid={`${testIdPrefix}-cover`}
          className="h-[210px] md:h-[300px] lg:h-[380px] bg-cover bg-center lg:rounded-xl bg-border"
          style={{ backgroundImage: cssUrl(optimizeCloudinary(imageUrl, { aspectRatio: IMAGE_RATIOS.banner, width: 1280 })) }}
          role="img"
          aria-label={alt}
        />
      ) : (
        <div
          data-testid={`${testIdPrefix}-cover-band`}
          aria-hidden="true"
          className={`h-[150px] lg:h-[200px] ${t.band} lg:rounded-xl grid place-items-center`}
        >
          {Icon && <Icon size={48} weight="regular" className="text-white/85" />}
        </div>
      )}
      {dateTile && (
        <div
          aria-hidden="true"
          data-testid={`${testIdPrefix}-date-tile`}
          className="lg:hidden absolute start-4 -bottom-7 w-16 rounded-md bg-surface shadow-lg text-center overflow-hidden"
        >
          <span className={`block ${t.tile} text-white text-2xs font-bold py-0.5`}>{dateTile.month}</span>
          <span className="block font-headline-display font-black text-3xl leading-tight pt-1 numeric">{dateTile.day}</span>
          <span className="block text-2xs text-fg-muted pb-1.5">{dateTile.weekday}</span>
        </div>
      )}
    </div>
  );
}
