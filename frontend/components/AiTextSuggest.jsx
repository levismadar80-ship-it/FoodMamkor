// @ts-check
"use client";
/**
 * Module:   AiTextSuggest
 * Purpose:  One button that asks the server for a short AI text, shows it as
 *           an editable preview, and on «שימוש ב…» hands it to the caller's
 *           field. The caller's own save stores it — never this component.
 * Touches:  whatever `request` calls (the caller owns the endpoint).
 * Does NOT: save, send or moderate. Copy comes from the caller's `t`, built
 *           from a literal namespace so the messages scan (MEH-2233) sees it:
 *           cta, hint, loading, preview_label, use, cancel, failed, limit,
 *           and no_name when `ready` can say no.
 * Focus:    the preview's textarea takes focus when it opens; «ביטול» hands
 *           it back to the button, «שימוש» to `focusAfterUse` (the field the
 *           text landed in) when given. The hint describes the button.
 * Used by:  ProductDescriptionSuggest.jsx (MEH-3479), ReviewsSection.jsx
 *           ReviewReply (MEH-3480).
 * History:  MEH-3479 (as ProductDescriptionSuggest); MEH-3480 (made generic)
 */
import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";

const TOO_MANY = 429;

/**
 * @param {{
 *   t: (key: string) => string,
 *   request: () => Promise<string>,
 *   ready?: () => boolean,
 *   onUse: (text: string) => void,
 *   idPrefix: string,
 *   testId: string,
 *   maxLength?: number,
 *   focusAfterUse?: string,
 * }} props
 */
export default function AiTextSuggest({
  t,
  request,
  ready,
  onUse,
  idPrefix,
  testId,
  maxLength = 2000,
  focusAfterUse,
}) {
  const [phase, setPhase] = useState(/** @type {"idle"|"loading"|"preview"|"failed"|"limit"|"no_name"} */ ("idle"));
  const [text, setText] = useState("");
  // By id, not a ref: ui/Button and ui/Textarea do not forward refs (React 18).
  const previewId = `${idPrefix}-suggested`;
  const ctaId = `${idPrefix}-suggest-cta`;
  const hintId = `${idPrefix}-suggest-hint`;
  // Where focus goes when the preview closes: the field the text landed in
  // after «שימוש» (when the caller names it), else back to the button.
  const returnFocus = useRef(/** @type {string|null} */ (null));

  useEffect(() => {
    if (phase === "preview") document.getElementById(previewId)?.focus();
    else if (phase === "idle" && returnFocus.current) {
      const target = returnFocus.current;
      returnFocus.current = null;
      document.getElementById(target)?.focus();
    }
  }, [phase, previewId]);

  const close = (/** @type {string} */ target = ctaId) => {
    returnFocus.current = target;
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
      // A labelled group: the screen reader hears which «ביטול» this is when
      // the form around it has its own (the review-reply editor does).
      <div
        role="group"
        aria-label={t("cta")}
        data-testid={`${testId}-suggestion`}
        className="mt-2 border border-primary/30 rounded-md p-3 space-y-2"
      >
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
              close(focusAfterUse || ctaId);
            }}
          >
            {t("use")}
          </Button>
          <Button type="button" size="sm" variant="outlined" onClick={() => close()}>
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
