"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { KASHRUT_BUSINESS_PORTAL_URL } from "@/lib/official-registries";
import InfoTooltip from "@/components/InfoTooltip";

// Maps badge_code → admin.kashrut.badges.* key (note hyphen-to-underscore)
const BADGE_KEYS = {
  rabanut: "rabanut",
  badatz: "badatz",
  chalak: "chalak",
  mehadrin: "mehadrin",
  "organic-kosher": "organic_kosher",
  shmitta: "shmitta",
  kilayim: "kilayim",
  "artisan-dairy": "artisan_dairy",
};

function formatDate(iso, locale) {
  if (!iso) return "—";
  return formatEventDate(iso, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AdminKashrutPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rejectModal, setRejectModal] = useState(null); // request id
  const [rejectNotes, setRejectNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // MEH-1673: expiry reminders. `reminders` holds the LAST response — dry-run
  // or real — and `remindersSent` says which, so the panel can never show a
  // preview and a result in the same state.
  const [reminders, setReminders] = useState(null);
  const [remindersSent, setRemindersSent] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get("/admin/kashrut", { params: { status: statusFilter } })
      .then((r) => setRows(r.data))
      .catch(() => showToast.error(t("kashrut.load_error")))
      .finally(() => setLoading(false));
  }, [statusFilter, t]);

  useEffect(() => { load(); }, [load]);

  async function approve(id) {
    setBusy(true);
    try {
      await api.post(`/admin/kashrut/${id}/approve`);
      showToast.success(t("kashrut.approved_toast"));
      load();
    } catch (e) {
      showToast.error(detailToMessage(e.response?.data?.detail) || t("common.error_generic"));
    }
    setBusy(false);
  }

  async function reject(id) {
    setBusy(true);
    try {
      await api.post(`/admin/kashrut/${id}/reject`, { notes: rejectNotes });
      showToast.success(t("kashrut.rejected_toast"));
      setRejectModal(null);
      setRejectNotes("");
      load();
    } catch (e) {
      showToast.error(detailToMessage(e.response?.data?.detail) || t("common.error_generic"));
    }
    setBusy(false);
  }

  // MEH-1673: `send` false → dry-run preview; true → the real send. Both hit
  // the same endpoint; only the query flag differs, so the preview the admin
  // approves and the batch that goes out cannot drift apart.
  async function runReminders(send) {
    setRemindersBusy(true);
    try {
      const r = await api.post("/admin/kashrut/expiry-reminders", null, {
        params: { dry_run: !send },
      });
      setReminders(r.data);
      setRemindersSent(send);
      if (send) showToast.success(t("kashrut.reminders.sent_toast", { count: r.data.sent_count }));
    } catch (e) {
      showToast.error(detailToMessage(e.response?.data?.detail) || t("common.error_generic"));
    }
    setRemindersBusy(false);
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold font-headline-md text-text mb-1">
          {t("kashrut.title")}
          <InfoTooltip
            content={t("kashrut.tooltip")}
            label={t("kashrut.tooltip_label")}
            position="bottom"
          />
        </h1>
        <p className="text-sm text-fg-muted">
          {t("kashrut.subtitle")}
        </p>
        {/* MEH-1271: manual cross-check of the kashrut certificate against the
            official gov.il kashrut business portal (by business name / validity). */}
        <a
          href={KASHRUT_BUSINESS_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
        >
          <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
          {t("kashrut.portal_link")}
        </a>
      </div>
      {/* MEH-1673: expiry reminders. Dry-run first, always — the send button
          only appears once a preview exists, so nobody can fire the batch
          without having seen exactly who receives it. */}
      <div className="mb-6 rounded-[12px] border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-text">{t("kashrut.reminders.title")}</h2>
            <p className="text-xs text-fg-muted mt-0.5">{t("kashrut.reminders.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => runReminders(false)}
            disabled={remindersBusy}
            className="bg-white border border-border text-text text-sm px-4 py-2 rounded-full hover:border-primary hover:text-primary transition disabled:opacity-50"
          >
            {remindersBusy ? t("kashrut.reminders.loading") : t("kashrut.reminders.preview")}
          </button>
        </div>

        {reminders && (
          <div className="mt-4" data-testid="expiry-reminders-result">
            {reminders.total === 0 ? (
              <p className="text-sm text-fg-muted">{t("kashrut.reminders.none")}</p>
            ) : (
              <>
                <p className="text-sm text-text mb-2">
                  {remindersSent
                    ? t("kashrut.reminders.result_summary", {
                        sent: reminders.sent_count,
                        failed: reminders.failed_count,
                      })
                    : t("kashrut.reminders.preview_summary", { count: reminders.total })}
                </p>
                <ul className="divide-y divide-border border-y border-border text-sm">
                  {reminders.rows.map((row) => (
                    <li
                      key={row.producer_id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="font-medium">{row.name}</span>
                      <span className="text-fg-muted text-xs flex items-center gap-3">
                        <span dir="ltr">{row.phone_masked}</span>
                        <span>{formatDate(row.expires_at, locale)}</span>
                        {row.sent === true && (
                          <span className="text-primary">{t("kashrut.reminders.row_sent")}</span>
                        )}
                        {row.sent === false && (
                          <span className="text-red-600">
                            {row.error || t("kashrut.reminders.row_failed")}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {!remindersSent && (
                  <button
                    type="button"
                    onClick={() => runReminders(true)}
                    disabled={remindersBusy}
                    className="mt-3 bg-primary text-white text-sm px-4 py-2 rounded-full hover:bg-primary-dark transition disabled:opacity-50"
                  >
                    {t("kashrut.reminders.send_now")}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-[8px] px-3 py-2 text-sm"
        >
          <option value="pending">{t("kashrut.status.pending")}</option>
          <option value="approved">{t("kashrut.status.approved")}</option>
          <option value="rejected">{t("kashrut.status.rejected")}</option>
        </select>
      </div>

      {loading ? (
        <p className="text-fg-muted">{t("common.loading_f")}</p>
      ) : rows.length === 0 ? (
        <p className="text-fg-muted">{t("kashrut.no_requests")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-border">
          <table className="w-full text-sm">
            <thead className="bg-green-50">
              <tr>
                <th className="text-start px-4 py-3 font-semibold">{t("kashrut.columns.producer")}</th>
                <th className="text-start px-4 py-3 font-semibold">{t("kashrut.columns.badge")}</th>
                <th className="text-start px-4 py-3 font-semibold">{t("kashrut.columns.cert")}</th>
                <th className="text-start px-4 py-3 font-semibold">{t("kashrut.columns.date")}</th>
                <th className="text-start px-4 py-3 font-semibold">{t("kashrut.columns.notes")}</th>
                {statusFilter === "pending" && (
                  <th className="text-start px-4 py-3 font-semibold">{t("kashrut.columns.actions")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-green-50/50 transition">
                  <td className="px-4 py-3 font-medium">{row.producer_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 text-primary px-2 py-0.5 text-xs font-medium">
                      {BADGE_KEYS[row.badge_code] ? t(`kashrut.badges.${BADGE_KEYS[row.badge_code]}`) : row.badge_code}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.cert_url ? (
                      <a
                        href={row.cert_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-xs"
                      >
                        {t("kashrut.cert_view")}
                      </a>
                    ) : (
                      <span className="text-fg-muted text-xs">{t("kashrut.no_cert")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(row.created_at, locale)}</td>
                  <td className="px-4 py-3 text-fg-muted text-xs">{row.notes || "—"}</td>
                  {statusFilter === "pending" && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(row.id)}
                          disabled={busy}
                          className="bg-primary text-white text-xs px-3 py-1.5 rounded-full hover:bg-primary-dark transition disabled:opacity-50"
                        >
                          {t("kashrut.actions.approve")}
                        </button>
                        <button
                          onClick={() => { setRejectModal(row.id); setRejectNotes(""); }}
                          disabled={busy}
                          className="bg-white border border-red-300 text-red-600 text-xs px-3 py-1.5 rounded-full hover:bg-red-50 transition disabled:opacity-50"
                        >
                          {t("kashrut.actions.reject")}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] p-6 w-full max-w-md shadow-xl" dir="rtl">
            <h2 className="font-semibold text-lg mb-3">{t("kashrut.reject_modal.title")}</h2>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder={t("kashrut.reject_modal.placeholder")}
              className="w-full border rounded-[8px] p-3 text-sm resize-none h-24"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setRejectModal(null)}
                className="flex-1 border border-border rounded-full py-2 text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => reject(rejectModal)}
                disabled={busy}
                className="flex-1 bg-red-500 text-white rounded-full py-2 text-sm disabled:opacity-50"
              >
                {busy ? t("kashrut.reject_modal.submitting") : t("kashrut.reject_modal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
