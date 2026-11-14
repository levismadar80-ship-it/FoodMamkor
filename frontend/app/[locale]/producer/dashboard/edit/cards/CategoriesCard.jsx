"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/CategoriesCard
 * Purpose:  Owner-facing categories editor (saves category_ids via PUT /producers/me).
 * Does NOT: own the category picker itself: that is components/CategorySelector.jsx.
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import CategorySelector from "@/components/CategorySelector";
import CategoryRequestModal from "@/components/CategoryRequestModal";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

// ============================================================
// Edit-tab chunk A: producer-facing categories editor.
// Mirrors ContactChannelsCard — local selection seeded from
// profile.categories, saves category_ids via PUT /producers/me. A
// license-required category chosen with no license number triggers a backend
// 422 (ensure_license_for_categories, producer_me.py); the Hebrew detail is
// surfaced inline via detailToMessage (lib/errors.js), never the generic copy.
// REUSES: components/admin/ProducerForm.jsx:207-217,433-451 (GET /categories
// checkbox grid + toggle), producer-self version.
// ============================================================

// Exported for isolation tests (EditTabCategoriesCard.test.jsx). Mounting the
// whole page under jsdom hangs the vitest runner, so the cards are tested
// directly — the default page export is unchanged.
export function CategoriesCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.categories");
  const [allCategories, setAllCategories] = useState([]);
  const seedIds = (profile?.categories || []).map((c) => c.id);
  const [selected, setSelected] = useState(seedIds);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // MEH-1539 T3: CategorySelector's no-results CTA needs a destination — the
  // same request-a-category modal the register step opens
  // (RegisterProducerClient.jsx:775). Without it the CTA would be a dead link.
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/categories")
      .then((r) => {
        if (!cancelled) {
          setAllCategories(r.data || []);
          setFetchError(null);
        }
      })
      .catch((err) => {
        // Surface a load failure instead of a silently-empty grid (a producer
        // would otherwise see a blank card with no way to know it failed).
        if (!cancelled) {
          setAllCategories([]);
          setFetchError(detailToMessage(err?.response?.data?.detail) || t("fetch_error"));
        }
      });
    return () => {
      cancelled = true;
    };
    // `t` (next-intl translator) has a stable identity per locale/namespace,
    // so listing it re-runs the fetch only on a real locale change — never a
    // per-render loop. (The earlier loop came from an ad-hoc test mock that
    // returned a fresh `t` each render; tests now use the real
    // NextIntlClientProvider, so the honest dependency is safe.)
  }, [t]);

  // Dirty when the selection differs from the seeded set (order-independent).
  const dirty =
    seedIds.length !== selected.length ||
    seedIds.some((id) => !selected.includes(id));
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("categories", dirty);
    return () => reportDirty("categories", false);
  }, [dirty, reportDirty]);

  const toggle = (id) => {
    setSaved(false);
    setErrorMsg(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", { category_ids: selected });
      // Keep the parent profile in sync so a re-render reseeds correctly.
      onSave({ categories: allCategories.filter((c) => selected.includes(c.id)) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Surface the backend Hebrew detail (e.g. license-required 422) inline;
      // detailToMessage normalises the FastAPI 422 detail-array (MEH-989).
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      {fetchError ? (
        <InlineMessage size="xs" className="flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {fetchError}
        </InlineMessage>
      ) : (
        <CategorySelector
          categories={allCategories}
          selectedIds={selected}
          onChange={toggle}
          onRequestCategory={() => setShowCategoryModal(true)}
        />
      )}

      <CategoryRequestModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        producerId={profile?.id ?? null}
      />

      {errorMsg && (
        <InlineMessage size="xs" className="mt-3 flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </InlineMessage>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || !dirty}
        variant="primary" size="sm" className="mt-4"
      >
        {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
      </Button>
    </div>
  );
}
