"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/CustomQuestionsCard
 * Purpose:  Owner's custom WhatsApp question chips, shown under the live list the public page serves.
 * Does NOT: seed the inputs from the category defaults: saving a default freezes it (MEH-2155).
 * Related:  ../page.js (renders this card inside its accordion).
 * History:  MEH-3157 — moved VERBATIM out of edit/page.js (1,747 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
// MEH-1245: retire the last native alert() straggler on the producer edit tab
// (CustomQuestionsCard save-error) — toast idiom matches dashboard/page.js:167
// (MEH-1092) + recipes/page.js (MEH-959/1192 conversions).
import { showToast } from "@/lib/toast";
import InfoTooltip from "@/components/InfoTooltip";
import Input from "@/components/ui/Input";
import { ViewOnPageLink } from "../cards";
import { resolveProducerQuestions } from "@/lib/resolvedQuestions";
import Button from "@/components/ui/Button";

// ============================================================
// MEH-210 Phase 2: custom WhatsApp question chips
// MEH-2155: the card now opens with the LIVE list — the same items the public
// page is serving right now — because the card was titled "שאלות שמופיעות בדף
// שלך" while showing "עוד אין שאלות מותאמות" over a page that was serving a
// full set of category defaults. A new owner met questions she had never seen,
// on a profile she had just written herself.
// ============================================================

const MAX_QUESTIONS = 5;

/**
 * Read-only mirror of the public page's question list.
 *
 * DO NOT turn these into inputs, and DO NOT seed the five inputs below with
 * them (MEH-2155 constraint, and the reason the whole card is built this way).
 * Saving a default as a custom question FREEZES it: the delivery and ordering
 * rows are answered live from her own data and would become dumb WhatsApp chips
 * the moment they were stored as custom text, and they would stop tracking the
 * details she later edits.
 */
function LiveQuestionsPreview({ items, t }) {
  if (items.length === 0) {
    return (
      <p data-testid="live-questions-empty" className="text-xs text-fg-muted">
        {t("live_empty")}
      </p>
    );
  }
  return (
    <ul data-testid="live-questions-list" className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id} data-testid="live-question-item" className="text-sm text-text">
          <span>{item.label}</span>{" "}
          <span className="text-xs text-fg-muted">
            {item.answered
              ? `— ${t("live_answered")}`
              : `— ${t("live_via", { channel: t(`live_channel.${item.channel}`) })}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CustomQuestionsCard({
  profile,
  onSave,
  reportDirty = () => {},
  // MEH-2207: the LIVE channel from the contact card's form, not profile's
  // saved value — see the state that feeds it on the page component.
  primaryMethod = "whatsapp",
}) {
  const t = useTranslations("dashboard.producer.custom_questions");
  const tRoot = useTranslations("dashboard.producer");
  // Same namespace the public renderer reads, so the labels fed to the resolver
  // are the exact strings WhatsAppQuestionChips resolves — see
  // lib/resolvedQuestions.js § "why the labels are arguments".
  const tChips = useTranslations("whatsapp.question_chips");
  const [questions, setQuestions] = useState(() => {
    const saved = profile?.custom_questions || [];
    return [...saved, ...Array(MAX_QUESTIONS - saved.length).fill("")].slice(0, MAX_QUESTIONS);
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // MEH-1100: this card had no dirty flag — derive one by comparing the
  // trimmed non-empty questions against the saved list (the exact payload
  // handleSave sends), so a save clears it via the onSave profile patch.
  const savedQuestions = profile?.custom_questions || [];
  const currentPayload = questions.filter((q) => q.trim());
  const dirty =
    currentPayload.length !== savedQuestions.length ||
    currentPayload.some((q, i) => q !== savedQuestions[i]);

  // MEH-2155: resolved from the SAVED profile, not from the in-progress inputs.
  // The list answers "what is on my page right now", so it must not move while
  // she types — it moves when she saves, which is also when the page moves.
  const live = resolveProducerQuestions(profile, {
    // MEH-2602: the visitor's area, never the business's own city.
    deliveryQuestion: tChips("delivery_to_my_area"),
    orderingQuestion: tChips("ordering_q"),
    paymentQuestion: tChips("payment_q"),
    escalationQuestion: tChips("escalation"),
  });

  // Nothing to save when every input is blank AND nothing is stored — the save
  // would PUT an empty list over an empty list and flash "נשמר" at her for a
  // no-op. With saved questions present an all-blank form is a real intent
  // (clear them), so it stays enabled.
  const nothingToSave = currentPayload.length === 0 && savedQuestions.length === 0;
  useEffect(() => {
    reportDirty("questions", dirty);
    return () => reportDirty("questions", false);
  }, [dirty, reportDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = questions.filter((q) => q.trim());
      await api.put("/producers/me", { custom_questions: payload });
      onSave(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      showToast.error(tRoot("error_questions_save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: chrome + heading live in the accordion header; the heading's
          InfoTooltip moved down to the subtitle so its content isn't lost. */}
      {/* MEH-2155: the live list comes FIRST — it is the answer to the card's
          own title. The editing affordance follows it. */}
      <ViewOnPageLink
        producerId={profile?.id}
        anchor="section-contact"
        testId="view-on-page-questions"
      />
      <div className="mb-4 rounded-md border border-border bg-background-alt px-3 py-2.5">
        <p className="text-sm font-medium text-text mb-1">{t("live_heading")}</p>
        <p className="text-xs text-fg-muted mb-2">{t("live_hint")}</p>
        <LiveQuestionsPreview items={live.items} t={t} />
      </div>
      <p className="text-xs text-fg-muted mb-4">
        {t("subtitle")}
        <InfoTooltip content={t("tooltip")} position="bottom" />
      </p>
      {/* MEH-1477: content guidance — nudges owners toward the questions
          customers actually ask before buying (stock / delivery / ordering),
          reusing the MEH-1116 helper-text idiom. */}
      <p className="text-xs text-fg-muted mb-4">
        {t("guidance")}
      </p>
      {/* MEH-2207: since the question chips started following the declared
          contact channel, a non-WhatsApp business shows none of these on its
          public page — and nothing here said so. An owner who wrote five
          questions and later switched her primary channel to phone watched
          them vanish with no explanation. Same MEH-1116 helper-text idiom as
          the guidance line above. */}
      {primaryMethod !== "whatsapp" && (
        <p className="text-xs text-fg-muted mb-4" data-testid="questions-channel-notice">
          {t("channel_notice")}
        </p>
      )}
      <div className="space-y-2">
        {questions.map((q, i) => (
          <Input
            key={i}
            type="text"
            value={q}
            maxLength={80}
            onChange={(e) => {
              const updated = [...questions];
              updated[i] = e.target.value;
              setQuestions(updated);
            }}
            placeholder={t(`placeholder_${i + 1}`)}
            className="text-sm"
            dir="rtl"
          />
        ))}
      </div>
      <Button
        onClick={handleSave}
        disabled={saving || nothingToSave}
        data-testid="questions-save"
        variant="primary" size="sm" className="mt-4"
      >
        {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
      </Button>
    </div>
  );
}
