// @ts-check
"use client";
/**
 * Module:   AiTextSuggest
 * Purpose:  One button that asks the server for a short AI text, shows it as
 *           an editable preview, and on «שימוש ב…» hands it to the caller's
 *           field. The caller's own save stores it — never this component.
 * Touches:  whatever `request` calls (the caller owns the endpoint).
 * Does NOT: save, send or moderate. Copy comes from the caller's namespace:
 *           cta, hint, loading, preview_label, use, cancel, failed, limit,
 *           and no_name when `ready` can say no.
 * Focus:    the preview's textarea takes focus when it opens; «שימוש» /
 *           «ביטול» hand it back to the button. The hint describes the button.
 * Used by:  ProductDescriptionSuggest.jsx (MEH-3479), ReviewsSection.jsx
 *           ReviewReply (MEH-3480).
 * History:  MEH-3479 (as ProductDescriptionSuggest); MEH-3480 (made generic)
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";

const TOO_MANY = 429;

/**
 * @param {{
 *   namespace: string,
 *   request: () => Promise<string>,
 *   ready?: () => boolean,
 *   onUse: (text: string) => void,
 *   idPrefix: string,
 *   testId: string,
 *   maxLength?: number,
 * }} props
 */
export default function AiTextSuggest({ namespace, request, ready, onUse, idPrefix, testId, maxLength = 2000 }) {
  const t = useTranslations(namespace);
  const [phase, setPhase] = useState(/** @type {"idle"|"loading"|"preview"|"failed"|"limit"|"no_name"} */ ("idle"));
  const [text, setText] = useState("");
  // By id, not a ref: ui/Button and ui/Textarea do not forward refs (React 18).
  const previewId = `${idPrefix}-suggested`;
  const ctaId = `${idPrefix}-suggest-cta`;
  const hintId = `${idPrefix}-suggest-hint`;
  const returnFocus = useRef(false);

  useEffect(() => {
    if (phase === "preview") document.getElementById(previewId)?.focus();
    else if (phase === "idle" && returnFocus.current) {
      returnFocus.current = false;
      document.getElementById(ctaId)?.focus();
    }
  }, [phase, previewId, ctaId]);

  const close = () => {
    returnFocus.current = true;
    setPhase("idle");
  };

  const ask = async () => {
    if (ready && !ready()) {
      setPhase("no_name");
      return;
    }
    setPhase("loading");
    try {
      const got = await request();
      if (typeof got !== "string" || !got) {
        setPhase("failed");
        return;
      }
      setText(got);
      setPhase("preview");
    } catch (err) {
      setPhase(/** @type {any} */ (err)?.response?.status === TOO_MANY ? "limit" : "failed");
    }
  };

  if (phase === "preview") {
    return (
      <div data-testid={`${testId}-suggestion`} className="mt-2 border border-primary/30 rounded-md p-3 space-y-2">
        <Textarea
          id={previewId}
          label={t("preview_label")}
          value={text}
          rows={3}
          maxLength={maxLength}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              onUse(text.trim());
              close();
            }}
          >
            {t("use")}
          </Button>
          <Button type="button" size="sm" variant="outlined" onClick={close}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  const message = { loading: "loading", failed: "failed", limit: "limit", no_name: "no_name" }[phase];
  return (
    <div data-testid={`${testId}-suggest`} className="mt-2">
      <Button
        id={ctaId}
        type="button"
        size="sm"
        variant="secondary"
        onClick={ask}
        disabled={phase === "loading"}
        aria-describedby={hintId}
      >
        {t("cta")}
      </Button>
      <p id={hintId} className="text-xs text-fg-muted mt-1">{t("hint")}</p>
      {message && <InlineMessage tone="info" className="mt-2">{t(message)}</InlineMessage>}
    </div>
  );
}
