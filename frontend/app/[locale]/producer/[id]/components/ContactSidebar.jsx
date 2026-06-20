import { useTranslations } from "next-intl";
import { EnvelopeSimple, FacebookLogo, Globe, InstagramLogo, Phone, Receipt, WhatsappLogo } from "@phosphor-icons/react";

import FollowButton from "@/components/FollowButton";
import PrimaryContactButton from "@/components/PrimaryContactButton";
import ShareButton from "@/components/ShareButton";
import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import { getPrimaryMethod } from "@/lib/contact-method";

import { markWhatsAppClickedLocal, pingWhatsAppBeacon, trackContactClick } from "@/lib/contact-tracking";

/**
 * Desktop sticky contact sidebar — `<aside>` rendered as the second
 * cell of the two-column grid in ProducerDetail. Verbatim move from
 * ProducerDetail.jsx:693-832.
 *
 * Block #2 of the three primary-CTA beacon sites is consolidated to
 * use pingWhatsAppBeacon + markWhatsAppClickedLocal. Same fail-soft
 * semantics as the source: beacon is conditional on
 * getPrimaryMethod === "whatsapp" + navigator + sendBeacon (the
 * helper handles the latter two), localStorage write is unconditional.
 *
 * The four contact tiles (phone / instagram / website / email)
 * preserve their per-tile quirks verbatim:
 *   - phone: dir="ltr" (LTR phone numbers)
 *   - instagram: trim + replace(/^@+/, "") to avoid "@@" rendering
 *   - website: trim + http(s) prefix coercion to avoid blank-href clicks
 *   - email: dir="ltr", skipped when email IS the primary CTA
 */
export default function ContactSidebar({
  producer,
  isVacation,
  primaryCategory,
  shareUrl,
}) {
  const t = useTranslations();
  return (
    <aside>
      {/* MEH-76 chunk 3: arbitrary shadow dropped — S6 contact-card is flat
          (border-only), matching the S5 flat-overlay convergence. */}
      <div className="lg:sticky lg:top-24 bg-white rounded-lg p-6 border border-border">
        {/* MEH-76 chunk 1: the sidebar's duplicate vacation banner was removed —
            the single vacation surface is the ProducerHeader banner (S6 state a).
            The dim treatment below still signals the state here. */}

        {/* Dim contact content when on vacation — pointer-events-auto keeps clicking possible */}
        <div className={isVacation ? "opacity-50 pointer-events-auto" : ""}>

        {/* MEH-17: primary CTA follows producer.primary_contact_method.
            WhatsApp still pings the analytics beacon on click so the
            existing producer-dashboard metric keeps working. */}
        <WhatsAppQuestionChips producer={producer} />
        <PrimaryContactButton
          producer={producer}
          onClick={() => {
            if (getPrimaryMethod(producer) === "whatsapp") {
              pingWhatsAppBeacon(producer.id);
            }
            // Mark that this user has contacted via WhatsApp — unlocks review form
            markWhatsAppClickedLocal(producer.id);
          }}
        />

        {/* Contact buttons — 2-per-row dynamic grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {producer.phone && (
            <a
              href={`tel:${producer.phone}`}
              className="flex items-center justify-center gap-2 border border-border text-text px-3 py-3 rounded-md hover:bg-green-50 transition text-sm"
              dir="ltr"
              onClick={() => trackContactClick(producer.id, "phone")}
            >
              <Phone size={18} className="text-primary shrink-0" />
              <span className="truncate">{producer.phone}</span>
            </a>
          )}
          {producer.instagram?.trim() && (() => {
            // Strip leading "@" so stored values like "@heese_farm"
            // don't render as "@@heese_farm" (which truncates weirdly
            // into "heese@@" in the RTL sidebar without an explicit
            // dir override). The URL path also drops the @.
            const handle = producer.instagram.trim().replace(/^@+/, "");
            return (
              <a
                href={`https://instagram.com/${handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-border text-text px-3 py-3 rounded-md hover:bg-green-50 transition text-sm overflow-hidden"
                dir="ltr"
                onClick={() => trackContactClick(producer.id, "instagram")}
              >
                <InstagramLogo size={18} className="text-primary shrink-0" />
                <span className="truncate min-w-0">@{handle}</span>
              </a>
            );
          })()}
          {/* Pattern 2 guard: producer.website may be "" or "   "
              (whitespace-only), which is truthy in JS. Without
              trimming, the tile renders with an href of "https:// "
              and clicks go nowhere. */}
          {producer.website?.trim() && (
            <a
              href={
                producer.website.trim().startsWith("http")
                  ? producer.website.trim()
                  : `https://${producer.website.trim()}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border border-border text-text px-3 py-3 rounded-md hover:bg-green-50 transition text-sm"
              onClick={() => trackContactClick(producer.id, "website")}
            >
              <Globe size={18} className="text-primary shrink-0" />
              {t("producer.card.contact.website")}
            </a>
          )}
          {/* MEH-17 — secondary email tile. Skipped when email IS
              the primary method (redundant with the big CTA above). */}
          {producer.contact_email && getPrimaryMethod(producer) !== "email" && (
            <a
              href={`mailto:${producer.contact_email}`}
              className="flex items-center justify-center gap-2 border border-border text-text px-3 py-3 rounded-md hover:bg-green-50 transition text-sm"
              dir="ltr"
              onClick={() => trackContactClick(producer.id, "email")}
            >
              <EnvelopeSimple size={18} className="text-primary shrink-0" />
              <span className="truncate">{producer.contact_email}</span>
            </a>
          )}
          {/* MEH-296 — facebook tile. Skipped when facebook IS the primary
              CTA (redundant with the big button), mirroring the email tile. */}
          {producer.facebook?.trim() && getPrimaryMethod(producer) !== "facebook" && (
            <a
              href={
                producer.facebook.trim().startsWith("http")
                  ? producer.facebook.trim()
                  : `https://${producer.facebook.trim()}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border border-border text-text px-3 py-3 rounded-md hover:bg-green-50 transition text-sm"
              onClick={() => trackContactClick(producer.id, "facebook")}
            >
              <FacebookLogo size={18} className="text-primary shrink-0" />
              {t("producer.card.contact.facebook")}
            </a>
          )}
          {/* MEH-296 — external order-form tile. Skipped when it IS primary. */}
          {producer.external_order_form?.trim() && getPrimaryMethod(producer) !== "external_order" && (
            <a
              href={
                producer.external_order_form.trim().startsWith("http")
                  ? producer.external_order_form.trim()
                  : `https://${producer.external_order_form.trim()}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border border-border text-text px-3 py-3 rounded-md hover:bg-green-50 transition text-sm"
              onClick={() => trackContactClick(producer.id, "external_order")}
            >
              <Receipt size={18} className="text-primary shrink-0" />
              {t("producer.card.contact.external_order")}
            </a>
          )}
        </div>

        {/* Follow button — docs/archive/FEEDBACK_FIXES.md new feature */}
        <div className="mb-2">
          <FollowButton producerId={producer.id} />
        </div>

        {/* WhatsApp group invite link — only shown when the producer has set one */}
        {producer.whatsapp_group && (
          <a
            href={producer.whatsapp_group}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 border border-border text-fg-muted px-4 min-h-[44px] rounded-md hover:bg-background transition text-sm font-medium mb-2"
          >
            <WhatsappLogo size={16} />
            {t("producer.detail.contact_sidebar.join_whatsapp_group")}
          </a>
        )}

        <div className="mb-3">
          <ShareButton
            url={shareUrl}
            title={producer.name}
            description={producer.description}
            city={producer.city}
            category={primaryCategory?.name}
          />
        </div>
        </div>{/* end vacation-dim wrapper */}
      </div>
    </aside>
  );
}
