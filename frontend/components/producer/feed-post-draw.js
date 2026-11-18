// @ts-check
/// <reference path="../../types/browser-globals.d.ts" />
/**
 * Module:   feed-post-draw
 * Purpose:  Draws the owner's 1080×1350 (4:5) feed post on a canvas: a photo
 *           on top, the business name, then either up to three products with
 *           prices («מה יש השבוע» / holiday) or one product («מוצר חדש»),
 *           and a brand-green footer with «כל הפרטים בקישור» and the lockup.
 * Does NOT: decide which products go on it or build the caption
 *           (lib/share-post.js), or render buttons (FeedPostCanvas.jsx).
 * Related:  components/StoryCardCanvas.jsx — fonts, mark, lockup and image
 *           helpers are imported from there so the three share cards stay one
 *           type system.
 * History:  MEH-3330 (creation).
 *
 * No printed URL, same ruling as the story card (MEH-2589): text in an image
 * is not clickable. The link travels in the caption and in the share sheet.
 */

import {
  drawCover,
  drawLockup,
  drawMark,
  loadFonts,
  loadImage,
  wrapText,
} from "@/components/StoryCardCanvas";
import { COLOR } from "@/lib/color-tokens";
import { priceLabel } from "@/lib/share-post";

export const POST_W = 1080;
export const POST_H = 1350;
const PHOTO_H = 560;
const FOOTER_H = 150;
const SIDE = 80;
const GREEN = COLOR.primary;
const GREEN_DEEP = "#1f4a3a";
const CREAM = COLOR.background;
const INK = "#1d1b17";
const MUTED = "#6b665c";
const LEADER = "#b9ad94";
const SERIF = `"Frank Ruhl Libre", serif`;
const SANS = `"Heebo", sans-serif`;
const RIGHT = POST_W - SIDE;
const TEXT_W = POST_W - SIDE * 2;

/**
 * @typedef {import("@/lib/share-post").PostProduct} PostProduct
 * @typedef {{ kind: "list", kicker: string, items: PostProduct[] }
 *         | { kind: "single", kicker: string, item: PostProduct }} PostContent
 * @typedef {{ name?: string, city?: string|null, images?: string[],
 *   categories?: { name: string }[] }} PostProducer
 */

/**
 * Cloudinary crop for the photo band.
 * @param {string} url
 */
function photoSrc(url) {
  return url.includes("cloudinary.com")
    ? url.replace("/upload/", `/upload/f_auto,q_auto,w_${POST_W},h_${PHOTO_H},c_fill,g_auto/`)
    : url;
}

/**
 * Lines of `text` at the largest size from max to min that fit `maxLines`;
 * at min the last line is cut with «…».
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {{ max: number, min: number, weight: number, family: string, maxLines: number }} o
 */
export function fitLines(ctx, text, o) {
  for (let size = o.max; size >= o.min; size -= 4) {
    ctx.font = `${o.weight} ${size}px ${o.family}`;
    const lines = wrapText(ctx, text, TEXT_W);
    if (lines.length <= o.maxLines && lines.every((l) => ctx.measureText(l).width <= TEXT_W)) {
      return { size, lines };
    }
  }
  ctx.font = `${o.weight} ${o.min}px ${o.family}`;
  const lines = wrapText(ctx, text, TEXT_W).slice(0, o.maxLines);
  const last = lines.length - 1;
  let cut = lines[last] || "";
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > TEXT_W) cut = cut.slice(0, -1);
  if (wrapText(ctx, text, TEXT_W).length > o.maxLines || cut !== lines[last]) lines[last] = `${cut.trimEnd()}…`;
  return { size: o.min, lines };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement|null} photo
 */
function drawPhotoBand(ctx, photo) {
  const g = ctx.createLinearGradient(0, 0, 0, PHOTO_H);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GREEN_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, POST_W, PHOTO_H);
  if (photo) drawCover(ctx, photo, 0, 0, POST_W, PHOTO_H);
  else drawMark(ctx, POST_W / 2, PHOTO_H / 2, 300);
}

/**
 * Kicker, name and the city · category line. Returns the y below them.
 * @param {CanvasRenderingContext2D} ctx
 * @param {PostProducer} producer
 * @param {string} kicker
 */
function drawHeading(ctx, producer, kicker) {
  ctx.textAlign = "right";
  ctx.fillStyle = GREEN;
  ctx.font = `700 34px ${SANS}`;
  let y = PHOTO_H + 78;
  ctx.fillText(kicker, RIGHT, y);
  const name = fitLines(ctx, producer.name || "", { max: 92, min: 60, weight: 900, family: SERIF, maxLines: 2 });
  ctx.fillStyle = INK;
  for (const line of name.lines) {
    y += name.size * 1.08;
    ctx.fillText(line, RIGHT, y);
  }
  const meta = [producer.city, producer.categories?.[0]?.name].filter(Boolean).join(" · ");
  if (meta) {
    ctx.font = `400 34px ${SANS}`;
    ctx.fillStyle = MUTED;
    y += 56;
    ctx.fillText(meta, RIGHT, y);
  }
  return y;
}

/**
 * One product row: name at the start (right), price at the end (left), a
 * dotted leader between them.
 * @param {CanvasRenderingContext2D} ctx
 * @param {PostProduct} item
 * @param {number} y
 */
function drawRow(ctx, item, y) {
  const price = priceLabel(item);
  ctx.font = `700 42px ${SERIF}`;
  const priceW = price ? ctx.measureText(price).width : 0;
  ctx.font = `400 40px ${SANS}`;
  let name = item.name;
  const nameMax = TEXT_W - priceW - 60;
  while (name.length > 1 && ctx.measureText(name).width > nameMax) name = name.slice(0, -1);
  if (name !== item.name) name = `${name.trimEnd()}…`;
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  ctx.fillText(name, RIGHT, y);
  if (!price) return;
  const nameW = ctx.measureText(name).width;
  ctx.fillStyle = GREEN;
  ctx.font = `700 42px ${SERIF}`;
  ctx.textAlign = "left";
  ctx.fillText(price, SIDE, y);
  ctx.strokeStyle = LEADER;
  ctx.lineWidth = 3;
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  ctx.moveTo(SIDE + priceW + 20, y - 10);
  ctx.lineTo(RIGHT - nameW - 20, y - 10);
  ctx.stroke();
  ctx.setLineDash([]);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {PostProduct} item
 * @param {number} top
 */
function drawSingle(ctx, item, top) {
  const name = fitLines(ctx, item.name, { max: 72, min: 52, weight: 800, family: SERIF, maxLines: 2 });
  let y = top + 40;
  ctx.fillStyle = INK;
  ctx.textAlign = "right";
  for (const line of name.lines) {
    y += name.size * 1.1;
    ctx.fillText(line, RIGHT, y);
  }
  const price = priceLabel(item);
  if (price) {
    y += 70;
    ctx.fillStyle = GREEN;
    ctx.font = `700 54px ${SERIF}`;
    ctx.fillText(price, RIGHT, y);
  }
  if (item.description) {
    ctx.font = `400 34px ${SANS}`;
    ctx.fillStyle = MUTED;
    for (const line of wrapText(ctx, item.description, TEXT_W).slice(0, 2)) {
      y += 52;
      ctx.fillText(line, RIGHT, y);
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} footer
 */
function drawFooter(ctx, footer) {
  const top = POST_H - FOOTER_H;
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, top, POST_W, FOOTER_H);
  ctx.fillStyle = CREAM;
  ctx.font = `600 38px ${SANS}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(footer, RIGHT, top + FOOTER_H / 2);
  ctx.textBaseline = "alphabetic";
  drawLockup(ctx, SIDE + 150, top + FOOTER_H / 2);
}

/**
 * Draws the post. Returns false when the canvas has no 2D context, so the
 * caller keeps the buttons disabled (same contract as StoryCardCanvas.drawCard).
 * Returns null without painting when `isCurrent()` says a newer draw was asked
 * for while fonts and the photo loaded: a slow photo for an old moment must
 * not paint over the moment she picked since.
 * @param {HTMLCanvasElement} canvas
 * @param {PostProducer} producer
 * @param {PostContent} content
 * @param {{ footer: string, isCurrent?: () => boolean }} strings
 */
export async function drawPost(canvas, producer, content, strings) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  await loadFonts();
  const imageUrl = (content.kind === "single" && content.item.image_url) || producer.images?.[0];
  const photo = imageUrl ? await loadImage(photoSrc(imageUrl)) : null;
  if (strings.isCurrent && !strings.isCurrent()) return null;

  canvas.width = POST_W;
  canvas.height = POST_H;
  ctx.direction = "rtl";
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, POST_W, POST_H);
  drawPhotoBand(ctx, photo);
  const y = drawHeading(ctx, producer, content.kicker);
  if (content.kind === "single") drawSingle(ctx, content.item, y);
  else content.items.forEach((item, i) => drawRow(ctx, item, y + 110 + i * 84));
  drawFooter(ctx, strings.footer);
  return true;
}
