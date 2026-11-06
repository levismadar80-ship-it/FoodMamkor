"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { detailToMessage } from "@/lib/errors";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";
import { instagramHandle, instagramUrl } from "@/lib/social-links";
import Input from "@/components/ui/Input";
import AdminLoadError from "@/components/admin/AdminLoadError";
import Pagination from "@/components/Pagination";

/**
 * /admin/outreach — manual lead pipeline (MEH-22).
 *
 * The flow:
 *   1. Admin adds leads manually (city + category + name + phone/instagram).
 *   2. Each lead advances through a status pipeline: new → contacted →
 *      replied → registered (or declined).
 *   3. "הכן פרופיל" mints a single-use prefill token that pre-populates
 *      the /register/producer form — prospect's only friction is a password.
 *   4. Three WhatsApp templates per spec: חמותה / מקצועי / קצר.
 *   5. Call-script modal shown before the admin picks up the phone.
 *   6. Top-of-page counters: פניתי / ענו / נרשמו.
 *
 * No Claude web search per plan Q1=b.
 *
 * i18n (MEH-475 PR-B): all strings via `useTranslations("admin")`.
 * Status labels resolved per render via t(`outreach.status.${id}`).
 * WA template titles/bodies resolved per render via
 * t(`outreach.wa_templates.${key}_title`) and
 * t.raw(`outreach.wa_templates.${key}_body`) — raw is required to keep
 * literal {name}/{prefillUrl} placeholders for client-side replaceAll.
 */

const STATUS_ORDER = ["new", "contacted", "replied", "registered", "declined"];

// MEH-475: template metadata only — titles/bodies resolved at render
// via next-intl. Bodies use t.raw() so {name} and {prefillUrl}
// placeholders survive verbatim for client-side replaceAll.
const WA_TEMPLATE_KEYS = [{ key: "warm" }, { key: "professional" }, { key: "short" }];

// MEH-2566: staging carried 323 leads in one render (82,000px on a phone).
// The list is paged client-side — the endpoint already returns the filtered
// set, newest first, so a slice keeps order and filters exact.
const PAGE_SIZE = 25;


export default function AdminOutreachPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    replied: 0,
    registered: 0,
    declined: 0,
    // MEH-2633: counts by SOURCE, not status — see metrics_summary's comment.
    community: 0,
  });
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // MEH-2633: null = every source. Only "community" is offered — "manual" is
  // "everything else" to an admin, and a chip for it would just be the
  // complement of this one.
  const [sourceFilter, setSourceFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [waLeadId, setWaLeadId] = useState(null);
  // MEH-2096: both branches of the Promise.all swallowed their failure — the
  // leads list fell back to [] ("no leads") and the metrics summary to null,
  // which silently KEPT THE PREVIOUS numbers on screen. Two different lies.
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoading(true);
    const params = {};
    if (cityFilter) params.city = cityFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    if (sourceFilter) params.source = sourceFilter;
    setLoadError(false);
    Promise.all([
      api.get("/admin/outreach", { params }).then((r) => r.data),
      api.get("/admin/outreach/metrics/summary").then((r) => r.data),
    ])
      .then(([rows, m]) => {
        setLeads(Array.isArray(rows) ? rows : []);
        if (m) setMetrics(m);
        setLoadError(false);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [cityFilter, statusFilter, sourceFilter]);
  // A new filter starts from page 1; a shrinking list (status change, delete)
  // never strands the view past its last page.
  useEffect(() => setPage(1), [cityFilter, statusFilter, sourceFilter]);
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLeads = leads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // MEH-2633. Deliberately no success toast: `load()` refreshes and the row
  // then shows the thanked date, which is the feedback. A failure surfaces the
  // backend's own Hebrew `detail` (the four 409 rules each have their own
  // sentence in admin_outreach.thank_suggester), so this adds no frontend copy
  // and cannot drift from what the server actually enforced.
  const handleThankSuggester = async (id) => {
    try {
      await api.post(`/admin/outreach/${id}/thank-suggester`);
      load();
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail));
    }
  };

  const handleStatusChange = async (id, status) => {
    await api
      .patch(`/admin/outreach/${id}`, { status })
      .then(() => {
        showToast.success(t("outreach.toasts.status_updated"));
        load();
      })
      .catch(() => showToast.error(t("outreach.toasts.status_failed")));
  };

  const handleMintToken = async (id) => {
    try {
      const r = await api.post(`/admin/outreach/${id}/prefill-token`);
      setLeads((prev) => prev.map((l) => (l.id === id ? r.data : l)));
      // Copy the link to clipboard immediately so the admin can paste
      // it into WhatsApp / the phone call.
      const url = `${window.location.origin}/register/producer?prefill=${r.data.prefill_token}`;
      await navigator.clipboard?.writeText?.(url).catch(() => {});
      showToast.success(t("outreach.toasts.link_copied"));
    } catch {
      showToast.error(t("outreach.toasts.prefill_failed"));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("outreach.confirm_delete"))) return;
    try {
      await api.delete(`/admin/outreach/${id}`);
      showToast.success(t("outreach.toasts.lead_deleted"));
      load();
    } catch {
      showToast.error(t("outreach.toasts.delete_failed"));
    }
  };

  const activeWaLead = useMemo(
    () => leads.find((l) => l.id === waLeadId) || null,
    [waLeadId, leads],
  );

  return (
    <div className="space-y-6">
      {/* Header + aggregate metrics */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t("outreach.title")}</h1>
        <button
          type="button"
          onClick={() => setScriptOpen(true)}
          className="text-sm text-primary hover:underline inline-flex items-center gap-1.5"
        >
          <Phone size={16} aria-hidden="true" />
          {t("outreach.call_script_btn")}
        </button>
      </div>

      {/* MEH-2566: the five counters ARE the status filter — one chip row in
          brand colours instead of a counter grid plus a separate <select>.
          «סה"כ» clears the filter; declined («סירבה») gets a chip too, so every
          status stays reachable. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("outreach.columns.status")} data-testid="outreach-status-chips">
        {[["all", t("outreach.metrics.total"), metrics.total], ...STATUS_ORDER.map((s) => [
          s,
          s === "declined" ? t(`outreach.status.${s}`) : t(`outreach.metrics.${s}`),
          metrics[s],
        ])].map(([id, label, count]) => (
          <StatusChip
            key={id}
            id={id}
            label={label}
            count={count}
            active={statusFilter === id}
            onClick={() => setStatusFilter(id)}
          />
        ))}
      </div>

      {/* MEH-2633: source is a SECOND axis, so it gets its own group rather
          than joining the status row above — one aria-label cannot describe
          both, and a chip that silently ANDs with a status chip is clearer
          when it is visibly separate. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("outreach.badge_community")} data-testid="outreach-source-chips">
        <StatusChip
          id="community"
          label={t("outreach.badge_community")}
          count={metrics.community}
          active={sourceFilter === "community"}
          onClick={() => setSourceFilter(sourceFilter === "community" ? null : "community")}
        />
      </div>

      {/* Filters + add */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          placeholder={t("outreach.filters.city_placeholder")}
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="flex-1 border border-border rounded-md px-3 py-2"
        />
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          data-testid="outreach-new-lead"
          className="bg-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-dark transition"
        >
          {t("outreach.filters.new_lead")}
        </button>
      </div>

      {/* Leads table */}
      <div className="bg-white border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          {/* MEH-2426: one card per row below md (globals.css .table-stack). */}
          <table className="table-stack w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.name")}</th>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.city")}</th>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.category")}</th>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.phone")}</th>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.instagram")}</th>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.status")}</th>
                <th className="text-start px-3 py-3 font-medium text-muted">{t("outreach.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted">
                    {t("outreach.loading_leads")}
                  </td>
                </tr>
              )}
              {!loading && loadError && (
                <tr>
                  <td colSpan={7} className="py-6">
                    <AdminLoadError onRetry={load} testId="admin-outreach-load-error" />
                  </td>
                </tr>
              )}
              {!loading && !loadError && leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted">
                    {t("outreach.empty")}
                  </td>
                </tr>
              )}
              {!loading &&
                pageLeads.map((lead) => (
                  <tr key={lead.id} className="border-t align-top">
                    <td className="px-3 py-3 font-medium">
                      {lead.name}
                      {lead.source === "community" && (
                        <span
                          className="ms-2 align-middle inline-block text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-primary border border-border"
                          data-testid={`community-badge-${lead.id}`}
                        >
                          {t("outreach.badge_community")}
                        </span>
                      )}
                      {lead.suggestion_reason && (
                        <p className="mt-1 text-xs text-muted font-normal whitespace-pre-line">
                          {lead.suggestion_reason}
                        </p>
                      )}
                      {(lead.suggested_by_name || lead.suggested_by_email) && (
                        <p className="mt-1 text-xs text-muted font-normal">
                          {lead.suggested_by_name || "—"}
                          {lead.suggested_by_email && (
                            <a
                              dir="ltr"
                              href={`mailto:${lead.suggested_by_email}`}
                              className="ms-2 text-primary hover:underline"
                            >
                              {lead.suggested_by_email}
                            </a>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted" data-label={t("outreach.columns.city")}>{lead.city || "—"}</td>
                    <td className="px-3 py-3 text-muted" data-label={t("outreach.columns.category")}>{lead.category || "—"}</td>
                    {/* MEH-2426: dir="ltr" moved from the <td> to the value, so
                        the stacked-card label keeps the RTL start side. */}
                    <td className="px-3 py-3 text-muted" data-label={t("outreach.columns.phone")}>
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} dir="ltr" className="text-primary hover:underline">
                          {lead.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted" data-label={t("outreach.columns.instagram")}>
                      {instagramHandle(lead.instagram) ? (
                        <a
                          dir="ltr"
                          href={instagramUrl(lead.instagram)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          @{instagramHandle(lead.instagram)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3" data-label={t("outreach.columns.status")}>
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className="text-xs border border-border rounded-lg px-2 py-1 bg-white"
                        aria-label={t("outreach.columns.status")}
                        data-testid={`status-select-${lead.id}`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {t(`outreach.status.${s}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3" data-cell="actions">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleMintToken(lead.id)}
                          className="text-xs px-2 py-1 rounded-lg bg-primary text-white hover:bg-primary-dark"
                          title={t("outreach.actions.prefill_title")}
                        >
                          {t("outreach.actions.prefill")}
                        </button>
                        {lead.phone && (
                          <button
                            type="button"
                            onClick={() => setWaLeadId(lead.id)}
                            className="text-xs px-2 py-1 rounded-lg border border-border text-primary hover:bg-green-50"
                          >
                            {t("outreach.actions.whatsapp")}
                          </button>
                        )}
                        {/* MEH-2633 (Sapir 04/11): the control is shown for
                            every suggestion-sourced lead, disabled with the
                            reason rather than hidden — a missing button tells
                            an admin nothing. */}
                        {isSuggestion(lead) && (
                          <ThankSuggesterCell
                            lead={lead}
                            locale={locale}
                            t={t}
                            onThank={handleThankSuggester}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(lead.id)}
                          className="text-xs px-2 py-1 rounded-lg text-danger-600 hover:bg-danger-50"
                        >
                          {t("outreach.actions.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && !loadError && totalPages > 1 && (
        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={(n) => {
            setPage(n);
            window.scrollTo({ top: 0 });
          }}
        />
      )}

      {addOpen && (
        <AddLeadModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            load();
          }}
        />
      )}
      {scriptOpen && <ScriptModal onClose={() => setScriptOpen(false)} />}
      {activeWaLead && (
        <WhatsAppModal
          lead={activeWaLead}
          onClose={() => setWaLeadId(null)}
          onPrefillMinted={(updated) =>
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
          }
        />
      )}
    </div>
  );
}

/**
 * MEH-2633: which of the four thank-suggester rules blocks the action, or null
 * when it is available.
 *
 * The ORDER is not cosmetic — it is the same order
 * admin_outreach.thank_suggester raises its four 409s (no email -> no opt-in ->
 * already thanked -> not registered). A lead can fail more than one rule at
 * once, so a different order here would show a tooltip naming a reason the
 * server would not have given. Change one side and you must change the other.
 */
function thankBlockedReason(lead) {
  if (!lead.suggested_by_email) return "no_email";
  if (!lead.suggester_wants_update) return "no_update_request";
  if (lead.suggester_thanked_at) return "already_sent";
  if (lead.status !== "registered") return "not_registered";
  return null;
}

/** A lead the thank control is meaningful for: it came from a suggestion. */
function isSuggestion(lead) {
  return Boolean(
    lead.source === "community" || lead.suggested_by_email || lead.suggested_by_name
  );
}

/**
 * MEH-2633 thank control. Enabled only when every rule passes; otherwise
 * disabled WITH the reason, per Sapir's 04/11 ruling.
 *
 * The tooltip rides a wrapping <span>, not the button: `title` on a disabled
 * button is unreliable (Safari suppresses its pointer events). The same text
 * is also in an sr-only span the button points at with aria-describedby, so a
 * screen-reader user gets the reason a sighted user gets from the hover — a
 * title attribute alone reaches neither keyboard nor AT users.
 */
function ThankSuggesterCell({ lead, locale, t, onThank }) {
  const thankedDate = lead.suggester_thanked_at
    ? new Date(lead.suggester_thanked_at).toLocaleDateString(locale)
    : null;
  const reason = thankBlockedReason(lead);

  if (!reason) {
    return (
      <button
        type="button"
        onClick={() => onThank(lead.id)}
        data-testid={`thank-suggester-${lead.id}`}
        className="text-xs px-2 py-1 rounded-lg border border-border text-primary hover:bg-green-50"
      >
        {t("outreach.thank_suggester")}
      </button>
    );
  }

  const tip = t(`outreach.thank_disabled.${reason}`, { date: thankedDate ?? "" });
  const tipId = `thank-reason-${lead.id}`;
  return (
    <span className="inline-flex items-center gap-1.5" title={tip}>
      <button
        type="button"
        disabled
        aria-describedby={tipId}
        data-testid={`thank-suggester-${lead.id}`}
        className="text-xs px-2 py-1 rounded-lg border border-border text-primary disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("outreach.thank_suggester")}
      </button>
      <span id={tipId} className="sr-only" data-testid={`thank-reason-${lead.id}`}>
        {tip}
      </span>
      {thankedDate && (
        <span className="text-xs text-muted" data-testid={`thanked-at-${lead.id}`}>
          {thankedDate}
        </span>
      )}
    </span>
  );
}

function StatusChip({ id, label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={`outreach-chip-${id}`}
      className={`inline-flex items-center gap-2 min-h-touch px-4 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        active
          ? "bg-primary text-white border-primary"
          : "bg-white text-text border-border hover:border-primary/40"
      }`}
    >
      {label}
      <span className={`numeric text-xs font-bold ${active ? "text-white/85" : "text-fg-muted"}`}>
        {count ?? 0}
      </span>
    </button>
  );
}

function AddLeadModal({ onClose, onCreated }) {
  const t = useTranslations("admin");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    instagram: "",
    website: "",
    city: "",
    category: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t("outreach.modal_add.name_required"));
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/outreach", form);
      showToast.success(t("outreach.toasts.lead_added"));
      onCreated();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === "duplicate_lead") {
        setError(detail.message || t("outreach.toasts.duplicate"));
      } else {
        setError(typeof detail === "string" ? detail : t("outreach.toasts.generic_error"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[9500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-lg p-6 max-w-md w-full space-y-3"
      >
        <h2 className="font-headline-md text-xl font-bold">{t("outreach.modal_add.title")}</h2>
        {/* MEH-1128 Wave C: label-less ui/Input — placeholder-only parity
            with the old inputs (no labels invented; notes textarea stays). */}
        <Input
          placeholder={t("outreach.modal_add.name_placeholder")}
          value={form.name}
          onChange={set("name")}
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder={t("outreach.modal_add.city_placeholder")}
            value={form.city}
            onChange={set("city")}
          />
          <Input
            placeholder={t("outreach.modal_add.category_placeholder")}
            value={form.category}
            onChange={set("category")}
          />
        </div>
        <Input
          placeholder={t("outreach.modal_add.phone_placeholder")}
          value={form.phone}
          onChange={set("phone")}
          dir="ltr"
        />
        <Input
          placeholder={t("outreach.modal_add.instagram_placeholder")}
          value={form.instagram}
          onChange={set("instagram")}
          dir="ltr"
        />
        <Input
          placeholder={t("outreach.modal_add.website_placeholder")}
          value={form.website}
          onChange={set("website")}
          dir="ltr"
        />
        <textarea
          placeholder={t("outreach.modal_add.notes_placeholder")}
          value={form.notes}
          onChange={set("notes")}
          rows={2}
          className="w-full border border-border rounded-md px-3 py-2"
        />
        {error && <p className="text-sm text-danger-600" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-border rounded-md py-2 text-sm hover:bg-green-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-md py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving ? t("outreach.modal_add.submit_saving") : t("outreach.modal_add.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ScriptModal({ onClose }) {
  const t = useTranslations("admin");
  return (
    <div
      className="fixed inset-0 bg-black/40 z-[9500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg p-6 max-w-lg w-full"
      >
        <h2 className="font-headline-md text-xl font-bold mb-3 inline-flex items-center gap-2">
          <Phone size={20} className="text-primary" aria-hidden="true" />
          {t("outreach.modal_script.title")}
        </h2>
        <pre className="whitespace-pre-wrap text-sm text-text font-body-md leading-relaxed">
          {t("outreach.call_script")}
        </pre>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full bg-primary text-white rounded-md py-2 text-sm font-medium"
        >
          {t("outreach.modal_script.close")}
        </button>
      </div>
    </div>
  );
}

function WhatsAppModal({ lead, onClose, onPrefillMinted }) {
  const t = useTranslations("admin");
  const [tokenBusy, setTokenBusy] = useState(false);

  const ensureToken = async () => {
    if (lead.prefill_token) return lead;
    setTokenBusy(true);
    try {
      const r = await api.post(`/admin/outreach/${lead.id}/prefill-token`);
      onPrefillMinted(r.data);
      return r.data;
    } finally {
      setTokenBusy(false);
    }
  };

  const openTemplate = async (tpl) => {
    const fresh = await ensureToken();
    const url = `${window.location.origin}/register/producer?prefill=${fresh.prefill_token}`;
    // MEH-475: t.raw() keeps literal {name}/{prefillUrl} for replaceAll.
    const body = t.raw(`outreach.wa_templates.${tpl.key}_body`)
      .replaceAll("{name}", fresh.name)
      .replaceAll("{prefillUrl}", url);
    const phone = normalizePhone(fresh.phone);
    window.open(getWhatsAppHref(phone, body), "_blank", "noopener,noreferrer");
    onClose();
  };

  const copyTemplate = async (tpl) => {
    const fresh = await ensureToken();
    const url = `${window.location.origin}/register/producer?prefill=${fresh.prefill_token}`;
    // MEH-475: t.raw() keeps literal {name}/{prefillUrl} for replaceAll.
    const body = t.raw(`outreach.wa_templates.${tpl.key}_body`)
      .replaceAll("{name}", fresh.name)
      .replaceAll("{prefillUrl}", url);
    try {
      await navigator.clipboard.writeText(body);
      showToast.success(t("outreach.toasts.copied"));
    } catch {
      showToast.error(t("outreach.toasts.copy_failed"));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[9500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg p-6 max-w-lg w-full space-y-4"
      >
        <h2 className="font-headline-md text-xl font-bold">
          {t("outreach.modal_wa.title", { name: lead.name })}
        </h2>
        {tokenBusy && (
          <p className="text-sm text-fg-muted">{t("outreach.modal_wa.preparing")}</p>
        )}
        {WA_TEMPLATE_KEYS.map((tpl) => (
          <div
            key={tpl.key}
            className="border border-border rounded-md p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold">{t(`outreach.wa_templates.${tpl.key}_title`)}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyTemplate(tpl)}
                  className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-green-50"
                >
                  {t("outreach.modal_wa.copy")}
                </button>
                <button
                  type="button"
                  onClick={() => openTemplate(tpl)}
                  className="btn-whatsapp text-xs px-2 py-1 rounded-lg"
                >
                  {t("outreach.modal_wa.open")}
                </button>
              </div>
            </div>
            <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
              {t.raw(`outreach.wa_templates.${tpl.key}_body`)}
            </p>
          </div>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="w-full border border-border rounded-md py-2 text-sm hover:bg-green-50"
        >
          {t("outreach.modal_wa.close")}
        </button>
      </div>
    </div>
  );
}
