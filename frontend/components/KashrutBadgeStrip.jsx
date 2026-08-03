"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { StarOfDavid, X } from "@phosphor-icons/react";

// Display-only metadata = none. Labels + tooltips resolve via
// t(`kashrut.badges.${key}.label`/`tooltip`). The `code` axis is the
// API contract from the backend (snake-cased in messages: `organic-kosher`
// → `organic_kosher`, `artisan-dairy` → `artisan_dairy`).
export const CODE_TO_KEY = {
  rabanut: "rabanut",
  badatz: "badatz",
  chalak: "chalak",
  mehadrin: "mehadrin",
  "organic-kosher": "organic_kosher",
  shmitta: "shmitta",
  kilayim: "kilayim",
  "artisan-dairy": "artisan_dairy",
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * MEH-1672: the certificate viewer. A minimal in-file modal rather than a
 * reuse of components/Lightbox.jsx — that one is a multi-image gallery viewer
 * (prev/next, swipe, index state) with no slot for a caption, and a
 * certificate is one image whose whole point is the three lines UNDER it:
 * validity, who verified, and where the original hangs. Bending the gallery
 * viewer to carry them would have changed a shared component for a single
 * caller. ESC + backdrop + X all close (WCAG 2.1 §2.1.2); the image is
 * `max-h`-capped so it fits a 375px viewport with native pinch-zoom intact.
 */
function CertModal({ src, expiryText, onClose, t }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("cert.dialog_label")}
      data-testid="kashrut-cert-modal"
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-floating rounded-lg border border-border w-full max-w-md p-4 relative" dir="rtl">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("cert.close")}
          data-testid="kashrut-cert-close"
          className="absolute top-3 start-3 w-8 h-8 rounded-full hover:bg-green-50 flex items-center justify-center text-fg-muted"
        >
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
        {/* raw img: src is our own /kashrut-cert proxy route, not a Cloudinary
            URL — lib/cloudinary.js has nothing to transform, and the host is
            not in next.config.js images.remotePatterns (frozen this ticket). */}
        <img
          src={src}
          alt={t("cert.image_alt")}
          data-testid="kashrut-cert-image"
          className="w-full max-h-[70vh] object-contain rounded mt-6"
        />
        <div className="mt-3 space-y-1 text-sm">
          {expiryText && <p className="font-medium text-text">{expiryText}</p>}
          <p className="text-fg-muted">{t("cert.verified_by")}</p>
          {/* Over-claim guard (MEH-579): we show the document and say who
              checked it — we never assert the business "is kosher". */}
          <p className="text-fg-muted">{t("cert.original_at_business")}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {"chips"|"quiet"} [variant="chips"] — "chips" is the legacy pill
 *   strip (ProfileCompletenessCard); "quiet" (MEH-1334) renders the producer
 *   header's single quiet kosher line: icon + labels joined on one row. Both
 *   variants share the MEH-1260 expiry gate + CODE_TO_KEY contract — one owner.
 * @param {{badge_code: string}[]} [certs=[]] — MEH-1672, badges whose approved
 *   certificate the backend will serve. Badge codes only; the URL is built
 *   from producerId + badge_code and points at our proxy, never Cloudinary.
 * @param {string|number} [producerId] — required for the cert route; without
 *   it no badge becomes tappable and the strip renders exactly as before.
 */
export default function KashrutBadgeStrip({
  badges,
  verified_at,
  expires_at,
  variant = "chips",
  certs = [],
  producerId = null,
}) {
  const t = useTranslations("kashrut");
  const format = useFormatter();
  // MEH-1672: which badge's certificate is open, or null. Declared before the
  // early returns so hook order is stable across every render path.
  const [openCert, setOpenCert] = useState(null);
  if (!badges || badges.length === 0) return null;
  // MEH-1260: expired certificate → hide the whole strip, not just flip the
  // near-expiry chip (expiry was previously display-only). Legacy NULL
  // expires_at stays visible — pre-expiry-era rows are still valid.
  if (expires_at && new Date(expires_at) <= new Date()) return null;

  const expiresInDays = daysUntil(expires_at);
  const nearExpiry = expiresInDays !== null && expiresInDays <= 30;

  const expiryText = expires_at
    ? t("expiry.valid_until", {
        date: format.dateTime(new Date(expires_at), { dateStyle: "short" }),
      })
    : null;

  // MEH-1672: a badge is tappable only when the backend listed a servable
  // certificate for it AND we know the producer id to build the route from.
  // Any badge without one keeps today's non-interactive rendering exactly.
  const certCodes = new Set(
    producerId ? (certs || []).map((c) => c?.badge_code).filter(Boolean) : [],
  );
  const certSrc = (code) => `/api/producers/${producerId}/kashrut-cert/${encodeURIComponent(code)}`;

  if (variant === "quiet") {
    const shown = badges.filter((code) => CODE_TO_KEY[code]);
    if (shown.length === 0) return null;
    const tooltips = shown.map((code) => t(`badges.${CODE_TO_KEY[code]}.tooltip`));
    return (
      // MEH-1672 fix (adversarial review): CertModal renders a <div>, which is
      // invalid inside a <p> (HTML block-in-inline nesting — React's
      // validateDOMNesting warns, and a browser would auto-close the <p>
      // early and reparent siblings). The Fragment keeps the modal a SIBLING
      // of the <p>, not a child, so the line stays a plain <p> exactly as
      // before MEH-1672.
      <>
        <p
          className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted"
          title={[...tooltips, expiryText].filter(Boolean).join(" · ")}
          data-testid="kashrut-quiet-line"
        >
          <StarOfDavid size={14} aria-hidden="true" />
          {/* Same "label · label" row as before. MEH-1672 only changes the
              labels that HAVE a certificate into buttons — the separator, the
              order, and every label without a cert are untouched. */}
          {shown.map((code, i) => {
            const label = t(`badges.${CODE_TO_KEY[code]}.label`);
            return (
              <span key={code} className="flex items-center gap-x-1.5">
                {i > 0 && <span aria-hidden="true">·</span>}
                {certCodes.has(code) ? (
                  <button
                    type="button"
                    onClick={() => setOpenCert(code)}
                    aria-haspopup="dialog"
                    data-testid={`kashrut-cert-trigger-${code}`}
                    className="underline underline-offset-2 hover:text-primary transition focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                  >
                    {label}
                  </button>
                ) : (
                  label
                )}
              </span>
            );
          })}
          {nearExpiry && <span className="text-accent">· {t("expiry.near_expiry")}</span>}
        </p>
        {openCert && (
          <CertModal
            src={certSrc(openCert)}
            expiryText={expiryText}
            onClose={() => setOpenCert(null)}
            t={t}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center" dir="rtl">
      {badges.map((code) => {
        const key = CODE_TO_KEY[code];
        if (!key) return null;
        const label = t(`badges.${key}.label`);
        const tooltipBase = t(`badges.${key}.tooltip`);
        const tooltip = [tooltipBase, expiryText].filter(Boolean).join(" · ");
        const pill =
          "inline-flex items-center rounded-full border border-primary/30 bg-primary/5 text-primary px-2 py-0.5 text-xs font-medium";

        if (certCodes.has(code)) {
          return (
            <button
              key={code}
              type="button"
              title={tooltip}
              onClick={() => setOpenCert(code)}
              aria-haspopup="dialog"
              data-testid={`kashrut-cert-trigger-${code}`}
              className={`${pill} hover:bg-primary/10 transition focus-visible:ring-2 focus-visible:ring-primary/40`}
            >
              {label}
            </button>
          );
        }

        return (
          <span
            key={code}
            title={tooltip}
            className={`${pill} cursor-default`}
          >
            {label}
          </span>
        );
      })}
      {nearExpiry && (
        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium">
          {t("expiry.near_expiry")}
        </span>
      )}

      {/* Exactly one modal: `openCert` holds a single badge code, so two
          certificates can never be open at once. */}
      {openCert && (
        <CertModal
          src={certSrc(openCert)}
          expiryText={expiryText}
          onClose={() => setOpenCert(null)}
          t={t}
        />
      )}
    </div>
  );
}
