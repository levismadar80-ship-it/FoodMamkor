"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import CitySearch from "@/components/CitySearch";

/**
 * Create-form for "מהמטבח של השכן" with AI moderation feedback.
 *
 * Per MODERATION.md:
 *   - Debounced /home-products/validate call as user types (1.5s)
 *   - FLAGGED: yellow warning + suggestion, still lets them submit
 *   - REJECTED: red block + disables the submit button
 *   - Server-side REJECTED mirrored into the UI
 *
 * Per FIXES_V2.md fix 2, the form has the full expanded field set:
 * location + product info + prep/expiry dates + allergens + kosher +
 * organic + quantity/price/unit + up to 4 images + delivery method.
 */

const CATEGORIES = [
  "בשר ועוף",
  "דגים",
  "ירקות ופירות",
  "חלב וגבינות",
  "לחמים ואפייה",
  "שמנים ודבש",
  "מותססים",
  "טיפוח",
  "אחר",
];

const STORAGE_TYPES = ["מקרר", "מקפיא", "טמפרטורת חדר"];
const KOSHER_OPTIONS = ["כשר", "לא כשר", "לא ידוע"];
const UNITS = ["ק״ג", "יח׳", "ליטר", "מנות", "צנצנת"];
const DELIVERY_METHODS = [
  { value: "pickup", label: "איסוף עצמי" },
  { value: "delivery", label: "משלוח" },
  { value: "both", label: "שניהם" },
];

const MAX_IMAGES = 4;

function field(id, label, required) {
  return { id, label, required };
}

export default function HomeProductForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    prep_date: "",
    expiry_date: "",
    storage_type: "",
    allergens: "",
    kosher: "",
    is_organic: false,
    quantity: "",
    unit: "",
    price: "",
    neighborhood: "",
    city: "",
    street: "",      // FIXES_V2.md fix 7c — private, not shown publicly
    zip_code: "",    // FIXES_V2.md fix 7c
    location_notes: "",
    phone: "",
    delivery_method: "",
  });
  const [images, setImages] = useState([]); // list of Cloudinary URLs
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [moderation, setModeration] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Debounced validator
  const timerRef = useRef(null);
  const seqRef = useRef(0);

  const runValidation = useCallback((title, description, category, price) => {
    if (!title || title.trim().length < 5) {
      setModeration(null);
      return;
    }
    const mySeq = ++seqRef.current;
    setChecking(true);
    api
      .post("/home-products/validate", {
        title: title.trim(),
        description: description?.trim() || null,
        category: category || null,
        price: price ? Number(price) : null,
      })
      .then((r) => {
        if (mySeq !== seqRef.current) return;
        setModeration(r.data);
      })
      .catch(() => {
        if (mySeq !== seqRef.current) return;
        setModeration(null);
      })
      .finally(() => {
        if (mySeq !== seqRef.current) return;
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      runValidation(form.title, form.description, form.category, form.price);
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form.title, form.description, form.category, form.price, runValidation]);

  const update = (fieldName) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm({ ...form, [fieldName]: val });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= MAX_IMAGES) {
      showToast(`אפשר להעלות עד ${MAX_IMAGES} תמונות`, "error");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/upload/image", formData);
      setImages([...images, res.data.url]);
    } catch (err) {
      showToast(err.response?.data?.detail || "שגיאה בהעלאת תמונה", "error");
    }
    setUploading(false);
    e.target.value = "";
  };

  const removeImage = (idx) => setImages(images.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (moderation?.status === "REJECTED") return;
    if (images.length === 0) {
      setSubmitError("צריך להעלות לפחות תמונה אחת");
      return;
    }
    if (!form.prep_date || !form.expiry_date) {
      setSubmitError("תאריך הכנה ותאריך תפוגה הם שדות חובה");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        photo: images[0],
        images,
        category: form.category || null,
        prep_date: form.prep_date || null,
        expiry_date: form.expiry_date || null,
        storage_type: form.storage_type || null,
        allergens: form.allergens || null,
        kosher: form.kosher || null,
        is_organic: !!form.is_organic,
        quantity: form.quantity,
        unit: form.unit || null,
        price: form.price ? Number(form.price) : null,
        neighborhood: form.neighborhood,
        city: form.city,
        street: form.street || null,
        zip_code: form.zip_code || null,
        location_notes: form.location_notes || null,
        phone: form.phone,
        delivery_method: form.delivery_method || null,
      };
      const r = await api.post("/home-products", payload);
      if (r.data.moderation_status === "FLAGGED") {
        showToast("המוצר פורסם עם תגית 'בבדיקה' 🔍");
      } else {
        showToast("המוצר פורסם! 🌿");
      }
      onCreated?.(r.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail?.error === "listing_rejected") {
        setSubmitError(detail.reason || "התוכן אינו עומד בקריטריונים שלנו");
        setModeration({ status: "REJECTED", reason: detail.reason, suggestion: detail.suggestion });
      } else {
        setSubmitError("משהו השתבש, נסי שוב");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const rejected = moderation?.status === "REJECTED";
  const flagged = moderation?.status === "FLAGGED";

  const baseInput =
    "w-full border border-border rounded-[8px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none";

  return (
    <div className="bg-white rounded-[16px] p-6 mb-6 border border-border">
      <h3 className="font-headline text-2xl font-bold mb-1 text-site-text">פרסום מוצר ביתי</h3>
      <p className="text-site-muted text-sm mb-6">
        מלאי את כל השדות החובה. הקונים רואים את כל המידע ומחליטים על סמך זה.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ==================== Section 1: Product ==================== */}
        <fieldset className="space-y-3">
          <legend className="font-headline text-lg font-bold text-site-text mb-2">פרטי המוצר</legend>
          <div>
            <label htmlFor="hpf-title" className="block text-sm text-site-text mb-1">
              שם המוצר <span className="text-red-500">*</span>
            </label>
            <input id="hpf-title" required value={form.title} onChange={update("title")} className={baseInput} placeholder="לחם מחמצת טרי" />
          </div>
          <div>
            <label htmlFor="hpf-description" className="block text-sm text-site-text mb-1">
              תיאור <span className="text-red-500">*</span>
            </label>
            <textarea id="hpf-description" required rows={3} value={form.description} onChange={update("description")} className={`${baseInput} resize-none`} placeholder="איך הוכן? ממה?" />
          </div>
          <div>
            <label htmlFor="hpf-category" className="block text-sm text-site-text mb-1">
              קטגוריה <span className="text-red-500">*</span>
            </label>
            <select id="hpf-category" required value={form.category} onChange={update("category")} className={baseInput}>
              <option value="">בחרי קטגוריה...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* ==================== Section 2: Safety / dates ==================== */}
        <fieldset className="space-y-3">
          <legend className="font-headline text-lg font-bold text-site-text mb-2">מידע חשוב לקונה</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="hpf-prep" className="block text-sm text-site-text mb-1">
                תאריך הכנה <span className="text-red-500">*</span>
              </label>
              <input id="hpf-prep" type="date" required value={form.prep_date} onChange={update("prep_date")} className={baseInput} />
            </div>
            <div>
              <label htmlFor="hpf-expiry" className="block text-sm text-site-text mb-1">
                תאריך תפוגה <span className="text-red-500">*</span>
              </label>
              <input id="hpf-expiry" type="date" required value={form.expiry_date} onChange={update("expiry_date")} className={baseInput} />
            </div>
          </div>
          <div>
            <label htmlFor="hpf-storage" className="block text-sm text-site-text mb-1">
              אחסון נדרש <span className="text-red-500">*</span>
            </label>
            <select id="hpf-storage" required value={form.storage_type} onChange={update("storage_type")} className={baseInput}>
              <option value="">בחרי אחסון...</option>
              {STORAGE_TYPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hpf-allergens" className="block text-sm text-site-text mb-1">
              רכיבים ואלרגנים <span className="text-red-500">*</span>
            </label>
            <textarea id="hpf-allergens" required rows={2} value={form.allergens} onChange={update("allergens")} className={`${baseInput} resize-none`} placeholder="חיטה, ביצים, חלב..." />
            <p className="text-xs text-site-muted mt-1">חשוב לאנשים עם אלרגיות ורגישויות.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="hpf-kosher" className="block text-sm text-site-text mb-1">כשרות</label>
              <select id="hpf-kosher" value={form.kosher} onChange={update("kosher")} className={baseInput}>
                <option value="">לא ידוע</option>
                {KOSHER_OPTIONS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 mt-6 cursor-pointer">
              <input type="checkbox" checked={form.is_organic} onChange={update("is_organic")} className="w-4 h-4 accent-primary" />
              <span className="text-sm text-site-text">🌿 גידול אורגני</span>
            </label>
          </div>
        </fieldset>

        {/* ==================== Section 3: Quantity + Price ==================== */}
        <fieldset className="space-y-3">
          <legend className="font-headline text-lg font-bold text-site-text mb-2">כמות ומחיר</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="hpf-quantity" className="block text-sm text-site-text mb-1">
                כמות <span className="text-red-500">*</span>
              </label>
              <input id="hpf-quantity" required value={form.quantity} onChange={update("quantity")} className={baseInput} placeholder="1" />
            </div>
            <div>
              <label htmlFor="hpf-unit" className="block text-sm text-site-text mb-1">יחידה</label>
              <select id="hpf-unit" value={form.unit} onChange={update("unit")} className={baseInput}>
                <option value="">בחרי...</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hpf-price" className="block text-sm text-site-text mb-1">
                מחיר (₪) <span className="text-red-500">*</span>
              </label>
              <input id="hpf-price" type="number" step="0.01" min="0" required value={form.price} onChange={update("price")} className={baseInput} />
              <p className="text-xs text-site-muted mt-1">0 = במתנה</p>
            </div>
          </div>
        </fieldset>

        {/* ==================== Section 4: Images ==================== */}
        <fieldset>
          <legend className="font-headline text-lg font-bold text-site-text mb-2">
            תמונות <span className="text-red-500 text-sm">*</span>
          </legend>
          <p className="text-xs text-site-muted mb-3">עד {MAX_IMAGES} תמונות. לפחות תמונה אחת חובה.</p>
          <div className="flex flex-wrap gap-3 mb-2">
            {images.map((url, i) => (
              <div key={i} className="relative w-24 h-24 rounded-[8px] overflow-hidden bg-light border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center"
                  aria-label="הסירי תמונה"
                >
                  ✕
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 right-1 bg-primary text-white text-[10px] px-1 rounded">ראשית</span>
                )}
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label className="w-24 h-24 border-2 border-dashed border-border rounded-[8px] flex items-center justify-center cursor-pointer hover:bg-light transition text-site-muted text-xs text-center p-2">
                {uploading ? "מעלה..." : "📷 הוסיפי תמונה"}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleImageUpload} />
              </label>
            )}
          </div>
        </fieldset>

        {/* ==================== Section 5: Location ==================== */}
        <fieldset className="space-y-3">
          <legend className="font-headline text-lg font-bold text-site-text mb-2">איפה נמצאים?</legend>
          <div>
            <label htmlFor="hpf-city" className="block text-sm text-site-text mb-1">
              עיר <span className="text-red-500">*</span>
            </label>
            <CitySearch
              id="hpf-city"
              label="עיר"
              value={form.city}
              onChange={(val) => setForm({ ...form, city: val })}
              placeholder="חפשי עיר..."
            />
          </div>
          <div>
            <label htmlFor="hpf-neighborhood" className="block text-sm text-site-text mb-1">שכונה</label>
            <CitySearch
              id="hpf-neighborhood"
              label="שכונה"
              value={form.neighborhood}
              onChange={(val) => setForm({ ...form, neighborhood: val })}
              placeholder="שכונה (אופציונלי)..."
            />
          </div>
          {/* FIXES_V2.md fix 7c — private fields, not shown publicly */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3">
            <div>
              <label htmlFor="hpf-street" className="block text-sm text-site-text mb-1">
                רחוב ומספר בית <span className="text-site-muted text-xs">(פרטי — לא מוצג בכרטיסייה)</span>
              </label>
              <input
                id="hpf-street"
                value={form.street}
                onChange={update("street")}
                className={baseInput}
                placeholder="לדוגמה: רוטשילד 12"
              />
            </div>
            <div>
              <label htmlFor="hpf-zip" className="block text-sm text-site-text mb-1">
                מיקוד
              </label>
              <input
                id="hpf-zip"
                value={form.zip_code}
                onChange={update("zip_code")}
                className={baseInput}
                placeholder="6133001"
                dir="ltr"
                maxLength={7}
              />
            </div>
          </div>
          <p className="text-xs text-site-muted">
            🔒 הכתובת המדויקת נשמרת לשימוש פנימי בלבד. ללקוחות מוצגים רק עיר ושכונה.
          </p>
          <div>
            <label htmlFor="hpf-location-notes" className="block text-sm text-site-text mb-1">הערות מיקום</label>
            <input id="hpf-location-notes" value={form.location_notes} onChange={update("location_notes")} className={baseInput} placeholder="ליד הסופר, כניסה מהחנייה" />
          </div>
        </fieldset>

        {/* ==================== Section 6: Delivery + Contact ==================== */}
        <fieldset className="space-y-3">
          <legend className="font-headline text-lg font-bold text-site-text mb-2">איסוף ומסירה</legend>
          <div>
            <label htmlFor="hpf-delivery" className="block text-sm text-site-text mb-1">שיטת מסירה</label>
            <select id="hpf-delivery" value={form.delivery_method} onChange={update("delivery_method")} className={baseInput}>
              <option value="">בחרי...</option>
              {DELIVERY_METHODS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hpf-phone" className="block text-sm text-site-text mb-1">
              טלפון (ל-WhatsApp) <span className="text-red-500">*</span>
            </label>
            <input id="hpf-phone" required value={form.phone} onChange={update("phone")} className={baseInput} placeholder="0501234567" dir="ltr" />
          </div>
        </fieldset>

        {/* ==================== Moderation feedback ==================== */}
        <div role="status" aria-live="polite">
          {checking && (
            <div className="text-sm text-site-muted flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-site-muted animate-pulse" aria-hidden="true" />
              בודקת תוכן...
            </div>
          )}
          {flagged && !checking && (
            <div className="rounded-[12px] p-3 text-sm" style={{ background: "#FFF9E6", border: "1px solid #F0C040", color: "#946A00" }}>
              <p className="font-medium">⚠️ {moderation.reason || "המודעה עשויה לעבור בדיקה לפני פרסום."}</p>
              {moderation.suggestion && <p className="mt-1 opacity-80">💡 {moderation.suggestion}</p>}
              <p className="mt-2 text-xs opacity-70">תוכלי לפרסם, אבל המוצר יעלה עם תגית &quot;בבדיקה&quot; עד שאדמין תאשר.</p>
            </div>
          )}
          {rejected && !checking && (
            <div className="rounded-[12px] p-3 text-sm" style={{ background: "#FFF0F0", border: "1px solid #F04040", color: "#c00" }}>
              <p className="font-medium">❌ {moderation.reason || "התוכן אינו עומד בקריטריונים שלנו"}</p>
              {moderation.suggestion && <p className="mt-1 opacity-80">💡 {moderation.suggestion}</p>}
              <p className="mt-2 text-xs opacity-70">
                יש לך שאלה? <a href="/about#contact" className="underline">צרי קשר</a>
              </p>
            </div>
          )}
          {submitError && !rejected && (
            <p className="text-sm text-red-600 mt-2" role="alert">{submitError}</p>
          )}
        </div>

        {/* ==================== Submit ==================== */}
        <div className="flex gap-3 items-center">
          <button
            type="submit"
            disabled={rejected || submitting || checking || uploading}
            className="bg-primary text-white px-6 py-3 rounded-[8px] hover:bg-primary-light transition disabled:opacity-60 disabled:cursor-not-allowed font-medium"
          >
            {submitting ? "מפרסמת..." : rejected ? "לא ניתן לפרסם" : "פרסמי מוצר"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-site-muted hover:text-site-text">
              ביטול
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
