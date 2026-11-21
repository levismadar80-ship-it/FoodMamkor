// @ts-check
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "@/i18n/navigation";
import { producerCompleteness } from "@/lib/producer-completeness";
import { buildBusinessQrUrl, QR_RENDER_OPTIONS } from "@/lib/qr";
import BackLink from "@/components/ui/BackLink";
import { LAYOUTS, PRINT_FORMATS } from "@/components/producer/print-kit/PrintKitLayouts";

/**
 * Route:    /producer/dashboard/qr-card
 * Purpose:  The A6 card a business prints and puts by the till, on its stall
 *           or on its packaging: its name, a QR code of at least 50mm, one
 *           CTA line, and the domain under the code.
 * Touches:  GET /producers/me (the owner's own record) — nothing else.
 * Does NOT: generate a PDF. Same call as the rescue counter card (MEH-2649):
 *           a print-styled route, so the business prints from the browser and
 *           nothing has to render, store or serve a document.
 * Related:  components/producer/BusinessQrCard.jsx (the dashboard entry point);
 *           lib/qr.js (the URL + render options);
 *           app/[locale]/producer/dashboard/rescue/counter-card/page.js (the
 *           mm-sizing / print:hidden pattern this follows).
 * History:  MEH-2785 (creation); MEH-3557 (print kit: A4 poster, table sign,
 *           sticker sheet — layouts in components/producer/print-kit/)
 *
 * NO ANCHOR MAY SIT INSIDE THE PRINTED <article>. globals.css:614 appends
 * ` (href)` after every `a[href]` in print, so a link in the card would print
 * its own URL as visible text — including inside the QR's quiet zone. The back
 * link is the only anchor on the page and it is `print:hidden`; the domain
 * under the code is plain text, deliberately not a link.
 *
 * The gate is the dashboard's share gate (approved + complete + a slug + not
 * an organizer), duplicated here rather than inherited: the layout guards the
 * ROLE (DashboardLayoutClient.jsx:147), not the approval state, and this URL
 * is reachable directly. A failed gate replaces the history entry rather than
 * pushing, so the browser Back button does not bounce between the two.
 */
export default function QrCardPage() {
  const t = useTranslations("qr_card");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [producer, setProducer] = useState(null);
  const [svg, setSvg] = useState(null);
  const [denied, setDenied] = useState(false);
  // MEH-3557: one format at a time; A6 stays the default, as before the kit.
  const [format, setFormat] = useState(/** @type {typeof PRINT_FORMATS[number]} */ ("a6"));

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") return; // the layout owns these two
    let alive = true;
    api
      .get("/producers/me")
      .then(({ data }) => {
        if (!alive) return;
        const gateOpen =
          Boolean(data?.slug) &&
          data?.status === "approved" &&
          data?.kind !== "organizer" &&
          producerCompleteness(data).missing.length === 0;
        if (!gateOpen) {
          setDenied(true);
          return;
        }
        setProducer(data);
      })
      .catch(() => {
        if (alive) setDenied(true);
      });
    return () => {
      alive = false;
    };
  }, [authLoading, user]);

  useEffect(() => {
    if (denied) router.replace("/producer/dashboard");
  }, [denied, router]);

  const url = buildBusinessQrUrl(producer);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toString(url, { ...QR_RENDER_OPTIONS, type: "svg" })
      .then((markup) => {
        if (alive) setSvg(markup);
      })
      .catch(() => {
        if (alive) setSvg(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (!producer) return null;

  const Layout = LAYOUTS[format];
  // A4 formats print edge to edge on an A4 sheet; the A6 card keeps the
  // browser's own page setup, as it did before the kit.
  const a4 = format !== "a6";

  return (
    <main className="min-h-screen bg-surface" data-testid="business-qr-card-print">
      {a4 && <style>{"@media print { @page { size: A4; margin: 0; } }"}</style>}
      {/* Screen-only: neither the way back, the picker nor the hint belongs on the paper. */}
      <div className="print:hidden px-4 py-3 border-b border-border">
        {/* MEH-2882 PR 1: the QR card lives in «כלים» → «שיתוף» now. */}
        <BackLink href="/producer/dashboard/tools#share" label={t("back")} />
        <div role="group" aria-label={t("formats.label")} className="flex flex-wrap gap-2 mt-3">
          {PRINT_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              data-testid={`print-kit-format-${f}`}
              aria-pressed={format === f}
              onClick={() => setFormat(f)}
              className={`min-h-11 px-4 rounded-full border text-sm font-medium transition-colors ${
                format === f
                  ? "bg-primary text-white border-primary"
                  : "bg-surface text-fg border-border hover:bg-bg-subtle"
              }`}
            >
              {t(`formats.${f}`)}
            </button>
          ))}
        </div>
        <p data-testid="print-kit-hint" className="font-body-sm text-sm text-fg-muted mt-2">
          {t(`hints.${format}`)}
        </p>
      </div>

      <Layout name={producer.name} svg={svg} t={t} />
    </main>
  );
}
