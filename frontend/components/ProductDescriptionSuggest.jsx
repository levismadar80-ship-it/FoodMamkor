// @ts-check
"use client";
/**
 * Module:   ProductDescriptionSuggest
 * Purpose:  «הצעת תיאור» under a product's description field (MEH-3479): asks
 *           the server for a short description from what the form holds now,
 *           shows it as an editable preview, and on «שימוש בהצעה» hands it to
 *           the form. The product save stores it — never this component.
 * Touches:  POST {basePath}/product-description/suggest only.
 * Does NOT: save the product, or moderate (the product POST/PUT does both).
 * Used by:  ProductsSection.jsx (owner, new + edit) and
 *           admin/DraftProductsPanel.jsx (admin, basePath /admin/producers/{id}).
 * Focus:    the preview's textarea takes focus when it opens; «שימוש בהצעה» /
 *           «ביטול» hand it back to the «הצעת תיאור» button (review, MEH-3479).
 * History:  MEH-3479 (creation)
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import InlineMessage from "@/components/ui/InlineMessage";

const TOO_MANY = 429;

/**
 * @typedef {{ name?: string, description?: string|null, group?: string|null,
 *   price_min?: string|number|null, price_unit?: string|null }} DescribeInput
 */

/** @param {DescribeInput} input */
function payload(input) {
  const price = input.price_min === "" || input.price_min == null ? null : String(input.price_min);
  return {
    name: (input.name || "").trim(),
    ...(input.group ? { group: input.group } : {}),
    ...(price ? { price_min: price, price_unit: input.price_unit || null } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  };
}

/**
 * @param {{
 *   basePath?: string,
 *   input: DescribeInput,
 *   onUse: (text: string) => void,
 *   idPrefix: string,
 * }} props
 */
export default function ProductDescriptionSuggest({ basePath = "/producers/me", input, onUse, idPrefix }) {
  const t = useTranslations("settings.products.describe");
  const [phase, setPhase] = useState(/** @type {"idle"|"loading"|"preview"|"failed"|"limit"|"no_name"} */ ("idle"));
  const [text, setText] = useState("");
  // By id, not a ref: ui/Button and ui/Textarea do not forward refs (React 18).
  const previewId = `${idPrefix}-suggested-description`;
  const ctaId = `${idPrefix}-describe-cta`;
  const returnFocus = useRef(false);
  const hintId = `${idPrefix}-describe-hint`;

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
    if (!(input.name || "").trim()) {
      setPhase("no_name");
      return;
    }
    setPhase("loading");
    try {
      const r = await api.post(`${basePath}/product-description/suggest`, payload(input));
      const got = typeof r.data?.description === "string" ? r.data.description : "";
      if (!got) {
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
      <div data-testid="description-suggestion" className="mt-2 border border-primary/30 rounded-md p-3 space-y-2">
        <Textarea
          id={previewId}
          label={t("preview_label")}
          value={text}
          rows={3}
          maxLength={2000}
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
    <div data-testid="description-suggest" className="mt-2">
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
