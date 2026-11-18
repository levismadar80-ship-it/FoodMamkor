// @ts-check
"use client";

/**
 * Module:   FeedPostCanvas
 * Purpose:  MEH-3330 — the «פוסט מוכן לשיתוף» card in the owner's share kit.
 *           She picks a moment (this week · a new product · an upcoming
 *           holiday), sees the 4:5 post built from her page, and shares it
 *           through the phone's share sheet, downloads it, or copies a caption
 *           with a tracked link.
 * Touches:  GET /producers/me/products (read only).
 * Does NOT: draw (feed-post-draw.js), pick products or build links
 *           (lib/share-post.js), or own navigator.share (lib/share-link.js,
 *           shareFile).
 * Related:  components/producer/ShareKitSection.jsx (the only mount point);
 *           components/StoryCardCanvas.jsx (the 9:16 sibling).
 * History:  MEH-3330 (creation).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadSimple, ShareNetwork } from "@phosphor-icons/react";
import api from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { getUpcomingHoliday } from "@/lib/holidays";
import { orderProducts } from "@/lib/product-order";
import { itemsLine, trackedLink, weekItems } from "@/lib/share-post";
import { shareFile } from "@/lib/share-link";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import InlineMessage from "@/components/ui/InlineMessage";
import { Link } from "@/i18n/navigation";
import { drawPost } from "./feed-post-draw";

/** How far ahead a holiday offers its own moment (days). */
const HOLIDAY_AHEAD_DAYS = 21;
const COPIED_MS = 2500;

/** The owner's products in her own order; null while loading. */
function useOwnerProducts() {
  const [products, setProducts] = useState(/** @type {any[]|null} */ (null));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .get("/producers/me/products")
      .then((r) => live && setProducts(orderProducts(Array.isArray(r.data) ? r.data : [])))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);
  return { products, failed, retry: () => setAttempt((n) => n + 1) };
}

/**
 * The moments on offer: the holiday one only while a holiday is near.
 * @param {(k: string, v?: object) => string} t
 * @param {(k: string) => string} tHoliday
 */
function useMoments(t, tHoliday) {
  return useMemo(() => {
    const holiday = getUpcomingHoliday(HOLIDAY_AHEAD_DAYS);
    const name = holiday ? tHoliday(`${holiday.key}.name`) : null;
    const list = [
      { id: "week", label: t("moment_week") },
      { id: "new", label: t("moment_new") },
    ];
    if (name) list.push({ id: "holiday", label: t("moment_holiday", { holiday: name }) });
    return { list, holidayName: name };
  }, [t, tHoliday]);
}

/**
 * @param {{ moment: string, products: any[], pickedId: string, holidayName: string|null,
 *   t: (k: string, v?: object) => string }} a
 */
function contentFor({ moment, products, pickedId, holidayName, t }) {
  if (moment === "new") {
    const item = products.find((p) => String(p.id) === pickedId) || products[0];
    return {
      draw: { kind: "single", kicker: t("kicker_new"), item },
      caption: t("caption_new", { item: item.name }),
    };
  }
  const items = weekItems(products);
  if (moment === "holiday" && holidayName) {
    return {
      draw: { kind: "list", kicker: t("kicker_holiday", { holiday: holidayName }), items },
      caption: t("caption_holiday", { holiday: holidayName, items: itemsLine(items) }),
    };
  }
  return {
    draw: { kind: "list", kicker: t("kicker_week"), items },
    caption: t("caption_week", { items: itemsLine(items) }),
  };
}

/** @param {HTMLCanvasElement} canvas @returns {Promise<Blob|null>} */
function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}

/**
 * @param {{ producer: { slug?: string, id?: string, name?: string } }} props
 */
function usePostActions({ producer }) {
  const download = useCallback((/** @type {HTMLCanvasElement|null} */ canvas) => {
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${producer.slug || producer.id}-post.jpg`;
    a.href = canvas.toDataURL("image/jpeg", 0.9);
    a.click();
  }, [producer.slug, producer.id]);

  const share = useCallback(async (/** @type {HTMLCanvasElement|null} */ canvas, /** @type {string} */ caption) => {
    if (!canvas) return;
    const url = trackedLink(producer.slug || "", "share");
    const blob = await canvasBlob(canvas);
    const file = blob ? new File([blob], `${producer.slug || "post"}.jpg`, { type: "image/jpeg" }) : null;
    const outcome = file ? await shareFile({ file, text: caption, url }) : "unavailable";
    if (outcome === "unavailable") download(canvas);
  }, [producer.slug, download]);

  return { download, share };
}

/** @param {{ t: (k: string) => string, failed: boolean, retry: () => void }} props */
function EmptyOrError({ t, failed, retry }) {
  if (failed) {
    return (
      <div data-testid="feed-post-error" className="mt-3">
        <InlineMessage className="mb-2">{t("load_error")}</InlineMessage>
        <Button variant="outlined" size="sm" onClick={retry}>{t("retry")}</Button>
      </div>
    );
  }
  return (
    <p data-testid="feed-post-empty" className="mt-3 text-sm text-fg-muted">
      {t("empty")}{" "}
      <Link href="/producer/dashboard/edit#products" className="text-primary font-semibold underline">
        {t("empty_cta")}
      </Link>
    </p>
  );
}

/** @param {{ moments: {id: string, label: string}[], value: string, onChange: (id: string) => void, label: string }} props */
function MomentChips({ moments, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 mt-3" data-testid="feed-post-moments">
      {moments.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={value === m.id}
          data-testid={`feed-post-moment-${m.id}`}
          onClick={() => onChange(m.id)}
          className={`min-h-touch px-4 rounded-full text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === m.id ? "bg-primary border-primary text-white" : "border-border text-text hover:border-primary"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * @param {{ producer: { slug?: string, id?: string, name?: string, city?: string|null,
 *   images?: string[], categories?: { name: string }[] } }} props
 */
export default function FeedPostCanvas({ producer }) {
  const t = useTranslations("story.canvas.owner.post");
  const tHoliday = useTranslations("holidays");
  const tError = useTranslations("error");
  const { products, failed, retry } = useOwnerProducts();
  const { list: moments, holidayName } = useMoments(t, tHoliday);
  const [moment, setMoment] = useState("week");
  const [pickedId, setPickedId] = useState("");
  const [rendered, setRendered] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(/** @type {HTMLCanvasElement|null} */ (null));
  const { download, share } = usePostActions({ producer });

  const content = useMemo(
    () => (products && products.length ? contentFor({ moment, products, pickedId, holidayName, t }) : null),
    [moment, products, pickedId, holidayName, t],
  );

  useEffect(() => {
    if (!content || !canvasRef.current) return;
    setRendered(false);
    drawPost(canvasRef.current, producer, /** @type {any} */ (content.draw), { footer: t("footer") })
      .then((ok) => setRendered(ok !== false))
      .catch(() => setRendered(false));
  }, [content, producer, t]);

  const link = trackedLink(producer.slug || "", "copy");
  const copy = () =>
    copyText(`${content?.caption || ""}\n${link}`).then((ok) => {
      if (!ok) return showToast.error(tError("generic"));
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    });

  return (
    <div data-testid="feed-post" className="mt-4 pb-5 border-b border-border">
      <h3 className="font-bold text-text">{t("title")}</h3>
      <p className="text-sm text-fg-muted">{t("subtitle")}</p>
      {products === null && !failed ? (
        <p className="mt-3 text-sm text-fg-muted">{t("generating")}...</p>
      ) : !content ? (
        <EmptyOrError t={t} failed={failed} retry={retry} />
      ) : (
        <>
          <MomentChips moments={moments} value={moment} onChange={setMoment} label={t("moments_label")} />
          {moment === "new" && products.length > 1 && (
            <div className="mt-3 max-w-xs">
              <Select
                id="feed-post-product"
                label={t("pick_product")}
                value={pickedId || String(products[0].id)}
                onChange={(e) => setPickedId(e.target.value)}
                data-testid="feed-post-product"
              >
                {products.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="relative mt-3 rounded-md overflow-hidden border border-border bg-background" style={{ maxWidth: 300 }}>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={t("image_alt")}
              data-testid="feed-post-canvas"
              style={{ width: "100%", height: "auto", aspectRatio: "4/5", display: "block" }}
            />
            {!rendered && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-muted">
                {t("generating")}...
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" size="sm" disabled={!rendered} leadingIcon={<ShareNetwork size={16} aria-hidden="true" />} onClick={() => share(canvasRef.current, content.caption)} data-testid="feed-post-share">
              {t("share")}
            </Button>
            <Button variant="outlined" size="sm" disabled={!rendered} leadingIcon={<DownloadSimple size={16} aria-hidden="true" />} onClick={() => download(canvasRef.current)} data-testid="feed-post-download">
              {t("download")}
            </Button>
            <Button variant="outlined" size="sm" onClick={copy} data-testid="feed-post-copy">
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          <pre dir="rtl" data-testid="feed-post-caption" className="mt-3 text-xs bg-green-50 rounded-sm p-3 whitespace-pre-wrap [overflow-wrap:anywhere] text-text font-body-md text-start">
            {`${content.caption}\n${link}`}
          </pre>
        </>
      )}
    </div>
  );
}
