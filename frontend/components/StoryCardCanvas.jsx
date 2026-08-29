"use client";

/**
 * MEH-53: Instagram story card generator (1080×1920px).
 * Uses Canvas API to compose the card entirely in-browser.
 * Design spec:
 *   - Background: #2E4A2E (dark green)
 *   - Producer image: centered, 600×600px, circle-clipped
 *   - Logo text: מהמקור, white, bottom-center
 *   - Producer name: Frank Ruhl Libre 52px white
 *   - City + category: DM Sans 24px #EAF3DE
 *   - Vanity URL: DM Sans 20px #2e6853
 *   - CTA: "גלי עוד בתי עסק ב {SITE_HOST}"
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
import { SITE_URL } from "@/lib/env";
// MEH-2043: the same committed binaries app/fonts.js feeds to next/font/local
// (MEH-2029 provenance: byte-for-byte copies of what next/font/google last
// emitted — see app/fonts/README.md). Canvas 2D's `font` property can't go
// through next/font/local itself (it publishes a CSS variable + class, not a
// URL a FontFace can load), so this imports the raw files directly — Next's
// static-asset loader resolves each import to its build URL. Both Frank Ruhl
// Libre subsets are loaded under the SAME family name below, exactly like
// fonts.js's dual-call pattern, so the browser's own glyph-coverage matching
// picks hebrew vs. latin per character — the business name is Hebrew and
// MUST resolve to the hebrew-subset file, not fall back to a system font.
import frankRuhlLibreHebrewUrl from "@/app/fonts/frank-ruhl-libre-hebrew.woff2";
import frankRuhlLibreLatinUrl from "@/app/fonts/frank-ruhl-libre-latin.woff2";
import dmSansLatinUrl from "@/app/fonts/dm-sans-latin.woff2";

const W = 1080;
const H = 1920;
// Bare host for on-card display (SITE_URL is the full https:// origin).
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

// Same two ranges app/fonts.js declares for this family's next/font/local
// calls (`declarations: [{ prop: "unicode-range", ... }]`) — literal, not
// imported: a FontFace() descriptor isn't under next/font/local's
// static-serialization constraint, but duplicating the exact values (rather
// than sharing a constant) matches how fonts.js already repeats this same
// latin range across its own calls, for a different but adjacent reason.
const FRANK_RUHL_LIBRE_HEBREW_RANGE =
  "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F";
const LATIN_RANGE =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

async function loadFonts() {
  // Same family name twice (hebrew + latin subsets) is deliberate — see the
  // import comment above. Each FontFace carries an explicit `unicodeRange`
  // descriptor (3rd constructor arg): without one it defaults to the full
  // codespace, so BOTH faces would claim to cover every character and which
  // one wins for a given glyph is unspecified — exactly the ambiguity
  // fonts.js's own unicode-range declarations exist to remove for the CSS
  // path, and the reason a same-model review flagged this as a real gap
  // rather than a cosmetic one. DM Sans stays latin-only, no range needed:
  // that mirrors fonts.js (city/category text already fell back to the
  // system Hebrew font for Hebrew glyphs before this change; unrelated to
  // what this ticket fixes).
  const faces = [
    ["Frank Ruhl Libre", frankRuhlLibreHebrewUrl, FRANK_RUHL_LIBRE_HEBREW_RANGE],
    ["Frank Ruhl Libre", frankRuhlLibreLatinUrl, LATIN_RANGE],
    ["DM Sans", dmSansLatinUrl, undefined],
  ];
  for (const [name, url, unicodeRange] of faces) {
    try {
      const f = new FontFace(name, `url(${url})`, unicodeRange ? { unicodeRange } : undefined);
      await f.load();
      document.fonts.add(f);
    } catch {
      // fall back to system font if a local font file fails to load
    }
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

async function drawCard(canvas, producer, strings) {
  await loadFonts();

  const ctx = canvas.getContext("2d");
  canvas.width = W;
  canvas.height = H;

  // Background
  ctx.fillStyle = "#2E4A2E";
  ctx.fillRect(0, 0, W, H);

  // Subtle pattern overlay (dots)
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  for (let y = 0; y < H; y += 60) {
    for (let x = 0; x < W; x += 60) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Producer image (circle-clipped, centered)
  const imgSize = 600;
  const imgX = (W - imgSize) / 2;
  const imgY = 320;
  const imgCenterX = imgX + imgSize / 2;
  const imgCenterY = imgY + imgSize / 2;
  const imgRadius = imgSize / 2;

  const imageUrl = producer.images?.[0];
  if (imageUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        // Request Cloudinary image with f_auto,q_auto for fast load
        img.src = imageUrl.includes("cloudinary.com")
          ? imageUrl.replace("/upload/", "/upload/f_auto,q_auto,w_600,h_600,c_fill/")
          : imageUrl;
      });
      ctx.save();
      ctx.beginPath();
      ctx.arc(imgCenterX, imgCenterY, imgRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
      ctx.restore();

      // Soft ring around image
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(imgCenterX, imgCenterY, imgRadius + 3, 0, Math.PI * 2);
      ctx.stroke();
    } catch {
      // Draw placeholder circle on image load failure
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(imgCenterX, imgCenterY, imgRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(imgCenterX, imgCenterY, imgRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "120px serif";
    ctx.textAlign = "center";
    ctx.fillText("🌿", imgCenterX, imgCenterY + 40);
  }

  ctx.textAlign = "center";

  // Producer name
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 52px "Frank Ruhl Libre", serif`;
  const nameY = imgY + imgSize + 80;
  wrapText(ctx, producer.name || "", W / 2, nameY, W - 160, 68);

  // City + category line
  // MEH-1297: cap at the first 2 categories (primary-first order) so a producer
  // with up to 3 categories can't overflow the fixed-width canvas line.
  const categories =
    producer.categories
      ?.slice(0, 2)
      .map((c) => c.name)
      .join("  ·  ") || "";
  const cityLine = [producer.city, categories].filter(Boolean).join("  ·  ");
  ctx.fillStyle = "#EAF3DE";
  ctx.font = `400 28px "DM Sans", sans-serif`;
  ctx.fillText(cityLine, W / 2, nameY + 120);

  // Vanity URL
  const slug = producer.slug || "";
  if (slug) {
    ctx.fillStyle = "#2e6853";
    ctx.font = `500 24px "DM Sans", sans-serif`;
    ctx.fillText(`${SITE_HOST}/p/${slug}`, W / 2, nameY + 190);
  }

  // Divider
  const divY = H - 340;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(160, divY);
  ctx.lineTo(W - 160, divY);
  ctx.stroke();

  // מהמקור logo text
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 72px "Frank Ruhl Libre", serif`;
  ctx.fillText(BRAND_NAME, W / 2, H - 220);

  // CTA text — strings passed from React component since canvas API doesn't
  // go through next-intl context. Falls back to HE if missing for safety.
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `400 24px "DM Sans", sans-serif`;
  ctx.fillText(strings?.footer_url || `גלי עוד בתי עסק ב ${SITE_HOST}`, W / 2, H - 150);
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
    drawCard(canvasRef.current, producer, { footer_url: t("footer_url") }).then(() => setRendered(true));
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

      {/* Canvas preview — scaled to fit */}
      <div className="relative bg-[#2E4A2E] rounded-[12px] overflow-hidden" style={{ aspectRatio: "9/16", maxWidth: 270 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
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
