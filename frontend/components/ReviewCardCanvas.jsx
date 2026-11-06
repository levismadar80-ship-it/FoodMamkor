"use client";

/**
 * Module:   ReviewCardCanvas
 * Purpose:  MEH-1428 chunk B ("ערכת שיתוף") — turns one of the owner's visible
 *           reviews into a ready-to-post 1080×1920 story card: stars, the
 *           review text, her business name. Download + copy caption.
 * Touches:  GET /producers/{id}/reviews — public, page 1, newest-first. The
 *           `is_hidden=false` filter is applied SERVER-side (reviews.py:247),
 *           so a hidden review is never in the payload to begin with. No
 *           writes on any path.
 * Does NOT: render the reviewer. No name, no photo, no initial, no date — a
 *           card the owner posts publicly must not re-publish a customer's
 *           identity, so `ReviewOut.user_name` is not read here and is not
 *           even declared on ShareableReviewSchema. Does not paginate, reply
 *           to, hide or moderate reviews (ReviewsSection + admin own those);
 *           does not upload to Cloudinary (admin-only — see StoryCardCanvas's
 *           `mode` prop).
 * Related:  components/StoryCardCanvas.jsx (sibling card — this file imports
 *           its loadFonts / wrapText / drawLockup and both safe-band
 *           constants); components/producer/RequestReviewCard.jsx (the
 *           empty-state destination, mounted on dashboard/tools:166);
 *           app/[locale]/producer/dashboard/page.js (ShareKitSection, the
 *           only mount point).
 * History:  MEH-1428 (creation).
 *
 * NO PRINTED URL, deliberately. MEH-2589 took the URL off the story card
 * because text inside a story image is not clickable — the link goes on as an
 * Instagram link sticker, and the caption carries it for every other surface.
 * That ruling applies here unchanged. (The ticket's original spec asked for
 * "the existing footer_url line"; `story.canvas.footer_url` was deleted by
 * MEH-2589 and __tests__/StoryCardLayout.test.jsx:67-70 now asserts the story
 * card prints no URL at all. The brand lockup is this card's attribution.)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import { Link as LocaleLink } from "@/i18n/navigation";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { ReviewsPageSchema } from "@/lib/api-schemas";
import { SITE_URL } from "@/lib/env";
import {
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  drawLockup,
  loadFonts,
  wrapText,
} from "@/components/StoryCardCanvas";

const W = 1080;
const H = 1920;
const SIDE = 90;
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

// REUSES: components/StoryCardCanvas.jsx:60-64 — the same palette and faces,
// repeated as literals rather than exported. These are the brand's values, not
// this file-pair's, and StoryCardCanvas already duplicates its own
// unicode-range literals (:83-92) for the adjacent reason: a constant shared
// between exactly two call sites buys less than the comment explaining it.
const GREEN = "#2e6853";
const GREEN_DEEP = "#1f4a3a";
const CREAM = "#F5F0E8";
// The amber petal from the mark (StoryCardCanvas.jsx:78) — the brand's own
// gold, so the stars and the rule are not a new colour on the card.
const GOLD = "#E0B266";
const SERIF = `"Frank Ruhl Libre", serif`;
const SANS = `"Heebo", sans-serif`;

const HEADLINE_SIZE = 54;
const HEADLINE_Y = 470;
const STARS_CY = 590;
const STAR_SIZE = 62;
const STAR_GAP = 18;
const MAX_STARS = 5;
const DIM_STAR_ALPHA = 0.28;
const STAR_INNER_RATIO = 0.45;
const STAR_POINTS = 10;
// The gold rule at the quote's inline START (the RIGHT edge in RTL), mirroring
// ReviewExcerpt.jsx's `border-s-[3px] border-accent` on the public page
// (MEH-2596) — not a quote mark, which that ticket removed.
const RULE_W = 6;
const RULE_GAP = 34;
const QUOTE_TOP = 700;
const QUOTE_MAX = 72;
const QUOTE_MIN = 44;
const QUOTE_LH = 1.35;
const NAME_MAX = 46;
const NAME_MIN = 32;
// The business name sits at a FIXED baseline near the foot of the safe band
// rather than floating under the quote. Measured on the first QA pass: a
// one-line review left the name at y≈1150 with the bottom 40% of the card
// empty, which reads as an unfinished composition. Anchoring the name and
// centring the quote in the space above it fills the frame at every length.
const NAME_BASELINE = 1500;
const QUOTE_BOTTOM = NAME_BASELINE - 120;
const QUOTE_AREA_H = QUOTE_BOTTOM - QUOTE_TOP;
const PREVIEW_MAX_W = 270;
const COPIED_MS = 2500;
const JPEG_QUALITY = 0.92;
const CAPTION_BODY_MAX = 280;

// A five-pointed star centred on (cx, cy), `r` = outer radius.
function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < STAR_POINTS; i += 1) {
    const radius = i % 2 === 0 ? r : r * STAR_INNER_RATIO;
    const angle = (Math.PI / (STAR_POINTS / 2)) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Stars fill from `right` leftwards — the RTL reading order, so a 4-star review
// shows its empty star at the inline END (the left) exactly as the rating pills
// on the site do. Drawn as paths, never as ★: the committed Hebrew subsets of
// Frank Ruhl Libre and Heebo carry no U+2605, so a text star would silently
// fall back to whatever face the phone has.
function drawStars(ctx, stars, right, cy) {
  for (let i = 0; i < MAX_STARS; i += 1) {
    const cx = right - STAR_SIZE / 2 - i * (STAR_SIZE + STAR_GAP);
    const earned = i < stars;
    ctx.globalAlpha = earned ? 1 : DIM_STAR_ALPHA;
    ctx.fillStyle = earned ? GOLD : CREAM;
    starPath(ctx, cx, cy, STAR_SIZE / 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Largest size from QUOTE_MAX down to QUOTE_MIN at which the review fits the
// column in `maxHeight`; at QUOTE_MIN anything past the last line that fits is
// cut and the last line ends with a single «…».
function fitQuote(ctx, text, maxWidth, maxHeight) {
  const fits = (line) => ctx.measureText(line).width <= maxWidth;
  for (let size = QUOTE_MAX; size >= QUOTE_MIN; size -= 4) {
    ctx.font = `500 ${size}px ${SERIF}`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length * size * QUOTE_LH <= maxHeight && lines.every(fits)) {
      return { size, lines };
    }
  }
  ctx.font = `500 ${QUOTE_MIN}px ${SERIF}`;
  const all = wrapText(ctx, text, maxWidth);
  const maxLines = Math.max(1, Math.floor(maxHeight / (QUOTE_MIN * QUOTE_LH)));
  const lines = all.slice(0, maxLines);
  const last = lines.length - 1;
  // ONE ellipsis, whichever reason put it there: the text was cut short of its
  // end, or the final line is itself too wide (a single long word). Appending
  // in both branches is what produces «……».
  let tail = lines[last] ?? "";
  if (all.length > maxLines) tail = `${tail.trimEnd()}…`;
  while (!fits(tail) && tail.length > 1) {
    tail = `${tail.replace(/…$/, "").slice(0, -1).trimEnd()}…`;
  }
  lines[last] = tail;
  return { size: QUOTE_MIN, lines };
}

// Largest size from `max` down to `min` at which `text` fits `maxWidth` on ONE
// line; at `min` the caller cuts it with «…». Without this the business name
// was drawn at any length and a long one ran straight off the inline end of the
// canvas — measured on the first QA pass, where "…מזכרון יעקב והסביבה" was
// clipped away entirely. Options object, not four positional args.
function fitOneLine(ctx, text, opts) {
  const { maxWidth, max, min, font } = opts;
  for (let size = max; size >= min; size -= 2) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  ctx.font = font(min);
  return min;
}

function cutToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out.trimEnd()}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out.trimEnd()}…`;
}

/**
 * Draws the card. Returns false when there is no 2D context (lost context, or
 * a canvas the browser refuses to back), so the caller leaves the download
 * disabled instead of offering a blank JPEG — same contract as drawCard.
 */
export async function drawReviewCard(canvas, producer, review, strings) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  await loadFonts();

  canvas.width = W;
  canvas.height = H;
  // The bidi algorithm orders each line's runs for us — this is what keeps
  // Hebrew punctuation at the correct edge and a mixed "Shabbat 2024" run
  // internally LTR inside an RTL line.
  ctx.direction = "rtl";

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GREEN_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  drawLockup(ctx, W / 2, STORY_SAFE_TOP + 50);

  const right = W - SIDE;
  const textRight = right - RULE_W - RULE_GAP;
  const column = textRight - SIDE;

  ctx.textAlign = "right";

  if (strings?.headline) {
    ctx.fillStyle = CREAM;
    ctx.font = `700 ${HEADLINE_SIZE}px ${SERIF}`;
    ctx.fillText(strings.headline, textRight, HEADLINE_Y);
  }

  drawStars(ctx, review?.stars ?? 0, textRight, STARS_CY);

  // A rating-only review is filtered out before it reaches this component (see
  // SHAREABLE below), so `lines` is non-empty in practice; the guard keeps a
  // body-less review from drawing a zero-height rule.
  const body = (review?.body || "").trim();
  const quote = body
    ? fitQuote(ctx, body, column, QUOTE_AREA_H)
    : { size: QUOTE_MIN, lines: [] };

  // Centre the block in its area so a one-line review sits in the middle of the
  // card instead of hugging the stars with the lower third left empty.
  const blockH = quote.lines.length * quote.size * QUOTE_LH;
  const blockTop = QUOTE_TOP + Math.max(0, (QUOTE_AREA_H - blockH) / 2);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `500 ${quote.size}px ${SERIF}`;
  let firstBaseline = blockTop + quote.size;
  let lastBaseline = firstBaseline;
  quote.lines.forEach((line, i) => {
    lastBaseline = firstBaseline + i * quote.size * QUOTE_LH;
    ctx.fillText(line, textRight, lastBaseline);
  });

  // The gold rule spans the whole quote, cap-height to descender — not the
  // single stub it was when it ran baseline-to-baseline on a one-line review.
  if (quote.lines.length > 0) {
    ctx.fillStyle = GOLD;
    const ruleTop = firstBaseline - quote.size * 0.78;
    const ruleBottom = lastBaseline + quote.size * 0.25;
    ctx.fillRect(right - RULE_W, ruleTop, RULE_W, ruleBottom - ruleTop);
  }

  // Fitted, then cut: a long business name used to run off the inline end.
  ctx.fillStyle = "#EAF3DE";
  const nameFont = (size) => `600 ${size}px ${SANS}`;
  const rawName = producer?.name || "";
  fitOneLine(ctx, rawName, { maxWidth: column, max: NAME_MAX, min: NAME_MIN, font: nameFont });
  ctx.fillText(cutToWidth(ctx, rawName, column), textRight, NAME_BASELINE);

  ctx.textAlign = "center";
  return true;
}

/**
 * @param {object} props
 * @param {object} props.producer the owner's own business (GET /producers/me)
 */
export default function ReviewCardCanvas({ producer }) {
  const t = useTranslations("story.canvas");
  const tError = useTranslations("error");
  const canvasRef = useRef(null);
  // null = in flight, [] = none to share, [...] = shareable
  const [reviews, setReviews] = useState(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [rendered, setRendered] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);
  const copiedTimer = useRef(null);

  const producerId = producer?.id;

  useEffect(() => {
    if (!producerId) return undefined;
    let alive = true;
    const controller = new AbortController();

    // SHAREABLE: only reviews that have text. A stars-only review makes a card
    // that says nothing, and ReviewExcerpt.jsx:44 already skips them on the
    // public page for the same reason.
    const shareable = (rows) => rows.filter((rv) => rv.body && rv.body.trim());

    // The filter runs client-side but the endpoint paginates at 10
    // (reviews.py PAGE_SIZE), so page 1 alone cannot answer "do I have a review
    // to share": a business whose ten newest reviews are all rating-only would
    // be told it has none while page 2 holds text. Keep asking until something
    // shareable turns up or the pages run out — capped, because the honest
    // answer is not worth an unbounded walk of a long review history. A
    // business that is past the cap with nothing shareable in 50 reviews is
    // correctly on the empty state.
    const MAX_PAGES = 5;
    const collect = async () => {
      const found = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const r = await api.get(`/producers/${producerId}/reviews`, {
          params: { page },
          signal: controller.signal,
        });
        // Rule 19: a malformed payload is an error state, never something a
        // canvas renders half of.
        const parsed = ReviewsPageSchema.safeParse(r.data);
        if (!parsed.success) throw new Error("malformed reviews payload");
        found.push(...shareable(parsed.data.reviews));
        const pages = Number(r.data?.pages ?? 1);
        if (found.length > 0 || page >= pages) break;
      }
      return found;
    };

    collect()
      .then((found) => {
        if (alive) setReviews(found);
      })
      .catch((err) => {
        // Only a genuine abort is silent (axios CanceledError on unmount).
        // REUSES: app/[locale]/producer/[id]/components/ReviewExcerpt.jsx:50-56.
        if (err?.code === "ERR_CANCELED") return;
        Sentry.captureException(err);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [producerId]);

  const review = reviews?.[index] ?? null;

  // Depends on the FIELD the card draws, not on the `producer` object: that
  // object is the dashboard's `profile`, and any refetch mints a new identity,
  // which would re-run the draw and blink `rendered` (and the download button)
  // off for no reason.
  const producerName = producer?.name;

  useEffect(() => {
    if (!canvasRef.current || !review) return;
    setRendered(false);
    drawReviewCard(canvasRef.current, { name: producerName }, review, {
      headline: t("owner.review_headline"),
    })
      .then((ok) => setRendered(ok !== false))
      .catch(() => setRendered(false));
  }, [producerName, review, t]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${producer?.slug || producerId}-review-card.jpg`;
    link.href = canvasRef.current.toDataURL("image/jpeg", JPEG_QUALITY);
    link.click();
  };

  const copyCaption = useCallback(() => {
    if (!review) return;
    const body = (review.body || "").trim();
    const quoted =
      body.length > CAPTION_BODY_MAX
        ? `${body.slice(0, CAPTION_BODY_MAX).trimEnd()}…`
        : body;
    const caption = [
      t("owner.review_headline"),
      quoted,
      producer?.name || "",
      `👉 ${SITE_HOST}/p/${producer?.slug || ""}`,
    ]
      .filter(Boolean)
      .join("\n");
    const write = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(caption)
      : Promise.reject(new Error("clipboard unavailable"));
    write
      .then(() => {
        setCaptionCopied(true);
        clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCaptionCopied(false), COPIED_MS);
      })
      // A denied clipboard, or none at all (insecure context, some in-app
      // WebViews), must SAY so — silently doing nothing reads as a dead button.
      // REUSES: components/producer/RequestReviewCard.jsx:71.
      .catch(() => {
        setCaptionCopied(false);
        showToast.error(tError("generic"));
      });
  }, [review, producer, t, tError]);

  return (
    <div className="mt-6 border-t border-border pt-5" data-testid="review-card-block">
      <p className="text-sm font-semibold text-text mb-3">{t("owner.review_title")}</p>

      {failed && (
        <p className="text-sm text-fg-muted" role="alert" data-testid="review-card-error">
          {tError("generic")}
        </p>
      )}

      {!failed && reviews === null && (
        <p className="text-sm text-fg-muted" data-testid="review-card-loading">
          {t("generating")}...
        </p>
      )}

      {/* 0 reviews to share — the one state with no canvas. The CTA points at
          the existing surface that mints the link (RequestReviewCard on
          dashboard/tools), rather than re-implementing the fetch here: two
          owners for "the review invite link" is the smell workflow.md names. */}
      {!failed && reviews?.length === 0 && (
        <p className="text-sm text-fg-muted" data-testid="review-card-empty">
          {t.rich("owner.reviews_empty", {
            link: (chunks) => (
              <LocaleLink
                href="/producer/dashboard/tools"
                className="text-primary font-medium hover:underline"
                data-testid="review-card-empty-cta"
              >
                {chunks}
              </LocaleLink>
            ),
          })}
        </p>
      )}

      {review && (
        <div className="space-y-4">
          {/* The picker appears only from the SECOND review onward — a select
              with one option is a control that cannot do anything. */}
          {reviews.length > 1 && (
            <div>
              <label
                htmlFor="share-kit-review-pick"
                className="block text-sm text-fg-muted mb-1"
              >
                {t("owner.pick_review")}
              </label>
              <select
                id="share-kit-review-pick"
                data-testid="review-card-pick"
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
                className="w-full max-w-sm border border-border rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {reviews.map((rv, i) => (
                  <option key={rv.id} value={i}>
                    {/* Option text is review DATA, not UI copy: the rating as
                        digits (the ★ glyph is missing from the brand faces) and
                        the opening words, so she can tell them apart. Still no
                        reviewer name.
                        The snippet is wrapped in U+2068 FSI … U+2069 PDI —
                        invisible characters, NOT mojibake, do not strip them.
                        Without the isolate a review opening in Latin reorders
                        against the RTL option and can drag the "4/5 ·" prefix
                        to the wrong end of the row. */}
                    {`${rv.stars}/${MAX_STARS} · ⁨${(rv.body || "").trim().slice(0, 40)}⁩`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Same 9:16 frame as StoryCardCanvas — the canvas carries its own
              ratio with `height: auto` (MEH-2511: a percentage height inside a
              table cell went unresolved in WebKit and rendered ×4). */}
          <div
            className="relative bg-[#1f4a3a] rounded-md overflow-hidden"
            style={{ aspectRatio: "9/16", maxWidth: PREVIEW_MAX_W }}
          >
            <canvas
              ref={canvasRef}
              data-testid="review-card-canvas"
              style={{ width: "100%", height: "auto", aspectRatio: "9/16", display: "block" }}
            />
            {!rendered && (
              <div className="absolute inset-0 flex items-center justify-center text-white text-xs opacity-60">
                {t("generating")}...
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={download}
              disabled={!rendered}
              data-testid="review-card-download"
              className="text-sm border border-border px-4 py-2 rounded-sm hover:border-primary transition disabled:opacity-40"
            >
              <DownloadSimple size={16} className="inline align-[-2px]" aria-hidden="true" />{" "}
              {t("owner.download_review")}
            </button>
            <button
              type="button"
              onClick={copyCaption}
              data-testid="review-card-copy-caption"
              className="text-sm border border-border px-4 py-2 rounded-sm hover:border-primary transition"
            >
              {captionCopied ? t("owner.copied") : t("owner.copy_caption")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
