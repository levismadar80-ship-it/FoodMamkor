"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone } from "@phosphor-icons/react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

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
 */

const STATUS_LABEL = {
  new: "חדש",
  contacted: "פניתי",
  replied: "ענו",
  registered: "נרשמה",
  declined: "סירבה",
};

const STATUS_ORDER = ["new", "contacted", "replied", "registered", "declined"];

// Spec asks for three WhatsApp templates. Each one has a title +
// template body. Placeholders: {name}, {prefillUrl}. We do the
// substitution client-side via replaceAll.
const WA_TEMPLATES = [
  {
    key: "warm",
    title: "חמותה",
    body:
      "היי {name} 🌿\n" +
      "ראיתי אותך ואני ממש אוהבת מה שאת עושה. אני מהמקור — אתר שמחבר בין בעלות עסק קטנות לצרכניות שמחפשות אוכל אמיתי ומקומי.\n" +
      "מוזמנת להצטרף אלינו בחינם — פשוט ללחוץ על הלינק והפרטים מחכים לך:\n{prefillUrl}",
  },
  {
    key: "professional",
    title: "מקצועי",
    body:
      "שלום {name}, אני יוצרת קשר מטעם מהמקור — פלטפורמת דירקטורי לבתי עסק מקומיים שמחפשים לקוחות קבועים.\n" +
      "הכנו לך פרופיל מלא, נותר רק לאשר סיסמה:\n{prefillUrl}\n" +
      "הרשמה חינמית, ללא התחייבות.",
  },
  {
    key: "short",
    title: "קצר",
    body: "{name}, מצרפים אותך למהמקור 💚\n{prefillUrl}",
  },
];

const CALL_SCRIPT = `1. פתיחה חמה: "היי, אני מדברת ממהמקור, זה שם טוב?"
2. הסבר קצר: "אתר ישראלי שמחבר בתי עסק מקומיים עם קונות שמחפשות אוכל איכותי."
3. הצעת ערך: "נרשמות בחינם, הפרופיל שלך יתפרסם, ואת מקבלת פניות ישירות מלקוחות דרך WhatsApp."
4. שאלה פתוחה: "איך נשמע?"
5. אם מתעניינת: "מעולה! אני שולחת לך קישור מוכן עם כל הפרטים שלך — פשוט מאשרת סיסמה."
6. אם מסרבת: "אין בעיה, תודה על הזמן. אם תשני את דעתך, הכתובת שלנו mehamakor.online."
7. בסוף: "יום מצוין, אצלך."`;

export default function AdminOutreachPage() {
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
        showToast("הסטטוס עודכן");
        load();
      })
      .catch(() => showToast("לא הצלחנו לעדכן — נסי שוב", "error"));
  };

  const handleMintToken = async (id) => {
    try {
      const r = await api.post(`/admin/outreach/${id}/prefill-token`);
      setLeads((prev) => prev.map((l) => (l.id === id ? r.data : l)));
      // Copy the link to clipboard immediately so the admin can paste
      // it into WhatsApp / the phone call.
      const url = `${window.location.origin}/register/producer?prefill=${r.data.prefill_token}`;
      await navigator.clipboard?.writeText?.(url).catch(() => {});
      showToast("הלינק הועתק ללוח");
    } catch {
      showToast("לא הצלחנו להכין לינק — נסי שוב", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("למחוק את הליד הזה לצמיתות?")) return;
    try {
      await api.delete(`/admin/outreach/${id}`);
      showToast("הליד נמחק");
      load();
    } catch {
      showToast("לא הצלחנו למחוק — נסי שוב", "error");
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
        <h1 className="text-2xl font-bold">גיוס עסקים</h1>
        <button
          type="button"
          onClick={() => setScriptOpen(true)}
          className="text-sm text-primary hover:underline inline-flex items-center gap-1.5"
        >
          <Phone size={16} weight="duotone" aria-hidden="true" />
          תסריט שיחה
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="סה״כ" value={metrics.total} />
        <MetricCard label="חדשים" value={metrics.new} />
        <MetricCard label="פניתי" value={metrics.contacted} tone="accent" />
        <MetricCard label="ענו" value={metrics.replied} tone="primary" />
        <MetricCard label="נרשמו" value={metrics.registered} tone="success" />
      </div>

      {/* Filters + add */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          placeholder="סננית לפי עיר..."
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="flex-1 border border-border rounded-[12px] px-3 py-2"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-[12px] px-3 py-2 bg-white"
        >
          <option value="all">כל הסטטוסים</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm font-medium hover:bg-primary-light transition"
        >
          + ליד חדש
        </button>
      </div>

      {/* Leads table */}
      <div className="bg-white border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">שם</th>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">עיר</th>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">קטגוריה</th>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">טלפון</th>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">אינסטגרם</th>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">סטטוס</th>
                <th className="text-end px-3 py-3 font-medium text-text-secondary">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-secondary">
                    טוענת לידים...
                  </td>
                </tr>
              )}
              {!loading && leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-text-secondary">
                    אין לידים להצגה. לחצי על &quot;+ ליד חדש&quot; כדי להתחיל.
                  </td>
                </tr>
              )}
              {!loading &&
                leads.map((lead) => (
                  <tr key={lead.id} className="border-t align-top">
                    <td className="px-3 py-3 font-medium">{lead.name}</td>
                    <td className="px-3 py-3 text-text-secondary">{lead.city || "—"}</td>
                    <td className="px-3 py-3 text-text-secondary">{lead.category || "—"}</td>
                    <td className="px-3 py-3 text-text-secondary" dir="ltr">
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                          {lead.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-text-secondary" dir="ltr">
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
                        className="text-xs border border-border rounded px-2 py-1 bg-white"
                        data-testid={`status-select-${lead.id}`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleMintToken(lead.id)}
                          className="text-xs px-2 py-1 rounded bg-primary text-white hover:bg-primary-light"
                          title="מכין פרופיל ומעתיק לינק"
                        >
                          הכן פרופיל
                        </button>
                        {lead.phone && (
                          <button
                            type="button"
                            onClick={() => setWaLeadId(lead.id)}
                            className="text-xs px-2 py-1 rounded border border-border text-primary hover:bg-light"
                          >
                            WhatsApp
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(lead.id)}
                          className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50"
                        >
                          מחקי
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
      {scriptOpen && (
        <ScriptModal onClose={() => setScriptOpen(false)} script={CALL_SCRIPT} />
      )}
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
    }[tone] || "text-site-text";
  return (
    <div className="bg-white border border-border rounded-[12px] p-3 text-center">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs text-site-muted mt-0.5">{label}</div>
    </div>
  );
}

function AddLeadModal({ onClose, onCreated }) {
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
      setError("שם הוא שדה חובה");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/outreach", form);
      showToast("ליד נוסף");
      onCreated();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === "duplicate_lead") {
        setError(detail.message || "ליד דומה כבר קיים");
      } else {
        setError(typeof detail === "string" ? detail : "משהו השתבש");
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
        <h2 className="font-headline text-xl font-bold">ליד חדש</h2>
        <input
          placeholder="שם העסק *"
          value={form.name}
          onChange={set("name")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          required
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="עיר"
            value={form.city}
            onChange={set("city")}
            className="border border-border rounded-[12px] px-3 py-2"
          />
          <input
            placeholder="קטגוריה"
            value={form.category}
            onChange={set("category")}
            className="border border-border rounded-[12px] px-3 py-2"
          />
        </div>
        <input
          placeholder="טלפון"
          value={form.phone}
          onChange={set("phone")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          dir="ltr"
        />
        <input
          placeholder="אינסטגרם (שם משתמשת, בלי @)"
          value={form.instagram}
          onChange={set("instagram")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          dir="ltr"
        />
        <input
          placeholder="אתר (אופציונלי)"
          value={form.website}
          onChange={set("website")}
          className="w-full border border-border rounded-[12px] px-3 py-2"
          dir="ltr"
        />
        <textarea
          placeholder="הערות פנימיות"
          value={form.notes}
          onChange={set("notes")}
          rows={2}
          className="w-full border border-border rounded-[12px] px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-border rounded-[12px] py-2 text-sm hover:bg-light"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-[12px] py-2 text-sm font-medium disabled:opacity-60"
          >
            {saving ? "שומרת..." : "הוסיפי"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ScriptModal({ onClose, script }) {
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
        <h2 className="font-headline text-xl font-bold mb-3 inline-flex items-center gap-2">
          <Phone size={20} weight="duotone" className="text-primary" aria-hidden="true" />
          תסריט שיחה
        </h2>
        <pre className="whitespace-pre-wrap text-sm text-site-text font-body leading-relaxed">
          {script}
        </pre>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full bg-primary text-white rounded-[12px] py-2 text-sm font-medium"
        >
          סגור
        </button>
      </div>
    </div>
  );
}

function WhatsAppModal({ lead, onClose, onPrefillMinted }) {
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
    const body = tpl.body
      .replaceAll("{name}", fresh.name)
      .replaceAll("{prefillUrl}", url);
    const phone = (fresh.phone || "").replace(/\D/g, "").replace(/^0/, "972");
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(body)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
    onClose();
  };

  const copyTemplate = async (tpl) => {
    const fresh = await ensureToken();
    const url = `${window.location.origin}/register/producer?prefill=${fresh.prefill_token}`;
    const body = tpl.body
      .replaceAll("{name}", fresh.name)
      .replaceAll("{prefillUrl}", url);
    try {
      await navigator.clipboard.writeText(body);
      showToast("הטקסט הועתק");
    } catch {
      showToast("לא הצלחנו להעתיק — העתיקי ידנית", "error");
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
        <h2 className="font-headline text-xl font-bold">
          הודעת WhatsApp אל {lead.name}
        </h2>
        {tokenBusy && (
          <p className="text-sm text-site-muted">מכינה לינק פרופיל...</p>
        )}
        {WA_TEMPLATES.map((tpl) => (
          <div
            key={tpl.key}
            className="border border-border rounded-[12px] p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold">{tpl.title}</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyTemplate(tpl)}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-light"
                >
                  העתק
                </button>
                <button
                  type="button"
                  onClick={() => openTemplate(tpl)}
                  className="btn-whatsapp text-xs px-2 py-1 rounded"
                >
                  פתח ב-WhatsApp
                </button>
              </div>
            </div>
            <p className="text-sm text-site-text whitespace-pre-wrap leading-relaxed">
              {tpl.body}
            </p>
          </div>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="w-full border border-border rounded-[12px] py-2 text-sm hover:bg-light"
        >
          סגור
        </button>
      </div>
    </div>
  );
}
