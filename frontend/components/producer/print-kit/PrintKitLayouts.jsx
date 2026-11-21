// @ts-check

/**
 * Module:   PrintKitLayouts
 * Purpose:  The four things a business prints from /producer/dashboard/qr-card:
 *           the A6 card, an A4 poster, a folded table sign and a sheet of 12
 *           round stickers. Each is sized in mm for paper and capped to the
 *           screen width on a phone (the MEH-2733 lesson: a fixed 105mm
 *           overflows a 375px screen).
 * Touches:  nothing. The QR markup and the business name come in as props.
 * Does NOT: fetch, gate or build the QR URL. The page owns the gate and
 *           lib/qr.js owns the URL, so every format points at the same place.
 * Related:  app/[locale]/producer/dashboard/qr-card/page.js (the page);
 *           lib/qr.js (URL + render options).
 * History:  MEH-2785 (A6 card, in the page); MEH-3557 (the kit).
 *
 * NO ANCHOR MAY SIT INSIDE A PRINTED <article>. globals.css appends ` (href)`
 * after every `a[href]` in print, so a link would print its own URL. The domain
 * under a code is plain text on purpose.
 */

export const PRINT_FORMATS = /** @type {const} */ (["a6", "poster", "table", "sticker"]);
const STICKER_COUNT = 12;

/**
 * The QR markup, drawn at the size of its box. The SVG paints its own quiet
 * zone and background (lib/qr.js), so the wrapper sets none.
 * @param {{ svg: string|null, className: string, testId?: string }} props
 */
function QrBox({ svg, className, testId }) {
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className={`${className} [&>svg]:w-full [&>svg]:h-full`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/** @typedef {{ name: string, svg: string|null, t: (key: string, values?: Record<string, string>) => string }} LayoutProps */

/** A6 is 105×148mm. 50mm of code satisfies the 10:1 rule at ~500mm. @param {LayoutProps} props */
function A6Card({ name, svg, t }) {
  return (
    <article
      data-testid="print-kit-a6"
      className="w-full max-w-[105mm] print:w-[105mm] print:max-w-none mx-auto bg-surface text-text px-5 print:px-6 py-8 flex flex-col items-center justify-center text-center"
      style={{ minHeight: "148mm" }}
    >
      <h1 className="font-headline-md text-2xl font-black mb-6 break-words">{name}</h1>
      <QrBox svg={svg} testId="business-qr-print-code" className="w-[50mm] h-[50mm]" />
      <p className="font-body-sm text-sm mt-4" dir="ltr">mehamakor.co.il</p>
      <p className="font-body-md text-lg leading-snug mt-8">{t("cta")}</p>
    </article>
  );
}

/** A4 is 210×297mm; a 110mm code scans from about a metre. @param {LayoutProps} props */
function A4Poster({ name, svg, t }) {
  return (
    <article
      data-testid="print-kit-poster"
      className="w-full max-w-[210mm] print:w-[210mm] print:max-w-none print:h-[297mm] print:overflow-hidden mx-auto bg-surface text-text px-6 print:px-[15mm] py-10 flex flex-col items-center justify-center text-center"
      style={{ minHeight: "297mm" }}
    >
      <h1 className="font-headline-md text-4xl print:text-5xl font-black mb-8 break-words line-clamp-3">{name}</h1>
      <QrBox svg={svg} className="w-[min(110mm,75vw)] h-[min(110mm,75vw)] print:w-[110mm] print:h-[110mm]" />
      <p className="font-body-sm text-base mt-4" dir="ltr">mehamakor.co.il</p>
      <p className="font-headline-md text-2xl print:text-4xl font-bold leading-snug mt-10">{t("cta")}</p>
      <p className="font-body-md text-lg print:text-2xl leading-snug mt-4">{t("poster_line")}</p>
    </article>
  );
}

/** @param {LayoutProps & { flipped?: boolean }} props */
function TableSignHalf({ name, svg, t, flipped = false }) {
  return (
    <div
      data-testid={flipped ? "print-kit-table-top" : "print-kit-table-bottom"}
      className={`flex flex-col items-center justify-center text-center px-6 min-h-[148.5mm] print:min-h-0 print:flex-1 ${flipped ? "rotate-180" : ""}`}
    >
      <h2 className="font-headline-md text-2xl print:text-3xl font-black mb-5 break-words">{name}</h2>
      <QrBox svg={svg} className="w-[min(60mm,55vw)] h-[min(60mm,55vw)] print:w-[60mm] print:h-[60mm]" />
      <p className="font-body-sm text-sm mt-3" dir="ltr">mehamakor.co.il</p>
      <p className="font-body-md text-lg leading-snug mt-5">{t("cta")}</p>
    </div>
  );
}

/**
 * An A4 sheet folded across the middle into a tent. The top half is turned
 * 180° so that, standing, both faces read the right way up.
 * @param {LayoutProps} props
 */
function TableSign(props) {
  return (
    <article
      data-testid="print-kit-table"
      className="w-full max-w-[210mm] print:w-[210mm] print:max-w-none print:h-[297mm] print:overflow-hidden print:flex print:flex-col mx-auto bg-surface text-text"
    >
      <TableSignHalf {...props} flipped />
      {/* The fold line: dashed, so it guides the fold and reads as one. */}
      <div aria-hidden="true" className="border-t border-dashed border-border" />
      <TableSignHalf {...props} />
    </article>
  );
}

/**
 * 12 round stickers, 3 × 4 on A4. Each cell is 70 × 74mm and each circle 64mm,
 * so a 3mm margin keeps a printer's edge clear of every cut line. On a phone
 * the sheet scales by percentage; on paper it is exact.
 * @param {LayoutProps} props
 */
function StickerSheet({ name, svg, t }) {
  const label = t("sticker_label", { name });
  return (
    <article
      data-testid="print-kit-sticker"
      className="w-full max-w-[210mm] print:w-[210mm] print:max-w-none mx-auto bg-surface text-text grid grid-cols-3 print:h-[297mm] print:overflow-hidden print:px-0 py-4 print:py-[2mm]"
    >
      {Array.from({ length: STICKER_COUNT }, (_, i) => (
        <div key={i} className="flex items-center justify-center p-1 print:p-0 print:h-[73mm]">
          <div
            data-testid="print-kit-sticker-item"
            className="w-full max-w-[64mm] print:w-[64mm] aspect-square rounded-full border border-border flex flex-col items-center justify-center text-center overflow-hidden"
          >
            <QrBox svg={svg} className="w-1/2 aspect-square" />
            <p className="font-body-sm text-[9px] print:text-[8pt] font-bold leading-tight mt-1 px-[12%] break-words line-clamp-2">
              {label}
            </p>
          </div>
        </div>
      ))}
    </article>
  );
}

export const LAYOUTS = { a6: A6Card, poster: A4Poster, table: TableSign, sticker: StickerSheet };
