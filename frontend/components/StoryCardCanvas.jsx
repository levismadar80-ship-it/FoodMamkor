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
 *   - Vanity URL: DM Sans 20px #4cb08b
 *   - CTA: "גלי עוד בתי עסק ב mehamakor.online"
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { BRAND_NAME } from "@/lib/constants";

const W = 1080;
const H = 1920;

async function loadFonts() {
  const families = [
    ["Frank Ruhl Libre", "https://fonts.gstatic.com/s/frankruhllibre/v21/j8_36_fAw7jrcalD7Aa2ZIf3AkKt.woff2"],
    ["DM Sans", "https://fonts.gstatic.com/s/dmsans/v14/rP2Hp2ywxg089UriCZOIHQ.woff2"],
  ];
  for (const [name, url] of families) {
    try {
      const f = new FontFace(name, `url(${url})`);
      await f.load();
      document.fonts.add(f);
    } catch {
      // fall back to system font if Google Fonts unreachable
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
  const categories = producer.categories?.map((c) => c.emoji ? `${c.emoji} ${c.name}` : c.name).join("  ·  ") || "";
  const cityLine = [producer.city, categories].filter(Boolean).join("  ·  ");
  ctx.fillStyle = "#EAF3DE";
  ctx.font = `400 28px "DM Sans", sans-serif`;
  ctx.fillText(cityLine, W / 2, nameY + 120);

  // Vanity URL
  const slug = producer.slug || "";
  if (slug) {
    ctx.fillStyle = "#4cb08b";
    ctx.font = `500 24px "DM Sans", sans-serif`;
    ctx.fillText(`mehamakor.online/p/${slug}`, W / 2, nameY + 190);
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
  ctx.fillText(strings?.footer_url || "גלי עוד בתי עסק ב mehamakor.online", W / 2, H - 150);
}

export default function StoryCardCanvas({ producer, onUploaded }) {
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
      alert(err.response?.data?.detail || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const caption = `${t("caption_prefix")}\n${producer.name} מ${producer.city || t("default_country")} — ${
    producer.categories?.map((c) => c.name).join(", ") || ""
  }\n${producer.short_description || producer.description?.slice(0, 100) || ""}\n👉 mehamakor.online/p/${producer.slug || ""}`;

  const copyCaption = () => {
    navigator.clipboard.writeText(caption).then(() => {
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2500);
    });
  };

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm font-semibold text-site-text">{t("title")}</p>

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
          ⬇️ {t("download")}
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
      <pre className="text-xs bg-light rounded-[8px] p-3 whitespace-pre-wrap text-site-text font-sans text-right" dir="rtl">
        {caption}
      </pre>
    </div>
  );
}
