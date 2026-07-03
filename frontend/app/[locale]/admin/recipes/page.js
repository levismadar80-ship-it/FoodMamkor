"use client";

import { useCallback, useEffect, useState } from "react";
import { Bread } from "@phosphor-icons/react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

/**
 * Admin recipes moderation queue (MEH-997 seed fix).
 *
 * REUSES: app/[locale]/admin/experiences/page.js — 1:1 mirror of the
 * experiences queue, adjusted to the recipes 4-state machine
 * (pending / needs_revision / approved / rejected — producer_recipes
 * moderation_status, NOT the experiences `status` field) and to the
 * admin_recipes.py endpoints that shipped in MEH-589 without a UI.
 */

// Tab values map to admin.recipes.tabs.* keys AND directly to the
// backend's `moderation_status` query param regex.
const TAB_VALUES = ["pending", "needs_revision", "approved", "rejected", "all"];

function formatDate(iso, locale) {
  if (!iso) return "—";
  return formatEventDate(iso, locale, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function AdminRecipesPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state for request-changes / reject
  const [modalRecipe, setModalRecipe] = useState(null);
  const [modalAction, setModalAction] = useState(null); // "changes" | "reject"
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/admin/recipes", { params: { moderation_status: tab } })
      .then((r) => {
        setRows(r.data);
        setError("");
      })
      .catch((e) =>
        setError(detailToMessage(e.response?.data?.detail) || t("recipes.error_loading"))
      )
      .finally(() => setLoading(false));
  }, [tab, t]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (recipe) => {
    setBusy(true);
    try {
      await api.post(`/admin/recipes/${recipe.id}/approve`);
      showToast.success(t("recipes.approve_toast"), { icon: <Bread size={18} /> });
      load();
    } catch (e) {
      alert(detailToMessage(e.response?.data?.detail) || t("recipes.approve_error"));
    } finally {
      setBusy(false);
    }
  };

  const openModal = (recipe, action) => {
    setModalRecipe(recipe);
    setModalAction(action);
    setFeedback("");
  };

  const closeModal = () => {
    setModalRecipe(null);
    setModalAction(null);
    setFeedback("");
  };

  const submitModal = async () => {
    if (!modalRecipe || !modalAction) return;
    if (!feedback.trim()) {
      alert(t("recipes.validate_feedback"));
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        modalAction === "changes" ? "request-changes" : "reject";
      await api.post(`/admin/recipes/${modalRecipe.id}/${endpoint}`, {
        feedback: feedback.trim(),
      });
      showToast.success(
        modalAction === "changes" ? t("recipes.changes_toast") : t("recipes.reject_toast"),
      );
      closeModal();
      load();
    } catch (e) {
      alert(detailToMessage(e.response?.data?.detail) || t("recipes.submit_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            data-testid="admin-recipes-title"
            className="font-headline-md text-2xl font-bold text-text"
          >
            {t("recipes.title")}
          </h1>
          <p className="text-fg-muted text-sm mt-1">
            {t("recipes.subtitle")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {TAB_VALUES.map((value) => (
          <button
            key={value}
            data-testid={`admin-recipes-tab-${value}`}
            onClick={() => setTab(value)}
            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition ${
              tab === value
                ? "bg-primary text-white"
                : "bg-white border border-border text-text hover:bg-green-50"
            }`}
          >
            {t(`recipes.tabs.${value}`)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-fg-muted">{t("common.loading_f")}</p>
      ) : rows.length === 0 ? (
        <div
          data-testid="admin-recipes-empty"
          className="bg-white border border-border rounded-[16px] p-8 text-center text-fg-muted"
        >
          {t("recipes.empty")}
        </div>
      ) : (
        // overflow-x-auto (not -hidden like experiences): on 375px the
        // actions column must stay reachable by scrolling inside the card
        <div className="bg-white border border-border rounded-[16px] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-green-50 text-fg-muted text-xs">
              <tr>
                <th className="text-end p-3 font-medium">{t("recipes.columns.title")}</th>
                <th className="text-end p-3 font-medium">{t("recipes.columns.created")}</th>
                <th className="text-end p-3 font-medium">{t("recipes.columns.published")}</th>
                <th className="text-end p-3 font-medium">{t("recipes.columns.status")}</th>
                <th className="text-end p-3 font-medium">{t("recipes.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((recipe) => (
                <RecipeRow
                  key={recipe.id}
                  recipe={recipe}
                  busy={busy}
                  t={t}
                  locale={locale}
                  onApprove={approve}
                  onChanges={(row) => openModal(row, "changes")}
                  onReject={(row) => openModal(row, "reject")}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Feedback modal */}
      {modalRecipe && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-[16px] p-6 max-w-lg w-full border border-border">
            <h2 className="font-headline-md text-xl font-bold text-text mb-2">
              {modalAction === "changes" ? t("recipes.modal.changes_title") : t("recipes.modal.reject_title")}
            </h2>
            <p className="text-fg-muted text-sm mb-4">
              &quot;{modalRecipe.title}&quot;
            </p>
            <label className="block text-sm font-medium text-text mb-1">
              {modalAction === "changes" ? t("recipes.modal.changes_label") : t("recipes.modal.reject_label")}
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              className="w-full border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
              placeholder={
                modalAction === "changes"
                  ? t("recipes.modal.changes_placeholder")
                  : t("recipes.modal.reject_placeholder")
              }
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeModal}
                disabled={busy}
                className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={submitModal}
                disabled={busy}
                className={`px-4 py-2 rounded-[8px] text-white ${
                  modalAction === "changes"
                    ? "bg-accent hover:opacity-90"
                    : "bg-red-600 hover:bg-red-700"
                } disabled:opacity-50`}
              >
                {busy ? t("common.sending") : t("recipes.modal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// moderation_status → badge tone. Mirrors the RecipeStatusBadge palette
// on the producer dashboard (pending=gray, needs_revision=yellow,
// approved=green, rejected=red).
const STATUS_BADGE = {
  pending: "bg-gray-100 text-gray-600",
  needs_revision: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-50 text-primary",
  rejected: "bg-red-50 text-red-700",
};

function RecipeRow({ recipe, busy, t, locale, onApprove, onChanges, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const status = recipe.moderation_status;

  return (
    <>
      <tr
        data-testid="admin-recipes-row"
        className="border-t border-border hover:bg-green-50/30"
      >
        <td className="p-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="font-medium text-text hover:text-primary text-end"
          >
            {recipe.title}
          </button>
        </td>
        <td className="p-3 text-fg-muted">{formatDate(recipe.created_at, locale)}</td>
        <td className="p-3 text-fg-muted">
          {recipe.published ? t("recipes.published_yes") : t("recipes.published_no")}
        </td>
        <td className="p-3">
          <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[status] || STATUS_BADGE.pending}`}>
            {t(`recipes.status_labels.${status}`)}
          </span>
        </td>
        <td className="p-3">
          <div className="flex gap-1 flex-wrap">
            {status !== "approved" && (
              <button
                onClick={() => onApprove(recipe)}
                disabled={busy}
                className="bg-primary text-white px-3 py-1 rounded-full text-xs hover:bg-primary-dark disabled:opacity-50"
              >
                {t("recipes.actions.approve")}
              </button>
            )}
            {status !== "needs_revision" && (
              <button
                onClick={() => onChanges(recipe)}
                disabled={busy}
                className="bg-accent text-white px-3 py-1 rounded-full text-xs hover:opacity-90 disabled:opacity-50"
              >
                {t("recipes.actions.changes")}
              </button>
            )}
            {status !== "rejected" && (
              <button
                onClick={() => onReject(recipe)}
                disabled={busy}
                className="bg-red-600 text-white px-3 py-1 rounded-full text-xs hover:bg-red-700 disabled:opacity-50"
              >
                {t("recipes.actions.reject")}
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-green-50/20 border-t border-border">
          <td colSpan={5} className="p-4">
            <div className="text-sm space-y-2 text-text">
              {recipe.description && (
                <p className="whitespace-pre-wrap">{recipe.description}</p>
              )}
              <p>
                <span className="font-medium">{t("recipes.ingredients_label")}</span>
              </p>
              <p className="whitespace-pre-wrap text-fg-muted">{recipe.ingredients}</p>
              <p>
                <span className="font-medium">{t("recipes.instructions_label")}</span>
              </p>
              <p className="whitespace-pre-wrap text-fg-muted">{recipe.instructions}</p>
              {recipe.moderation_notes && (
                <div className="mt-3 bg-white border border-border rounded-[12px] p-3">
                  <p className="font-medium text-xs mb-1">
                    {t("recipes.notes_label")}
                  </p>
                  <p className="text-xs text-fg-muted">{recipe.moderation_notes}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
