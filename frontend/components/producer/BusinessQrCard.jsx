"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";

import { Link as LocaleLink } from "@/i18n/navigation";
import { buildBusinessQrUrl, QR_RENDER_OPTIONS, qrFileName } from "@/lib/qr";

/**
 * Module:   BusinessQrCard
 * Purpose:  The dashboard card an approved business uses to get a QR code for
 *           its own page — as SVG for print, as PNG for sharing, plus a link
 *           to the ready A6 print card.
 * Touches:  no API. The only side effects are two browser downloads and the
 *           `qrcode` render, all client-side.
 * Does NOT: count scans, offer a PDF, or put a logo in the code. Does NOT
 *           render the print card — that is its own route.
 * Related:  lib/qr.js (URL + render options, single owner);
 *           app/[locale]/producer/dashboard/tools/page.js#share (where it is
 *           rendered since MEH-2882 PR 1; it was on the dashboard home);
 *           app/[locale]/producer/dashboard/qr-card/page.js (the print card).
 * History:  MEH-2785 (creation)
 *
 * THE GATE LIVES HERE, not in the page's JSX, and that is a deliberate
 * departure from the ticket's wording ("same gate as VanityLinkCard" — i.e.
 * inline beside it). The condition is identical; only its owner moved. Inline
 * in the page it is a JSX expression no unit test can reach, so the ticket's
 * own acceptance criterion — "card hidden when not approved / incomplete /
 * organizer" — could only have been checked against a copy of the condition,
 * which is a test that passes while the real gate drifts. Here the shipped
 * component is the thing under test.
 *
 * Why the SVG is generated in an effect and not during render: `QRCode.toString`
 * is synchronous-looking but returns a promise, and `QRCode.toDataURL` needs a
 * canvas, so both belong on the client after mount. The `qrcode` browser build
 * (node_modules/qrcode/lib/browser.js) maps `fs` to false and depends on no
 * native canvas package — measured, MEH-2785 Phase 0.
 */
export default function BusinessQrCard({ producer, isComplete, isApproved, isOrganizer }) {
  const t = useTranslations("dashboard.producer.qr");
  const gateOpen = Boolean(producer?.slug) && !!isComplete && !!isApproved && !isOrganizer;
  const url = gateOpen ? buildBusinessQrUrl(producer) : null;
  const [svg, setSvg] = useState(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toString(url, { ...QR_RENDER_OPTIONS, type: "svg" })
      .then((markup) => {
        if (alive) setSvg(markup);
      })
      .catch(() => {
        // A failed render leaves `svg` null, which keeps both download buttons
        // disabled rather than handing the owner an empty file.
        if (alive) setSvg(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url) return null;

  const saveFile = (href, name) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
  };

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    saveFile(href, qrFileName(producer, "svg"));
    URL.revokeObjectURL(href);
  };

  const downloadPng = async () => {
    const href = await QRCode.toDataURL(url, { ...QR_RENDER_OPTIONS, width: 1024 });
    saveFile(href, qrFileName(producer, "png"));
  };

  return (
    <section
      data-testid="business-qr-card"
      aria-labelledby="business-qr-heading"
      className="bg-surface border border-border rounded-lg p-5 mb-6"
    >
      <h2
        id="business-qr-heading"
        className="font-headline-md text-lg font-bold text-text mb-1"
      >
        {t("title")}
      </h2>
      <p className="text-sm text-fg-muted mb-4">{t("body")}</p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* The preview carries the same quiet zone as the printed code (margin
            4 is inside the SVG's own viewBox), so nothing is drawn against it. */}
        <div
          data-testid="business-qr-preview"
          aria-hidden="true"
          className="w-28 h-28 shrink-0 rounded-md border border-border p-1 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />

        <div className="flex flex-col gap-2 flex-1">
          <button
            type="button"
            onClick={downloadSvg}
            disabled={!svg}
            data-testid="business-qr-download-svg"
            className="text-sm border border-border rounded-sm px-3 py-1.5 hover:border-primary transition disabled:opacity-50 disabled:hover:border-border"
          >
            {t("download_svg")}
          </button>
          <button
            type="button"
            onClick={downloadPng}
            disabled={!svg}
            data-testid="business-qr-download-png"
            className="text-sm border border-border rounded-sm px-3 py-1.5 hover:border-primary transition disabled:opacity-50 disabled:hover:border-border"
          >
            {t("download_png")}
          </button>
          <LocaleLink
            href="/producer/dashboard/qr-card"
            data-testid="business-qr-print-card"
            className="text-sm text-center border border-border rounded-sm px-3 py-1.5 hover:border-primary transition"
          >
            {t("print_card")}
          </LocaleLink>
        </div>
      </div>

      <p className="text-xs text-fg-muted mt-4">{t("hint")}</p>
    </section>
  );
}
