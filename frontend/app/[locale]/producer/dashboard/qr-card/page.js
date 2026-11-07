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
 * History:  MEH-2785 (creation)
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

  return (
    <main className="min-h-screen bg-surface" data-testid="business-qr-card-print">
      {/* Screen-only: neither the way back nor the hint belongs on the paper. */}
      <div className="print:hidden px-4 py-3 border-b border-border">
        <BackLink href="/producer/dashboard" label={t("back")} />
        <p className="font-body-sm text-sm text-fg-muted mt-1">{t("print_hint")}</p>
      </div>

      {/* A6 is 105×148mm. Sized in mm so what prints is what the business
          expects to tape up. On screen the width is CAPPED at 105mm rather
          than fixed to it — a fixed 105mm (~397px) overflows a 375px phone,
          the MEH-2733 lesson from the A5 counter card. Print keeps exact A6. */}
      <article
        className="w-full max-w-[105mm] print:w-[105mm] print:max-w-none mx-auto bg-surface text-black px-5 print:px-6 py-8 flex flex-col items-center justify-center text-center"
        style={{ minHeight: "148mm" }}
      >
        <h1 className="font-headline-md text-2xl font-black mb-6 break-words">
          {producer.name}
        </h1>

        {/* 50mm satisfies the 10:1 rule for a ~500mm scan distance. The quiet
            zone is the SVG's own `margin: 4` modules, so nothing — no border,
            no caption — is drawn against the code. The wrapper deliberately
            sets NO background: the SVG's own `light` colour already paints a
            rect over the entire viewBox, quiet zone included (measured from
            the generated markup — the first path in it is a full-size fill),
            so a white wrapper here would be a second owner of the same
            pixels. The colour itself has one owner, lib/qr.js. */}
        <div
          data-testid="business-qr-print-code"
          aria-hidden="true"
          className="w-[50mm] h-[50mm] [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />

        <p className="font-body-sm text-sm mt-4" dir="ltr">
          mehamakor.co.il
        </p>

        <p className="font-body-md text-lg leading-snug mt-8">{t("cta")}</p>
      </article>
    </main>
  );
}
