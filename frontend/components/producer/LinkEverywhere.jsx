// @ts-check
"use client";

/**
 * Module:   LinkEverywhere
 * Purpose:  MEH-3331 — «הקישור שלך בכל מקום»: four places a business puts its
 *           page link once (Instagram bio, Facebook page button, Google
 *           profile, WhatsApp Business profile). Each row: where, one how-to
 *           line, a copy button with a tracked link, and «עשיתי».
 * Touches:  browser localStorage (`mehamakor.link-everywhere.<producer id>`):
 *           which rows she ticked. A per-device reminder, not a record — a
 *           cleared or blocked storage just shows every row unticked.
 * Does NOT: count the visits (backend share_visits, ShareVisitsLine.jsx), or
 *           build the link (lib/share-post.js trackedLink).
 * Related:  components/producer/ShareKitSection.jsx (the only mount point).
 * History:  MEH-3331 (creation).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "@phosphor-icons/react";
import { copyText } from "@/lib/clipboard";
import { trackedLink } from "@/lib/share-post";
import { showToast } from "@/lib/toast";
import Button from "@/components/ui/Button";

/** The four places, in the order a business usually fills them. */
export const LINK_PLACES = ["instagram", "facebook", "google", "whatsapp"];
const COPIED_MS = 2500;

/** @param {string} id */
const storageKey = (id) => `mehamakor.link-everywhere.${id}`;

/** @param {string} id @returns {string[]} */
function readDone(id) {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((p) => LINK_PLACES.includes(p)) : [];
  } catch {
    return [];
  }
}

/** @param {string} id @param {string[]} done */
function writeDone(id, done) {
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(done));
  } catch {
    // Private mode / blocked storage: the tick lasts until reload. Fine.
  }
}

/** @param {{ place: string, slug: string, done: boolean, onToggle: () => void }} props */
function PlaceRow({ place, slug, done, onToggle }) {
  const t = useTranslations("story.canvas.owner.links");
  const tError = useTranslations("error");
  const [copied, setCopied] = useState(false);
  const copy = () =>
    copyText(trackedLink(slug, place)).then((ok) => {
      if (!ok) return showToast.error(tError("generic"));
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    });

  return (
    <li data-testid={`link-place-${place}`} className="py-3 border-b border-border last:border-b-0">
      <p className={`font-semibold ${done ? "text-fg-muted" : "text-text"}`}>{t(`${place}.label`)}</p>
      <p className="text-sm text-fg-muted">{t(`${place}.how`)}</p>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button variant="outlined" size="sm" leadingIcon={<Copy size={16} aria-hidden="true" />} onClick={copy} data-testid={`link-copy-${place}`}>
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button
          variant={done ? "primary" : "outlined"}
          size="sm"
          aria-pressed={done}
          leadingIcon={done ? <Check size={16} aria-hidden="true" /> : undefined}
          onClick={onToggle}
          data-testid={`link-done-${place}`}
        >
          {t("done")}
        </Button>
      </div>
    </li>
  );
}

/** @param {{ producer: { id?: string, slug?: string } }} props */
export default function LinkEverywhere({ producer }) {
  const t = useTranslations("story.canvas.owner.links");
  const id = String(producer.id || producer.slug || "");
  const [done, setDone] = useState(/** @type {string[]} */ ([]));
  useEffect(() => setDone(readDone(id)), [id]);

  if (!producer.slug) return null;
  /** @param {string} place */
  const toggle = (place) => {
    const next = done.includes(place) ? done.filter((p) => p !== place) : [...done, place];
    setDone(next);
    writeDone(id, next);
  };

  return (
    <div data-testid="link-everywhere" className="mt-4 pb-5 border-b border-border">
      <h3 className="font-bold text-text">{t("title")}</h3>
      <p className="text-sm text-fg-muted">{t("subtitle")}</p>
      <ul className="mt-2">
        {LINK_PLACES.map((place) => (
          <PlaceRow key={place} place={place} slug={producer.slug || ""} done={done.includes(place)} onToggle={() => toggle(place)} />
        ))}
      </ul>
    </div>
  );
}
