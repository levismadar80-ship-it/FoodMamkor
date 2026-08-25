"use client";

/**
 * ReviewEvidence — MEH-1399 chunk 4, the «תיק בדיקה»: the links an admin needs
 * while working a business, gathered next to the checklist instead of hunted
 * for in four tabs. Every value comes from the ProducerAdminOut row the table
 * already has — this component fetches nothing.
 *
 * ## Why the evidence is grouped by KIND and not bound to a checklist item
 *
 * The ticket asks for per-ITEM evidence. That is not implementable safely as
 * the schema now stands, and the reason is worth stating rather than working
 * around quietly.
 *
 * Since chunk 1, checklist items are DB rows whose label is EDITABLE and whose
 * order is admin-controlled. Binding evidence to an item therefore needs a
 * stable key, and the only candidates without a schema change are the label
 * text or the position — both of which the admin is explicitly able to change.
 * Keying behaviour off a display string is the exact defect the categories
 * migration on staging just removed (a chip that vanished when a name was
 * edited), and keying off position breaks the moment someone reorders.
 *
 * So the dossier renders as its own labelled block inside the same expanded
 * sub-row: still inline with the checklist, still one glance, but it survives
 * an admin renaming or reordering every item. Making it truly per-item wants a
 * nullable `evidence_key` column on `admin_checklist_items` — a schema change,
 * and therefore its own revision and its own review gate.
 *
 * Links are `target="_blank" rel="noopener noreferrer"`; Phosphor icons only;
 * logical properties only (`ms-`/`me-`), never `ml-`/`mr-`.
 */

import { useState } from "react";
import {
  ArrowSquareOut,
  Copy,
  IdentificationCard,
  Image as ImageIcon,
  MagnifyingGlass,
  SealCheck,
} from "@phosphor-icons/react";
import { HEALTH_MINISTRY_FOOD_REGISTRY_URL } from "@/lib/official-registries";

const ICON = 14;
const SECTION_ICON = 16;
// Enough thumbnails to judge a gallery without turning the row into a contact
// sheet; the rest are one click away on the business page.
const MAX_THUMBS = 4;

function ExternalLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <ArrowSquareOut size={ICON} weight="bold" aria-hidden="true" />
      {children}
    </a>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-text">
        <Icon size={SECTION_ICON} aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-5">
        {children}
      </div>
    </div>
  );
}

export default function ReviewEvidence({ producer }) {
  const [copied, setCopied] = useState(false);

  if (!producer) return null;

  const {
    name,
    city,
    website,
    instagram,
    images,
    producer_license_number: licenseNumber,
    license_expires_at: licenseExpiresAt,
    kashrut_badges: kashrutBadges,
    id,
  } = producer;

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(name || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (permissions, insecure origin). Staying silent
      // is right: the name is on screen and selectable, so the admin loses a
      // convenience, not the ability to do the check.
    }
  };

  // Quoted name + city — the query an admin would type anyway, minus the typing.
  const googleQuery = `https://www.google.com/search?q=${encodeURIComponent(
    `"${name || ""}" ${city || ""}`.trim(),
  )}`;

  const thumbs = (images || []).slice(0, MAX_THUMBS);
  const badges = kashrutBadges || [];

  // The small-screen cap below is measured, not chosen: at 375 a bare
  // `max-w-xl` (576px) rendered 481px wide with 151px of it off-screen, so
  // «מספר: …» and the expiry could only be read by scrolling the whole admin
  // table sideways. `100vw - 3rem` subtracts the containing td's own `px-6`.
  // max-width has no start/end side, so this is direction-neutral.
  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3 max-w-[calc(100vw-3rem)] sm:max-w-xl">
      <p className="text-xs font-semibold text-text">תיק בדיקה</p>

      <Section icon={IdentificationCard} title="רישיון">
        <ExternalLink href={HEALTH_MINISTRY_FOOD_REGISTRY_URL}>
          מאגר משרד הבריאות
        </ExternalLink>
        <button
          type="button"
          onClick={copyName}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Copy size={ICON} weight="bold" aria-hidden="true" />
          {copied ? "הועתק ✓" : "העתקת שם העסק"}
        </button>
        <span className="text-xs text-muted">
          {licenseNumber ? `מספר: ${licenseNumber}` : "אין מספר רישיון"}
        </span>
        {/* MEH-2072 captured this date; the checklist is where it earns its
            keep — the admin sees the licence's expiry while judging it. */}
        {licenseExpiresAt && (
          <span className="text-xs text-muted">תוקף: {licenseExpiresAt}</span>
        )}
      </Section>

      <Section icon={MagnifyingGlass} title="סימני חיים">
        {website && <ExternalLink href={website}>אתר</ExternalLink>}
        {instagram && <ExternalLink href={instagram}>אינסטגרם</ExternalLink>}
        <ExternalLink href={googleQuery}>חיפוש בגוגל</ExternalLink>
        {!website && !instagram && (
          <span className="text-xs text-muted">אין אתר או אינסטגרם</span>
        )}
      </Section>

      <Section icon={ImageIcon} title="תמונות">
        {thumbs.length === 0 && (
          <span className="text-xs text-muted">אין תמונות</span>
        )}
        {thumbs.map((url) => (
          <a
            key={url}
            href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="חיפוש הפוך"
            className="inline-block"
          >
            {/* Plain <img>: these are admin-only thumbnails of arbitrary remote
                URLs, and routing them through next/image would put every
                producer-supplied host into the optimizer's allowlist. */}
            <img
              src={url}
              alt="חיפוש הפוך לתמונה"
              className="h-10 w-10 rounded object-cover border border-border"
            />
          </a>
        ))}
      </Section>

      {badges.length > 0 && (
        <Section icon={SealCheck} title="כשרות">
          {badges.map((code) => (
            <ExternalLink
              key={code}
              href={`/api/producers/${id}/kashrut-cert/${code}`}
            >
              {`תעודה: ${code}`}
            </ExternalLink>
          ))}
        </Section>
      )}
    </div>
  );
}
