"use client";

/**
 * MEH-53: Instagram story card generator (1080×1920px), composed in-browser
 * with the Canvas API.
 *
 * MEH-2589 redesign ("magazine cover"):
 *   - Business photo full-bleed (1080×1500, cover-fit), fading into brand
 *     green #1f4a3a at the bottom. No photo → brand-green ground + large mark.
 *   - Brand lockup (mark + מהמקור) at the top, just below Instagram's header.
 *   - Cream label pill, then the business name in Frank Ruhl Libre 900,
 *     120px shrinking to 76px to fit two lines (then «…»), then
 *     city · first two categories in Heebo 44px.
 *   - Every line of text sits between STORY_SAFE_TOP and STORY_SAFE_BOTTOM —
 *     Instagram's own UI covers the band above (progress bar, account row)
 *     and below (reply bar).
 *   - No printed URL: text in a story image is not clickable. The link goes
 *     on as an Instagram link sticker in the empty band under the city line.
 */

import { useEffect, useRef, useState } from "react";
import { Camera, DownloadSimple, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
// MEH-1250: retire native alert() on the async upload-error path (toast idiom).
import { showToast } from "@/lib/toast";
import { BRAND_NAME } from "@/lib/constants";
// MEH-1267: canonical public domain (MEH-1242 PR4). mehamakor.online is the
// staging alias — never the public-facing address; SITE_URL is mehamakor.co.il.
// Used by the caption only; the card itself carries no URL (MEH-2589).
import { SITE_URL } from "@/lib/env";
// MEH-2043: the same committed binaries app/fonts.js feeds to next/font/local
// (MEH-2029 provenance: byte-for-byte copies of what next/font/google last
// emitted — see app/fonts/README.md). Canvas 2D's `font` property can't go
// through next/font/local itself (it publishes a CSS variable + class, not a
// URL a FontFace can load), so this imports the raw files directly — Next's
// static-asset loader resolves each import to its build URL. Each family's
// hebrew and latin subsets are loaded under the SAME family name below,
// exactly like fonts.js's dual-call pattern, so the browser's own
// glyph-coverage matching picks hebrew vs. latin per character.
// MEH-2589: Heebo replaces DM Sans for the small lines — DM Sans has no Hebrew
// glyphs, so city/category text used to fall back to whatever system font the
// phone had.
import frankRuhlLibreHebrewUrl from "@/app/fonts/frank-ruhl-libre-hebrew.woff2";
import frankRuhlLibreLatinUrl from "@/app/fonts/frank-ruhl-libre-latin.woff2";
import heeboHebrewUrl from "@/app/fonts/heebo-hebrew.woff2";
import heeboLatinUrl from "@/app/fonts/heebo-latin.woff2";

const W = 1080;
const H = 1920;
// Bare host for the caption (SITE_URL is the full https:// origin).
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

// Instagram story chrome: ~250px on top, ~340px at the bottom (the larger,
// ad-placement figure, so organic stories are covered too).
export const STORY_SAFE_TOP = 250;
export const STORY_SAFE_BOTTOM = H - 340;

const GREEN = "#2e6853";
const GREEN_DEEP = "#1f4a3a";
const CREAM = "#F5F0E8";
const SERIF = `"Frank Ruhl Libre", serif`;
const SANS = `"Heebo", sans-serif`;
const PHOTO_H = 1500;
const SIDE = 90;
// The mark from public/logo-inverted.svg (the variant for brand-green
// grounds), drawn as paths rather than loaded as an <img>: an SVG image can
// taint the canvas in some WebKit builds, which would make toDataURL — and so
// download and the Cloudinary upload — throw, and Firefox refuses drawImage
// for an SVG with no intrinsic size. Values copied from the SVG; viewBox
// -60 -60 120 120. [rotation°, opacity, petal fill, seed fill, seed opacity]
const MARK_PETAL_D =
  "M 0,-44 C 10,-44 13,-32 11,-20 C 9,-12 5,-8 0,-6 C -5,-8 -9,-12 -11,-20 C -13,-32 -10,-44 0,-44 Z";
const MARK_PETALS = [
  [36, 0.96, "#F5F0E8", "#1F4A3A", 0.3],
  [108, 0.96, "#E8823A", "#F5F0E8", 0.45],
  [180, 0.96, "#E0B266", "#F5F0E8", 0.45],
  [252, 0.92, "#D9C8B0", "#1F4A3A", 0.25],
  [324, 0.96, "#8FB89F", "#F5F0E8", 0.5],
];

// Same ranges app/fonts.js declares for these families' next/font/local
// calls (`declarations: [{ prop: "unicode-range", ... }]`) — literal, not
// imported: a FontFace() descriptor isn't under next/font/local's
// static-serialization constraint, but duplicating the exact values (rather
// than sharing a constant) matches how fonts.js already repeats this same
// latin range across its own calls, for a different but adjacent reason.
const HEBREW_RANGE =
  "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F";
const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

async function loadFonts() {
  // Each FontFace carries an explicit `unicodeRange` descriptor (3rd
  // constructor arg): without one it defaults to the full codespace, so BOTH
  // same-named faces would claim every character and which one wins for a
  // given glyph is unspecified. The weight range lets one variable file serve
  // every weight drawn below.
  const faces = [
    ["Frank Ruhl Libre", frankRuhlLibreHebrewUrl, HEBREW_RANGE],
    ["Frank Ruhl Libre", frankRuhlLibreLatinUrl, LATIN_RANGE],
    ["Heebo", heeboHebrewUrl, HEBREW_RANGE],
    ["Heebo", heeboLatinUrl, LATIN_RANGE],
  ];
  for (const [name, url, unicodeRange] of faces) {
    try {
      const f = new FontFace(name, `url(${url})`, { unicodeRange, weight: "100 900" });
      await f.load();
      document.fonts.add(f);
    } catch {
      // fall back to system font if a local font file fails to load
    }
  }
}

// Resolves to null on failure, so one missing image never blocks the card.
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function photoSrc(url) {
  // g_auto: Cloudinary picks the crop around the subject, not the centre.
  return url.includes("cloudinary.com")
    ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${W},h_${PHOTO_H},c_fill,g_auto/`)
    : url;
}

// Draws img over (x, y, w, h) like CSS object-fit: cover.
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function wrapLines(ctx, text, maxWidth) {
  const out = [];
  let line = "";
  for (const word of (text || "").split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      out.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out;
}

// Largest size from `max` down to `min` at which the name fits in two lines;
// at `min` anything past line two is cut and the second line ends with «…».
function fitName(ctx, text, maxWidth) {
  const max = 120;
  const min = 76;
  for (let size = max; size >= min; size -= 4) {
    ctx.font = `900 ${size}px ${SERIF}`;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= 2) return { size, lines };
  }
  ctx.font = `900 ${min}px ${SERIF}`;
  const lines = wrapLines(ctx, text, maxWidth).slice(0, 2);
  let last = `${lines[1]}…`;
  while (ctx.measureText(last).width > maxWidth && last.includes(" ")) {
    last = `${last.slice(0, -1).replace(/\s*\S+$/, "")}…`;
  }
  lines[1] = last;
  return { size: min, lines };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draws the mark centred on (cx, cy), `size` px square.
function drawMark(ctx, cx, cy, size) {
  if (typeof Path2D === "undefined") return;
  const petal = new Path2D(MARK_PETAL_D);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 120, size / 120);
  for (const [deg, alpha, fill, seed, seedAlpha] of MARK_PETALS) {
    ctx.save();
    ctx.rotate((deg * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fill(petal);
    ctx.globalAlpha = alpha * seedAlpha;
    ctx.fillStyle = seed;
    ctx.beginPath();
    ctx.ellipse(-3, -32, 2.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// Brand lockup centred on (cx, cy): wordmark with the mark at its start
// (right) side, as on the site header.
function drawLockup(ctx, cx, cy) {
  const size = 56;
  ctx.font = `700 ${size}px ${SERIF}`;
  const textW = ctx.measureText(BRAND_NAME).width;
  const markSize = size * 1.25;
  const gap = size * 0.3;
  const left = cx - (textW + gap + markSize) / 2;
  ctx.fillStyle = CREAM;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(BRAND_NAME, left, cy);
  drawMark(ctx, left + textW + gap + markSize / 2, cy, markSize);
  ctx.textBaseline = "alphabetic";
}

// Cream pill whose end (right) edge sits at `right`.
function drawLabel(ctx, text, right, cy) {
  const h = 68;
  ctx.font = `600 34px ${SANS}`;
  const w = ctx.measureText(text).width + 60;
  ctx.fillStyle = CREAM;
  roundRect(ctx, right - w, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = GREEN;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, right - w / 2, cy + 2);
  ctx.textBaseline = "alphabetic";
}

export async function drawCard(canvas, producer, strings) {
  await loadFonts();
  const imageUrl = producer.images?.[0];
  const photo = imageUrl ? await loadImage(photoSrc(imageUrl)) : null;

  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;
  ctx.direction = "rtl";

  // Ground
  let g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GREEN_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (photo) {
    drawCover(ctx, photo, 0, 0, W, PHOTO_H);
    // Top scrim keeps Instagram's header and the lockup readable on a light photo.
    g = ctx.createLinearGradient(0, 0, 0, 420);
    g.addColorStop(0, "rgba(20,40,32,0.55)");
    g.addColorStop(1, "rgba(20,40,32,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 420);
    // Bottom fade into brand green, under the label/name/city block.
    g = ctx.createLinearGradient(0, 820, 0, PHOTO_H);
    g.addColorStop(0, "rgba(31,74,58,0)");
    g.addColorStop(0.55, "rgba(31,74,58,0.85)");
    g.addColorStop(1, GREEN_DEEP);
    ctx.fillStyle = g;
    ctx.fillRect(0, 820, W, H - 820);
  } else {
    // No photo: the mark, large, where the photo would be.
    drawMark(ctx, W / 2, 660, 420);
  }

  drawLockup(ctx, W / 2, 300);

  const right = W - SIDE;
  if (strings?.kicker) drawLabel(ctx, strings.kicker, right, 1060);

  ctx.textAlign = "right";
  ctx.fillStyle = "#FFFFFF";
  const name = fitName(ctx, producer.name || "", W - SIDE * 2);
  let y = 1130 + name.size;
  for (const line of name.lines) {
    ctx.fillText(line, right, y);
    y += name.size * 1.12;
  }

  // MEH-1297: cap at the first 2 categories (primary-first order) so a producer
  // with up to 3 categories can't overflow the line.
  const categories =
    producer.categories
      ?.slice(0, 2)
      .map((c) => c.name)
      .join(" · ") || "";
  const metaLine = [producer.city, categories].filter(Boolean).join("  ·  ");
  if (metaLine) {
    ctx.fillStyle = "#EAF3DE";
    ctx.font = `400 44px ${SANS}`;
    ctx.fillText(metaLine, right, y + 12);
  }
  ctx.textAlign = "center";
}

export default function StoryCardCanvas({ producer, onUploaded, onClose }) {
  const t = useTranslations("story.canvas");
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(producer.story_card_url || null);
  const [captionCopied, setCaptionCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawCard(canvasRef.current, producer, { kicker: t("kicker") }).then(() => setRendered(true));
  }, [producer, t]);

  // MEH-1267: Esc closes the story panel (mirrors the kebab toggle). The panel
  // only mounts while open, so the listener is scoped to the open lifetime.
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const download = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `${producer.slug || producer.id}-story-card.jpg`;
    link.href = canvasRef.current.toDataURL("image/jpeg", 0.92);
    link.click();
  };

  const uploadToCloudinary = async () => {
    if (!canvasRef.current) return;
    setUploading(true);
    try {
      const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.92);
      const r = await api.post(`/admin/producers/${producer.id}/story-card`, {
        image_data: dataUrl,
      });
      setUploadedUrl(r.data.url);
      onUploaded?.(r.data.url);
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail) || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const caption = `${t("caption_prefix")}\n${producer.name} מ${producer.city || t("default_country")} — ${
    producer.categories?.map((c) => c.name).join(", ") || ""
  }\n${producer.short_description || producer.description?.slice(0, 100) || ""}\n👉 ${SITE_HOST}/p/${producer.slug || ""}`;

  const copyCaption = () => {
    navigator.clipboard.writeText(caption).then(() => {
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2500);
    });
  };

  return (
    <div className="mt-4 space-y-4">
      {/* MEH-1267: X sits at the logical-start top corner; kebab toggle unchanged. */}
      <div className="flex items-center gap-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="shrink-0 rounded-full p-1 text-muted hover:bg-gray-100 hover:text-text transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
        <p className="text-sm font-semibold text-text inline-flex items-center gap-1"><Camera size={16} className="text-current" />{t("title")}</p>
      </div>

      {/* Canvas preview — scaled to fit.
          MEH-2511: the canvas carries its own 9:16 ratio with `height: auto`.
          It used to be `height: 100%` of an aspect-ratio box, and inside the
          admin row's <td> WebKit could not resolve that percentage — the
          canvas fell back to its intrinsic 1920px and showed stretched ×4 and
          clipped on iPhone. The wrapper keeps the ratio too, so the
          «מייצר...» overlay has a frame before the first draw. */}
      <div className="relative bg-[#1f4a3a] rounded-[12px] overflow-hidden" style={{ aspectRatio: "9/16", maxWidth: 270 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "auto", aspectRatio: "9/16", display: "block" }}
        />
        {!rendered && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-xs opacity-60">
            {t("generating")}...
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={download}
          disabled={!rendered}
          className="text-sm border border-border px-4 py-2 rounded-[8px] hover:border-primary transition disabled:opacity-40"
        >
          <DownloadSimple size={16} className="inline align-[-2px]" aria-hidden="true" /> {t("download")}
        </button>
        <button
          onClick={uploadToCloudinary}
          disabled={!rendered || uploading}
          className="text-sm bg-primary text-white px-4 py-2 rounded-[8px] hover:bg-primary-dark transition disabled:opacity-40"
        >
          {uploading ? t("uploading") : t("save_cloudinary")}
        </button>
        <button
          onClick={copyCaption}
          className="text-sm border border-border px-4 py-2 rounded-[8px] hover:border-primary transition"
        >
          {captionCopied ? t("copied") : t("copy_caption")}
        </button>
      </div>

      {uploadedUrl && (
        <p className="text-xs text-primary break-all" dir="ltr">{uploadedUrl}</p>
      )}

      {/* Caption preview */}
      <pre className="text-xs bg-green-50 rounded-[8px] p-3 whitespace-pre-wrap text-text font-body-md text-right" dir="rtl">
        {caption}
      </pre>
    </div>
  );
}
