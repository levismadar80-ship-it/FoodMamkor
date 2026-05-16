/**
 * Module:   GuideArticle
 * Purpose:  Shared shell for MEH-539 onboarding guide pages under
 *           /about/for-businesses/guides/{slug}. Renders a structured
 *           `blocks` array as Hebrew RTL prose with the brand's
 *           Frank-Ruhl-headlines / DM-Sans-body typography pair.
 * Touches:  none (server-rendered presentation only).
 * Does NOT: own SEO metadata (each page.js exports its own
 *           `metadata`); own routing (App Router handles that); decide
 *           when emails fire (that lives in
 *           backend/app/services/onboarding_followup.py).
 * Related:  frontend/app/[locale]/about/for-businesses/page.js (same
 *           visual tone — header, max-w-3xl container, primary green
 *           CTA), frontend/tailwind.config.js:10-22 (color tokens),
 *           frontend/tailwind.config.js:29-36 (font tokens).
 * History:  MEH-539 (creation, 2026-05-16) — Phase 2D of MEH-615.
 */
import Link from "next/link";
import { BRAND_NAME } from "@/lib/constants";

const PRIMARY = "#2e6853";
const PRIMARY_DARK = "#2E4A2E";
const BODY_INK = "#1C1A17";
const BODY_PROSE = "#3a3a3a";
const EYEBROW_GOLD = "#8B6914";
const BG_CREAM = "#F5F0E8";
const RULE_GREEN_ALPHA = "rgba(46,104,83,0.18)";

function InlineBold({ text, idBase }) {
  // **bold** segments → <strong>; \n → <br>; everything else passes through.
  const lines = String(text ?? "").split("\n");
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, i) => {
      const key = `${idBase}-${lineIdx}-${i}`;
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      return <span key={key}>{part}</span>;
    });
    if (lineIdx < lines.length - 1) {
      return (
        <span key={`${idBase}-line-${lineIdx}`}>
          {rendered}
          <br />
        </span>
      );
    }
    return <span key={`${idBase}-line-${lineIdx}`}>{rendered}</span>;
  });
}

function renderBlock(block, i) {
  const key = `b-${i}`;
  switch (block.type) {
    case "h2":
      return (
        <h2
          key={key}
          className="font-headline mt-10 mb-3 sm:mt-12"
          style={{ color: PRIMARY, fontSize: "22px", fontWeight: 700 }}
        >
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={key}
          className="font-headline mt-8 mb-2"
          style={{ color: PRIMARY_DARK, fontSize: "18px", fontWeight: 700 }}
        >
          {block.text}
        </h3>
      );
    case "p":
      return (
        <p
          key={key}
          className="mb-4 text-[16px] sm:text-[17px] leading-[1.8]"
          style={{ color: BODY_PROSE }}
        >
          <InlineBold text={block.text} idBase={key} />
        </p>
      );
    case "ul":
    case "ol": {
      const Tag = block.type === "ul" ? "ul" : "ol";
      const listClass =
        block.type === "ul"
          ? "list-disc ms-6 mb-4 space-y-2 text-[16px] sm:text-[17px] leading-[1.8]"
          : "list-decimal ms-6 mb-4 space-y-2 text-[16px] sm:text-[17px] leading-[1.8]";
      return (
        <Tag key={key} className={listClass} style={{ color: BODY_PROSE }}>
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`}>
              <InlineBold text={item} idBase={`${key}-${j}`} />
            </li>
          ))}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-s-4 ps-4 my-5 text-[16px] sm:text-[17px] leading-[1.8] italic"
          style={{
            borderColor: PRIMARY,
            color: BODY_INK,
            backgroundColor: "rgba(46,104,83,0.04)",
            paddingTop: "10px",
            paddingBottom: "10px",
          }}
        >
          <InlineBold text={block.text} idBase={key} />
        </blockquote>
      );
    case "hr":
      return (
        <hr
          key={key}
          className="my-8"
          style={{ border: "none", borderTop: `1px solid ${RULE_GREEN_ALPHA}` }}
        />
      );
    case "callout":
      return (
        <p
          key={key}
          className="mb-4 text-[16px] sm:text-[17px] leading-[1.8] italic"
          style={{ color: PRIMARY_DARK }}
        >
          <InlineBold text={block.text} idBase={key} />
        </p>
      );
    default:
      return null;
  }
}

export default function GuideArticle({
  title,
  subtitle,
  readMinutes,
  blocks,
  backHref = "/about/for-businesses/guides",
}) {
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BG_CREAM, color: BODY_INK }}
    >
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <p
            className="text-xs sm:text-sm mb-3"
            style={{
              color: EYEBROW_GOLD,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            מדריך לבעלות עסק · קריאה כ-{readMinutes} דקות
          </p>
          <h1
            className="font-headline mb-3"
            style={{
              color: PRIMARY_DARK,
              fontSize: "clamp(28px, 6vw, 44px)",
              lineHeight: 1.15,
              fontWeight: 900,
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className="italic text-[17px] sm:text-[18px] leading-relaxed"
              style={{ color: BODY_PROSE }}
            >
              {subtitle}
            </p>
          ) : null}
        </header>

        <div>{blocks.map(renderBlock)}</div>

        <footer
          className="mt-14 sm:mt-16 border-t pt-8"
          style={{ borderColor: RULE_GREEN_ALPHA }}
        >
          <p
            className="text-[15px] mb-2 font-headline"
            style={{ color: BODY_INK, fontWeight: 600 }}
          >
            ספיר שנפ
          </p>
          <p className="text-[14px] mb-6" style={{ color: BODY_PROSE }}>
            מייסדת · {BRAND_NAME} · mehamakor.co.il
          </p>
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-[15px] underline"
            style={{ color: PRIMARY }}
          >
            ← חזרה למדריכים
          </Link>
        </footer>
      </article>
    </main>
  );
}
