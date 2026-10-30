import { useTranslations } from "next-intl";

import ImageWithFallback from "@/components/ImageWithFallback";
import { IMAGE_RATIOS } from "@/lib/cloudinary";

/**
 * Module:   OwnerCard
 * Purpose:  "מאחורי העסק" — the person behind the business (MEH-1334 Z4).
 *           Data-gated: renders ONLY from data that exists; never an empty
 *           card or a placeholder in production. Relocates the contact_name
 *           line the chunk-1 header restructure removed.
 * Does NOT: fetch anything (fields arrive on the producer payload) or render
 *           when there is nothing to show — no contact_name, bio or photo
 *           (mockup 1f's "no name → hidden" widened by MEH-2471).
 * Related:  ProducerSections.jsx (mount point, after DeliveryBlock),
 *           ProducerHeader.jsx (the removed "מאחורי העסק: {name}" line).
 * History:  MEH-1334 chunk 3 (creation). owner_bio / owner_photo_url are
 *           OPTIONAL fields shipping with MEH-1335 — until then they are
 *           absent from the API and those variants stay dormant; the live
 *           variant today is compact (name + city).
 *
 * Variants (mockup 1f):
 *   photo + bio     → 88px photo avatar, name/city, bio paragraph
 *   initials + bio  → 88px single-letter avatar, name/city, bio paragraph
 *   compact         → 56px single-letter avatar, name + city only
 *   no name / bio / photo → null (section hidden)
 *   MEH-2471: bio and/or photo without contact_name → card without the name
 *   line (photo alt falls back to the business name).
 *   MEH-2475: `heading` overrides «מאחורי העסק» — the organizer page mounts
 *   this card as «מאחורי האירועים» (an organizer is not a business).
 *   MEH-2592: `nested` renders it INSIDE the «אודות» section (the Yelp "About
 *   the business" pattern): a small h3 heading, no white card, a smaller
 *   green-50 avatar. The standalone card stays for the organizer page and for
 *   a business with no description (no «אודות» section to sit in).
 */
export default function OwnerCard({ producer, heading, nested = false }) {
  const t = useTranslations("producer.detail.owner_card");

  const name = producer.contact_name?.trim() || null;
  const bio = producer.owner_bio?.trim() || null;
  const photo = producer.owner_photo_url?.trim() || null;
  // MEH-2471: any of the three is "the person behind the business". The old
  // gate (contact_name only) predated bio/photo (MEH-1335) and hid both for
  // every self-registered business, which never writes contact_name.
  if (!name && !bio && !photo) return null;

  // Single-letter initials always — never two letters in Hebrew (revision-2 #12).
  // Array.from: the first CODE POINT, so a name opening with an emoji or any
  // astral character does not split its surrogate pair (CI review, MEH-2592).
  const initial = name ? Array.from(name)[0] : null;
  const avatarSize = nested ? 48 : bio ? 88 : 56;

  if (nested) {
    return (
      <div className="mt-6" data-testid="owner-card" data-nested="true">
        <h3 className="text-[15px] font-bold text-gold-deep mb-3">{heading || t("heading")}</h3>
        {(photo || name || producer.city) && (
          <div className="flex items-center gap-3">
            {photo ? (
              <ImageWithFallback
                src={photo}
                alt={name || producer.name || ""}
                aspectRatio={IMAGE_RATIOS.square}
                optimizeWidth={avatarSize * 2}
                width={avatarSize}
                height={avatarSize}
                className="rounded-full object-cover shrink-0"
                style={{ width: avatarSize, height: avatarSize }}
              />
            ) : initial ? (
              <span
                aria-hidden="true"
                data-testid="owner-initial"
                className="rounded-full bg-green-50 text-primary flex items-center justify-center font-headline-md font-bold shrink-0"
                style={{ width: avatarSize, height: avatarSize, fontSize: avatarSize * 0.42 }}
              >
                {initial}
              </span>
            ) : null}
            <div className="min-w-0">
              {name && <p className="font-headline-md text-lg font-bold text-text leading-tight">{name}</p>}
              {producer.city && <p className="text-[13px] text-muted mt-0.5">{producer.city}</p>}
            </div>
          </div>
        )}
        {bio && <p className="mt-3 text-text/85 leading-relaxed whitespace-pre-line">{bio}</p>}
      </div>
    );
  }

  return (
    <section className="mt-12" data-testid="owner-card">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{heading || t("heading")}</h2>
      <div className="bg-white border border-border rounded-lg p-5 flex flex-col gap-3">
        {/* Avatar at the inline-start on ALL viewports (mockup lock). */}
        {/* MEH-2471: the avatar/name row only when it has something in it —
            a bio-only card with no city would otherwise open with a blank gap. */}
        {(photo || name || producer.city) && (
        <div className="flex items-center gap-4">
          {photo ? (
            <ImageWithFallback
              src={photo}
              alt={name || producer.name || ""}
              aspectRatio={IMAGE_RATIOS.square}
              optimizeWidth={avatarSize * 2}
              width={avatarSize}
              height={avatarSize}
              className="rounded-full object-cover shrink-0"
              style={{ width: avatarSize, height: avatarSize }}
            />
          ) : initial ? (
            <span
              aria-hidden="true"
              data-testid="owner-initial"
              className="rounded-full bg-primary text-background flex items-center justify-center font-headline-md font-bold shrink-0"
              style={{ width: avatarSize, height: avatarSize, fontSize: avatarSize * 0.4 }}
            >
              {initial}
            </span>
          ) : null}
          <div className="min-w-0">
            {name && <h3 className="font-headline-md text-lg font-bold text-text">{name}</h3>}
            {producer.city && <p className="text-[12.5px] text-muted mt-0.5">{producer.city}</p>}
          </div>
        </div>
        )}
        {bio && <p className="text-sm leading-relaxed text-text">{bio}</p>}
      </div>
    </section>
  );
}
