"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { getWhatsAppHref } from "@/lib/utils";

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

export default function AdminOutreachPage() {
  const t = useTranslations("admin");
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    replied: 0,
    registered: 0,
    declined: 0,
  });
  const [cityFilter, setCityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [scriptOpen, setScriptOpen] = useState(false);
  const [waLeadId, setWaLeadId] = useState(null);

  const load = () => {
    setLoading(true);
    const params = {};
    if (cityFilter) params.city = cityFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    Promise.all([
      api.get("/admin/outreach", { params }).then((r) => r.data).catch(() => []),
      api.get("/admin/outreach/metrics/summary").then((r) => r.data).catch(() => null),
    ])
      .then(([rows, m]) => {
        setLeads(Array.isArray(rows) ? rows : []);
        if (m) setMetrics(m);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [cityFilter, statusFilter]);

  const handleStatusChange = async (id, status) => {
    await api
      .patch(`/admin/outreach/${id}`, { status })
      .then(() => {
        showToast(t("outreach.toasts.status_updated"));
        load();
      })
      .catch(() => showToast(t("outreach.toasts.status_failed"), "error"));
  };

  const handleMintToken = async (id) => {
    try {
      const r = await api.post(`/admin/outreach/${id}/prefill-token`);
      setLeads((prev) => prev.map((l) => (l.id === id ? r.data : l)));
      // Copy the link to clipboard immediately so the admin can paste
      // it into WhatsApp / the phone call.
      const url = `${window.location.origin}/register/producer?prefill=${r.data.prefill_token}`;
      await navigator.clipboard?.writeText?.(url).catch(() => {});
      showToast(t("outreach.toasts.link_copied"));
    } catch {
      showToast(t("outreach.toasts.prefill_failed"), "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("outreach.confirm_delete"))) return;
    try {
      await api.delete(`/admin/outreach/${id}`);
      showToast(t("outreach.toasts.lead_deleted"));
      load();
    } catch {
      showToast(t("outreach.toasts.delete_failed"), "error");
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
          <Phone size={16} weight="duotone" aria-hidden="true" />
          {t("outreach.call_script_btn")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label={t("outreach.metrics.total")} value={metrics.total} />
        <MetricCard label={t("outreach.metrics.new")} value={metrics.new} />
        <MetricCard label={t("outreach.metrics.contacted")} value={metrics.contacted} tone="accent" />
        <MetricCard label={t("outreach.metrics.replied")} value={metrics.replied} tone="primary" />
        <MetricCard label={t("outreach.metrics.registered")} value={metrics.registered} tone="success" />
      </div>

      {/* Filters + add */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          placeholder={t("outreach.filters.city_placeholder")}
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 bg-white"
        >
          <option value="all">{t("outreach.filters.all_statuses")}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {t(`outreach.status.${s}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm font-medium hover:bg-primary-dark transition"
        >
          {t("outreach.filters.new_lead")}
        </button>
      </div>

      {/* Leads table */}
      <div className="bg-white border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.name")}</th>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.city")}</th>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.category")}</th>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.phone")}</th>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.instagram")}</th>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.status")}</th>
                <th className="text-end px-3 py-3 font-medium text-muted">{t("outreach.columns.actions")}</th>
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
              {!loading && leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted">
                    {t("outreach.empty")}
                  </td>
                </tr>
              )}
              {!loading &&
                leads.map((lead) => (
                  <tr key={lead.id} className="border-t align-top">
                    <td className="px-3 py-3 font-medium">{lead.name}</td>
                    <td className="px-3 py-3 text-muted">{lead.city || "—"}</td>
                    <td className="px-3 py-3 text-muted">{lead.category || "—"}</td>
                    <td className="px-3 py-3 text-muted" dir="ltr">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                          {lead.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted" dir="ltr">
                      {lead.instagram ? (
                        <a
                          href={`https://instagram.com/${lead.instagram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          @{lead.instagram}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        className="text-xs border border-border rounded-lg px-2 py-1 bg-white"
                        data-testid={`status-select-${lead.id}`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {t(`outreach.status.${s}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
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
                        <button
                          type="button"
                          onClick={() => handleDelete(lead.id)}
                          className="text-xs px-2 py-1 rounded-lg text-red-600 hover:bg-red-50"
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

function MetricCard({ label, value, tone }) {
  const toneClass =
    {
      success: "text-[#22c55e]",
      primary: "text-primary",
      accent: "text-accent",
    }[tone] || "text-text";
  return (
    <div className="bg-white border border-border rounded-[12px] p-3 text-center">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs text-fg-muted mt-0.5">{label}</div>
    </div>
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
      showToast(t("outreach.toasts.lead_added"));
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
      className="fixed inset-0 bg-black/50 z-[9500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-[16px] p-6 max-w-md w-full space-y-3"
      >
        <h2 className="font-headline-md text-xl font-bold">{t("outreach.modal_add.title")}</h2>
        <input
          placeholder={t("outreach.modal_add.name_placeholder")}
          value={form.name}
          onChange={set("name")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder={t("outreach.modal_add.city_placeholder")}
            value={form.city}
            onChange={set("city")}
            className="border border-border rounded-[12px] px-3 py-2"
          />
          <input
            placeholder={t("outreach.modal_add.category_placeholder")}
            value={form.category}
            onChange={set("category")}
            className="border border-border rounded-[12px] px-3 py-2"
          />
        </div>
        <input
          placeholder={t("outreach.modal_add.phone_placeholder")}
          value={form.phone}
          onChange={set("phone")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          dir="ltr"
        />
        <input
          placeholder={t("outreach.modal_add.instagram_placeholder")}
          value={form.instagram}
          onChange={set("instagram")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          dir="ltr"
        />
        <input
          placeholder={t("outreach.modal_add.website_placeholder")}
          value={form.website}
          onChange={set("website")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          dir="ltr"
        />
        <textarea
          placeholder={t("outreach.modal_add.notes_placeholder")}
          value={form.notes}
          onChange={set("notes")}
          rows={2}
          className="w-full border border-border rounded-[12px] px-3 py-2"
        />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-border rounded-[12px] py-2 text-sm hover:bg-green-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-[12px] py-2 text-sm font-medium disabled:opacity-60"
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
      className="fixed inset-0 bg-black/50 z-[9500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[16px] p-6 max-w-lg w-full"
      >
        <h2 className="font-headline-md text-xl font-bold mb-3 inline-flex items-center gap-2">
          <Phone size={20} weight="duotone" className="text-primary" aria-hidden="true" />
          {t("outreach.modal_script.title")}
        </h2>
        <pre className="whitespace-pre-wrap text-sm text-text font-body leading-relaxed">
          {t("outreach.call_script")}
        </pre>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full bg-primary text-white rounded-[12px] py-2 text-sm font-medium"
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
    const phone = (fresh.phone || "").replace(/\D/g, "").replace(/^0/, "972");
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
      showToast(t("outreach.toasts.copied"));
    } catch {
      showToast(t("outreach.toasts.copy_failed"), "error");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[9500] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[16px] p-6 max-w-lg w-full space-y-4"
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
            className="border border-border rounded-[12px] p-3"
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
          className="w-full border border-border rounded-[12px] py-2 text-sm hover:bg-green-50"
        >
          {t("outreach.modal_wa.close")}
        </button>
      </div>
    </div>
  );
}
