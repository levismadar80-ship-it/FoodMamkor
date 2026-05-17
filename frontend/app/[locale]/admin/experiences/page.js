"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import InfoTooltip from "@/components/InfoTooltip";

// Tab values map to admin.experiences.tabs.* keys; labels resolved in render
const TAB_VALUES = ["pending", "changes_requested", "approved", "rejected", "all"];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminExperiencesPage() {
  const t = useTranslations("admin");
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal state for request-changes / reject
  const [modalEx, setModalEx] = useState(null);
  const [modalAction, setModalAction] = useState(null); // "changes" | "reject"
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/admin/experiences", { params: { status: tab } })
      .then((r) => {
        setRows(r.data);
        setError("");
      })
      .catch((e) =>
        setError(e.response?.data?.detail || t("experiences.error_loading"))
      )
      .finally(() => setLoading(false));
  }, [tab, t]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (ex) => {
    setBusy(true);
    try {
      await api.post(`/admin/experiences/${ex.id}/approve`);
      showToast(t("experiences.approve_toast"));
      load();
    } catch (e) {
      alert(e.response?.data?.detail || t("experiences.approve_error"));
    } finally {
      setBusy(false);
    }
  };

  const openModal = (ex, action) => {
    setModalEx(ex);
    setModalAction(action);
    setFeedback("");
  };

  const closeModal = () => {
    setModalEx(null);
    setModalAction(null);
    setFeedback("");
  };

  const submitModal = async () => {
    if (!modalEx || !modalAction) return;
    if (!feedback.trim()) {
      alert(t("experiences.validate_feedback"));
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        modalAction === "changes" ? "request-changes" : "reject";
      await api.post(`/admin/experiences/${modalEx.id}/${endpoint}`, {
        feedback: feedback.trim(),
      });
      showToast(
        modalAction === "changes" ? t("experiences.changes_toast") : t("experiences.reject_toast")
      );
      closeModal();
      load();
    } catch (e) {
      alert(e.response?.data?.detail || t("experiences.submit_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-site-text">
            {t("experiences.title")}
          </h1>
          <p className="text-site-muted text-sm mt-1">
            {t("experiences.subtitle")}
          </p>
        </div>
        <Link
          href="/experiences"
          target="_blank"
          className="text-primary text-sm hover:underline"
        >
          {t("experiences.public_link")}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {TAB_VALUES.map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition ${
              tab === value
                ? "bg-primary text-white"
                : "bg-white border border-border text-site-text hover:bg-light"
            }`}
          >
            {t(`experiences.tabs.${value}`)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-site-muted">{t("common.loading_f")}</p>
      ) : rows.length === 0 ? (
        <div className="bg-white border border-border rounded-[16px] p-8 text-center text-site-muted">
          {t("experiences.empty")}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-[16px] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-light text-site-muted text-xs">
              <tr>
                <th className="text-end p-3 font-medium">{t("experiences.columns.title")}</th>
                <th className="text-end p-3 font-medium">{t("experiences.columns.host")}</th>
                <th className="text-end p-3 font-medium">{t("experiences.columns.date")}</th>
                <th className="text-end p-3 font-medium">{t("experiences.columns.city")}</th>
                <th className="text-end p-3 font-medium">
                  {t("experiences.columns.claude")}
                  <InfoTooltip
                    content={t("experiences.claude_tooltip")}
                    label={t("experiences.claude_tooltip_label")}
                    position="bottom"
                  />
                </th>
                <th className="text-end p-3 font-medium">{t("experiences.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ex) => (
                <ExperienceRow
                  key={ex.id}
                  ex={ex}
                  busy={busy}
                  t={t}
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
      {modalEx && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-[16px] p-6 max-w-lg w-full border border-border">
            <h2 className="font-headline text-xl font-bold text-site-text mb-2">
              {modalAction === "changes" ? t("experiences.modal.changes_title") : t("experiences.modal.reject_title")}
            </h2>
            <p className="text-site-muted text-sm mb-4">
              &quot;{modalEx.title}&quot; — {modalEx.host?.name}
            </p>
            <label className="block text-sm font-medium text-site-text mb-1">
              {modalAction === "changes" ? t("experiences.modal.changes_label") : t("experiences.modal.reject_label")}
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              className="w-full border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
              placeholder={
                modalAction === "changes"
                  ? t("experiences.modal.changes_placeholder")
                  : t("experiences.modal.reject_placeholder")
              }
            />
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={closeModal}
                disabled={busy}
                className="px-4 py-2 rounded-[8px] border border-border text-site-text hover:bg-light"
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
                {busy ? t("common.sending") : t("experiences.modal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExperienceRow({ ex, busy, t, onApprove, onChanges, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const modBadge =
    ex.moderation_status === "FLAGGED"
      ? "bg-yellow-100 text-yellow-800"
      : ex.moderation_status === "APPROVED"
      ? "bg-light text-primary"
      : "bg-gray-100 text-gray-600";

  return (
    <>
      <tr className="border-t border-border hover:bg-light/30">
        <td className="p-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="font-medium text-site-text hover:text-primary text-end"
          >
            {ex.title}
          </button>
        </td>
        <td className="p-3 text-site-muted">{ex.host?.name || "—"}</td>
        <td className="p-3 text-site-muted">{formatDate(ex.event_date)}</td>
        <td className="p-3 text-site-muted">{ex.city || "—"}</td>
        <td className="p-3">
          <span className={`text-xs px-2 py-1 rounded-full ${modBadge}`}>
            {ex.moderation_status || "—"}
          </span>
        </td>
        <td className="p-3">
          <div className="flex gap-1 flex-wrap">
            {ex.status !== "approved" && (
              <button
                onClick={() => onApprove(ex)}
                disabled={busy}
                className="bg-primary text-white px-3 py-1 rounded-full text-xs hover:bg-primary-light disabled:opacity-50"
              >
                {t("experiences.actions.approve")}
              </button>
            )}
            {ex.status !== "changes_requested" && (
              <button
                onClick={() => onChanges(ex)}
                disabled={busy}
                className="bg-accent text-white px-3 py-1 rounded-full text-xs hover:opacity-90 disabled:opacity-50"
              >
                {t("experiences.actions.changes")}
              </button>
            )}
            {ex.status !== "rejected" && (
              <button
                onClick={() => onReject(ex)}
                disabled={busy}
                className="bg-red-600 text-white px-3 py-1 rounded-full text-xs hover:bg-red-700 disabled:opacity-50"
              >
                {t("experiences.actions.reject")}
              </button>
            )}
            <Link
              href={`/experiences/${ex.id}`}
              target="_blank"
              className="text-primary text-xs px-2 py-1 hover:underline"
            >
              {t("experiences.actions.view")}
            </Link>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-light/20 border-t border-border">
          <td colSpan={6} className="p-4">
            <div className="text-sm space-y-2 text-site-text">
              <p className="whitespace-pre-wrap">{ex.description}</p>
              {ex.address && (
                <p className="text-site-muted inline-flex items-center gap-1">
                  <MapPin size={14} weight="duotone" className="text-primary" aria-hidden="true" />
                  {ex.address}
                </p>
              )}
              {ex.price_per_person != null && (
                <p className="text-site-muted">
                  💰{" "}
                  {Number(ex.price_per_person) === 0
                    ? t("experiences.free")
                    : t("experiences.price_per_person", { price: ex.price_per_person })}
                </p>
              )}
              {ex.requirements && (
                <p>
                  <span className="font-medium">{t("experiences.requirements_label")}</span> {ex.requirements}
                </p>
              )}
              {ex.moderation_reason && (
                <div className="mt-3 bg-white border border-border rounded-[12px] p-3">
                  <p className="font-medium text-xs mb-1">
                    {t("experiences.claude_preview")}
                  </p>
                  <p className="text-xs text-site-muted">
                    {ex.moderation_reason}
                  </p>
                  {ex.moderation_suggestion && (
                    <p className="text-xs text-site-muted mt-1">
                      💡 {ex.moderation_suggestion}
                    </p>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
