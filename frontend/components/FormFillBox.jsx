// @ts-check
"use client";

/**
 * Module:   FormFillBox
 * Purpose:  «יש לכם מתכון כתוב?» (MEH-3740): the owner pastes text she
 *           already has and the form fills itself as a draft. The host form
 *           stays the place she checks and saves; nothing is saved here.
 *           One box for every dashboard form on the shared engine: the host
 *           passes `form` (the field map name) and its own title and intro.
 * Touches:  POST /producers/me/ai-fill/{form} (no save).
 * Does NOT: decide which draft fields land where (the host's onDraft does),
 *           or save (the host form's own route, with its validation and
 *           moderation). The business page has its own flow, PageFillPanel.
 * Related:  components/PageFillPanel.jsx (REUSES: the write → read flow, the
 *           20-character floor, the page_fill reading/cancel/failure copy) ·
 *           backend/app/routers/form_fill.py
 * History:  MEH-3740 (creation, form=recipe)
 */

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { NotePencil } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";
import { FillMyFormProducersMeAiFillFormPostResponse as FormFillOut } from "@/lib/generated/api.zod";

const TEXT_MIN = 20;
const TEXT_MAX = 6000;

/**
 * @param {{ form: string, title: string, intro: string,
 *   onDraft: (draft: Record<string, unknown>) => void }} props
 */
export default function FormFillBox({ form, title, intro, onDraft }) {
  const t = useTranslations("page_fill");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const panelId = useId();

  const read = async () => {
    setError("");
    setReading(true);
    try {
      const res = await api.post(`/producers/me/ai-fill/${form}`, { text });
      // Rule 19: parse before use.
      const parsed = FormFillOut.safeParse(res.data);
      if (!parsed.success) throw new Error("shape");
      onDraft(parsed.data.draft);
      setText("");
      setOpen(false);
    } catch (err) {
      setError(detailToMessage(/** @type {any} */ (err)?.response?.data?.detail) || t("failed"));
    } finally {
      setReading(false);
    }
  };

  return (
    <section data-testid={`form-fill-${form}`} className="rounded-lg border border-border bg-background-alt p-4 space-y-3">
      <div className="flex items-start gap-3">
        <NotePencil size={24} aria-hidden="true" className="shrink-0 text-primary mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* The title is the toggle: no new copy for an «open» button. */}
          <h3 className="font-bold text-text">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              data-testid={`form-fill-${form}-toggle`}
              className="min-h-touch text-start underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              {title}
            </button>
          </h3>
          <p className="text-sm text-fg-muted">{intro}</p>
        </div>
      </div>
      <div id={panelId} hidden={!open} className="space-y-3">
        <Textarea
          aria-label={title}
          rows={6}
          maxLength={TEXT_MAX}
          value={text}
          onChange={(/** @type {any} */ e) => setText(e.target.value)}
          data-testid={`form-fill-${form}-text`}
        />
        {error && <InlineMessage tone="error" size="sm">{error}</InlineMessage>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={read} loading={reading} disabled={text.trim().length < TEXT_MIN} data-testid={`form-fill-${form}-read`}>
            {reading ? t("reading") : t("read")}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
        </div>
      </div>
    </section>
  );
}
