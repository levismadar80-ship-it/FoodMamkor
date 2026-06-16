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

// MEH-821: brand colors via canonical ADR-019 token classes (text-primary,
// text-primary-dark, text-text, text-accent, bg-background, border-border) —
// was module-scope hex consts + inline style props.

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
          className="font-headline-md mt-10 mb-3 sm:mt-12 text-primary text-[22px] font-bold"
        >
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={key}
          className="font-headline-md mt-8 mb-2 text-primary-dark text-[18px] font-bold"
        >
          {block.text}
        </h3>
      );
    case "p":
      return (
        <p
          key={key}
          className="mb-4 text-[16px] sm:text-[17px] leading-[1.8] text-text/90"
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
        <Tag key={key} className={`${listClass} text-text/90`}>
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
          className="border-s-4 border-primary ps-4 py-2.5 my-5 text-[16px] sm:text-[17px] leading-[1.8] italic text-text bg-primary/[0.04]"
        >
          <InlineBold text={block.text} idBase={key} />
        </blockquote>
      );
    case "hr":
      return (
        <hr key={key} className="my-8 border-0 border-t border-border" />
      );
    case "callout":
      return (
        <p
          key={key}
          className="mb-4 text-[16px] sm:text-[17px] leading-[1.8] italic text-primary-dark"
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
    <main className="min-h-screen bg-background text-text">
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <p className="text-xs sm:text-sm mb-3 text-accent tracking-[0.12em] uppercase">
            מדריך לבעלות עסק · קריאה כ-{readMinutes} דקות
          </p>
          <h1 className="font-headline-lg mb-3 text-primary-dark text-[clamp(28px,6vw,44px)] leading-[1.15] font-black">
            {title}
          </h1>
          {subtitle ? (
            <p className="italic text-[17px] sm:text-[18px] leading-relaxed text-text/90">
              {subtitle}
            </p>
          ) : null}
        </header>

        <div>{blocks.map(renderBlock)}</div>

        <footer className="mt-14 sm:mt-16 border-t border-border pt-8">
          <p className="text-[15px] mb-2 font-headline-md text-text font-semibold">
            ספיר שנפ
          </p>
          <p className="text-[14px] mb-6 text-text/90">
            מייסדת · {BRAND_NAME} · mehamakor.co.il
          </p>
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-[15px] underline text-primary"
          >
            ← חזרה למדריכים
          </Link>
        </footer>
      </article>
    </main>
  );
}
