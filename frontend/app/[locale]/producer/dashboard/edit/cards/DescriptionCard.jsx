"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/DescriptionCard
 * Purpose:  Hero description + tagline editor with the AI writing assist.
 * Does NOT: write the owner story: that is OwnerStoryCard.jsx.
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning, X, Sparkle } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { ViewOnPageLink } from "./ViewOnPageLink";

// ============================================================
// MEH-1173: "תיאור העסק" card (was "ביו AI" / BioPanelCard). Direction 2 —
// Shopify Magic pattern: ONE hero description field is the product; AI is a
// quiet assist INSIDE the card. The assist replaces the old free-text source
// + Instagram scrape (deleted backend-side) with a 3-question structured form.
//   • hero textarea = description (always visible, prefilled, 150 counter)
//   • tagline input = short_description (public card, MEH-1002 gap closed)
//   • ONE save → PUT /producers/me {description, short_description}
//   • generate fills the hero with a transient primary/10 highlight + toast;
//     an empty fail-open result NEVER wipes existing text (MEH-1163 guard).
//   • error mapping split by cause preserved 1:1 (MEH-1157): 401 / 429 /
//     200 {"bio":""} fail-open / other.
// ============================================================

// Deliberately TIGHTER than the schemas.py sanitize caps (description 2000,
// short_description 160/200) — product-length choices, not mirrors. The
// invariant that must hold is client <= server (otherwise the UI accepts
// input the server silently truncates); enforced by
// scripts/checks/length-cap-sync-guard.sh (MEH-1393).
const DESC_MAX = 150;
const TAGLINE_MAX = 160;
const HIGHLIGHT_MS = 2500;

// The inline 3-question assist form. Bundled state passed as one `assist`
// object so this stays a 2-arg component (exec §8 / max-params). q_sell is the
// only required field — the "צרו תיאור" button gates on it, with a visible
// reason line so a disabled button is never a dead end.
function AssistForm({ t, assist }) {
  const {
    sells, setSells, area, setArea, special, setSpecial,
    instagram, setInstagram, generate, close, loading, error,
  } = assist;
  const canGenerate = !!sells.trim();

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-md p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkle size={16} weight="fill" className="text-accent shrink-0" aria-hidden="true" />
        <strong className="text-sm flex-1">{t("assist_title")}</strong>
        <button
          type="button"
          onClick={close}
          aria-label={t("assist_close")}
          className="text-fg-muted hover:text-text transition"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <AssistField
        label={t("q_sell_label")}
        value={sells}
        onChange={setSells}
        placeholder={t("q_sell_placeholder")}
      />
      <AssistField
        label={t("q_area_label")}
        value={area}
        onChange={setArea}
        placeholder={t("q_area_placeholder")}
        optional={t("optional")}
      />
      <AssistField
        label={t("q_special_label")}
        value={special}
        onChange={setSpecial}
        placeholder={t("q_special_placeholder")}
        optional={t("optional")}
      />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium">{t("instagram_label")}</label>
          <span className="text-2xs text-fg-muted border border-border rounded-full px-2 py-px">
            {t("optional")}
          </span>
        </div>
        {/* MEH-1608: handle-shaped placeholder via i18n — the old hardcoded
            "https://instagram.com/…" told owners to type the exact value
            that broke their public link (ContactCard composes the URL). */}
        <Input inline size="sm"
          type="text"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value.slice(0, 200))}
          placeholder={t("instagram_placeholder")}
          className="w-full"
          dir="ltr"
          maxLength={200}
        />
        <p className="text-2xs text-fg-muted">{t("instagram_hint")}</p>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!canGenerate || loading}
        className="w-full bg-primary text-white py-2 rounded-full text-sm font-medium disabled:opacity-50 hover:bg-primary-dark transition flex items-center justify-center gap-2"
      >
        <Sparkle size={16} weight="fill" aria-hidden="true" />
        {loading ? t("generating") : t("generate_cta")}
      </button>
      {!canGenerate && (
        <p className="text-2xs text-fg-muted text-center">{t("generate_hint_disabled")}</p>
      )}
      {error && (
        <InlineMessage size="xs" className="flex items-start gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
          {error}
        </InlineMessage>
      )}
    </div>
  );
}

// One structured question row. dir="auto" so Hebrew answers flow RTL (fixes the
// old LTR source field's broken bidi).
function AssistField({ label, value, onChange, placeholder, optional }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium">{label}</label>
        {optional && (
          <span className="text-2xs text-fg-muted border border-border rounded-full px-2 py-px">
            {optional}
          </span>
        )}
      </div>
      <Input inline size="sm"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 200))}
        placeholder={placeholder}
        className="w-full"
        dir="auto"
        maxLength={200}
      />
    </div>
  );
}

// Exported for isolation tests (EditTabDescriptionCard.test.jsx) — see CategoriesCard.
export function DescriptionCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.description_card");
  const [description, setDescription] = useState(profile.description || "");
  const [savedDescription, setSavedDescription] = useState(profile.description || "");
  const [tagline, setTagline] = useState(profile.short_description || "");
  const [savedTagline, setSavedTagline] = useState(profile.short_description || "");
  const [assistOpen, setAssistOpen] = useState(false);
  const [sells, setSells] = useState("");
  const [area, setArea] = useState("");
  const [special, setSpecial] = useState("");
  const [instagram, setInstagram] = useState(profile.instagram || "");
  // MEH-1261 F5: the instagram edit used to feed ONLY the AI-generate payload
  // and was silently dropped on save — the one rendered field whose edit did
  // not persist. It now joins the card's save contract (the backend owner
  // whitelist already accepts `instagram` — producer_me.py _PRODUCER_WRITABLE_FIELDS).
  const [savedInstagram, setSavedInstagram] = useState(profile.instagram || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [error, setError] = useState("");

  // Dirty covers ALL saved fields — the single save button owns them together.
  const dirty =
    description !== savedDescription ||
    tagline !== savedTagline ||
    instagram !== savedInstagram;
  useEffect(() => {
    reportDirty("bio", dirty);
    return () => reportDirty("bio", false);
  }, [dirty, reportDirty]);

  // The generated-highlight is transient — fades on its own (calm idiom, no
  // manual dismissal). Respects prefers-reduced-motion via the CSS transition.
  useEffect(() => {
    if (!highlight) return undefined;
    const id = setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [highlight]);

  const generate = async () => {
    if (!sells.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await api.post("/producers/me/bio/generate", {
        sells: sells.trim(),
        area: area.trim() || null,
        special: special.trim() || null,
        instagram: instagram.trim() || null,
      });
      // MEH-1157: fail-open backend returns 200 {"bio":""} when AI is down —
      // say so. MEH-1163: an empty result must NEVER wipe existing text.
      if (r.data.bio) {
        setDescription(r.data.bio.slice(0, DESC_MAX));
        setSaved(false);
        setHighlight(true);
        setAssistOpen(false);
        showToast.success(t("toast_generated"));
      } else {
        setError(t("error_unavailable"));
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) setError(t("error_session_expired"));
      else if (status === 429) setError(t("error_rate_limit"));
      else setError(t("error_generate"));
    }
    setLoading(false);
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setError("");
    const short_description = tagline.trim() ? tagline : null;
    // MEH-1261 F5: persist the instagram edit too (trimmed; empty clears).
    const instagramValue = instagram.trim() || null;
    try {
      await api.put("/producers/me", {
        description,
        short_description,
        instagram: instagramValue,
      });
      onSave({ description, short_description, instagram: instagramValue });
      setSavedDescription(description);
      setSavedTagline(tagline);
      setSavedInstagram(instagram);
      setSaved(true);
    } catch (err) {
      // MEH-3261: an approved business's text refused by the AI check (422)
      // shows the backend's sentence, not the generic "save failed".
      setError(detailToMessage(err?.response?.data?.detail) || t("error_save"));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* MEH-1116: card chrome + heading live in the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted">{t("intro")}</p>
      {/* MEH-1306: back-link to the public description section. */}
      <ViewOnPageLink producerId={profile?.id} anchor="section-bio" />

      {/* Hero: the description IS the product. Always visible, prefilled. */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium">{t("desc_label")}</label>
          <span className="text-2xs text-fg-muted">{t("desc_where")}</span>
        </div>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value.slice(0, DESC_MAX)); setSaved(false); }}
          placeholder={t("desc_placeholder")}
          className={`w-full rounded-sm px-3 py-2 text-sm resize-none h-24 transition-colors duration-500 focus-ring ${
            highlight
              ? "border border-primary bg-primary/10 ring-2 ring-primary/20"
              : "border border-primary/30 bg-primary/5"
          }`}
          dir="auto"
          maxLength={DESC_MAX}
        />
        <div className="flex items-center justify-end">
          <span className="text-xs text-fg-muted tabular-nums" dir="ltr">
            {description.length}/{DESC_MAX}
          </span>
        </div>
      </div>

      {/* Assist: quiet text-button → inline structured form. */}
      {assistOpen ? (
        <AssistForm
          t={t}
          assist={{
            sells, setSells, area, setArea, special, setSpecial,
            // MEH-1261 F5: instagram edits are saved fields now — editing one
            // drops the "נשמר" label like the description/tagline inputs do.
            instagram,
            setInstagram: (v) => { setInstagram(v); setSaved(false); },
            generate, close: () => setAssistOpen(false),
            loading, error,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAssistOpen(true)}
          className="inline-flex items-center gap-2 text-primary font-medium text-sm self-start hover:text-primary-dark transition"
        >
          <Sparkle size={16} weight="fill" aria-hidden="true" />
          {t("assist_cta")}
        </button>
      )}

      {/* Tagline → short_description (public card in search + listings). */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium">{t("tagline_label")}</label>
          <span className="text-2xs text-fg-muted">{t("tagline_where")}</span>
        </div>
        <Input inline size="sm"
          type="text"
          value={tagline}
          onChange={(e) => { setTagline(e.target.value.slice(0, TAGLINE_MAX)); setSaved(false); }}
          placeholder={t("tagline_placeholder")}
          className="w-full"
          dir="auto"
          maxLength={TAGLINE_MAX}
        />
        <div className="flex items-center justify-end">
          <span className="text-xs text-fg-muted tabular-nums" dir="ltr">
            {tagline.length}/{TAGLINE_MAX}
          </span>
        </div>
      </div>

      {/* ONE explicit save for the whole card. */}
      <Button
        onClick={save}
        disabled={saving || !dirty}
        variant="primary" size="sm"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </Button>

      {error && !assistOpen && (
        <InlineMessage size="xs" className="flex items-start gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
          {error}
        </InlineMessage>
      )}
    </div>
  );
}
