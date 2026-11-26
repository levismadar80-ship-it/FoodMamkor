"use client";
// @ts-check

/**
 * Module:   PageFillPanel
 * Purpose:  «ספרו לנו על העסק» (MEH-3483). The owner writes about her business
 *           in her own words; Claude drafts the page fields; she sees what
 *           changes field by field and saves only what she leaves checked.
 *           Menu photos are read on the same screen by MenuImport, whose
 *           products she approves separately.
 * Touches:  POST {readUrl} (no save) · PUT {saveUrl} ·
 *           PUT /producers/me/locations/{id} (hours, owner only) · GET /categories.
 * Does NOT: decide what a row means (lib/page-fill.js) or validate a write
 *           (the server does, the same as the edit cards).
 * Placement: the top of the edit hub, above the group tiles (MEH-3483 study in
 *           the PR): one entry for the whole page, the same place the owner
 *           fills it by hand.
 *           MEH-3788: on the owner's edit hub it mounts only while the page is
 *           still empty (edit/page.js decides); the admin page always shows it.
 * History:  MEH-3483 (creation); MEH-3788 (owner side: empty page only);
 *           owner assistant 26/11 (the review moved to PageFillReview.jsx)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NotePencil } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";
import MenuImport from "@/components/MenuImport";
import { ReadMyPageTextProducersMePageFillReadPostResponse as PageFillOut } from "@/lib/generated/api.zod";
import PageFillReview from "@/components/PageFillReview";

/**
 * @param {{ profile: any, readUrl: string, saveUrl: string, owner?: boolean,
 *   blocked?: boolean, onSaved: () => void }} props
 *   blocked: another card on the page holds unsaved edits; saving here would
 *   reload the page's cards and drop them, so the save waits.
 *   owner: the owner's own page — hours go to her primary location and menu
 *   photos can be read here; false on the admin page.
 */
export default function PageFillPanel({ profile, readUrl, saveUrl, owner = true, blocked = false, onSaved }) {
  const t = useTranslations("page_fill");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState(/** @type {"write"|"reading"|"preview"} */ ("write"));
  const [draft, setDraft] = useState(/** @type {any} */ (null));
  const [error, setError] = useState("");

  const read = async () => {
    setError("");
    setPhase("reading");
    try {
      const res = await api.post(readUrl, { text });
      // Rule 19: parse before use; the admin twin returns the same shape.
      const parsed = PageFillOut.safeParse(res.data);
      if (!parsed.success) throw new Error("shape");
      setDraft(parsed.data.draft);
      setPhase("preview");
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed"));
      setPhase("write");
    }
  };

  // Back to the closed card: the host reloads the business, and a host that
  // does not remount this panel (admin) must not keep a stale preview.
  const saved = () => {
    setDraft(null);
    setText("");
    setPhase("write");
    setOpen(false);
    onSaved();
  };

  return (
    <section data-testid="page-fill" className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <NotePencil size={24} aria-hidden="true" className="shrink-0 text-primary mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-text">{t("title")}</h2>
          <p className="text-sm text-fg-muted">{t("intro")}</p>
        </div>
      </div>
      {!open ? (
        <Button variant="outlined" onClick={() => setOpen(true)} data-testid="page-fill-open">{t("open")}</Button>
      ) : phase === "write" || phase === "reading" ? (
        <div className="space-y-3">
          <Textarea
            label={t("label")}
            placeholder={t("placeholder")}
            rows={6}
            maxLength={6000}
            value={text}
            onChange={(/** @type {any} */ e) => setText(e.target.value)}
            data-testid="page-fill-text"
          />
          {error && <InlineMessage tone="error" size="sm">{error}</InlineMessage>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={read} loading={phase === "reading"} disabled={text.trim().length < 20} data-testid="page-fill-read">
              {phase === "reading" ? t("reading") : t("read")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          </div>
        </div>
      ) : (
        <PageFillReview
          draft={draft}
          profile={profile}
          saveUrl={saveUrl}
          owner={owner}
          blocked={blocked}
          onSaved={saved}
          onBack={() => setPhase("write")}
        />
      )}
      {open && owner && (
        <div className="border-t border-border pt-3 space-y-1" data-testid="page-fill-menu">
          <h3 className="font-bold text-text text-sm">{t("menu_title")}</h3>
          <p className="text-xs text-fg-muted">{t("menu_hint")}</p>
          <MenuImport productCount={profile?.products?.length ?? 0} onPublished={onSaved} />
        </div>
      )}
    </section>
  );
}
