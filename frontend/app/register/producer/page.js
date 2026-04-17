"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const DRAFT_KEY = "producer_draft";

const EMPTY_FORM = {
  email: "", name: "", password: "",
  producer_name: "", description: "", city: "",
  lat: null, lng: null,
  phone: "", instagram: "", website: "",
  category_ids: [],
  delivery_areas: [{ city: "", min_order: "", delivery_day: "" }],
};

function validate1(form) {
  const errs = {};
  if (!form.name.trim()) errs.name = "שם מלא חובה";
  if (!form.email.trim()) errs.email = "אימייל חובה";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "אימייל לא תקין";
  if (!form.password) errs.password = "סיסמה חובה";
  else if (form.password.length < 6) errs.password = "סיסמה חייבת להכיל לפחות 6 תווים";
  return errs;
}

function validate2(form) {
  const errs = {};
  if (!form.producer_name.trim()) errs.producer_name = "שם העסק חובה";
  if (!form.city.trim()) errs.city = "עיר חובה";
  if (form.phone && !/^[\d\-+ ]{7,15}$/.test(form.phone)) errs.phone = "מספר טלפון לא תקין";
  return errs;
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="text-red-600 text-xs mt-1">{msg}</p>;
}

export default function RegisterProducerPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showDraftBanner, setShowDraftBanner] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name || parsed.producer_name || parsed.email) {
          setShowDraftBanner(true);
        }
      }
    } catch {}
  }, []);

  const saveDraft = (updatedForm) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(updatedForm));
    } catch {}
  };

  const restoreDraft = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (saved) setForm({ ...EMPTY_FORM, ...saved });
    } catch {}
    setShowDraftBanner(false);
  };

  const set = (field) => (e) => {
    const updated = { ...form, [field]: e.target.value };
    setForm(updated);
    saveDraft(updated);
    if (fieldErrors[field]) setFieldErrors({ ...fieldErrors, [field]: undefined });
  };

  const toggleCategory = (id) => {
    const ids = form.category_ids.includes(id)
      ? form.category_ids.filter((c) => c !== id)
      : [...form.category_ids, id];
    const updated = { ...form, category_ids: ids };
    setForm(updated);
    saveDraft(updated);
  };

  const updateDelivery = (index, field, value) => {
    const areas = [...form.delivery_areas];
    areas[index] = { ...areas[index], [field]: value };
    const updated = { ...form, delivery_areas: areas };
    setForm(updated);
    saveDraft(updated);
  };

  const addDeliveryArea = () => {
    const updated = { ...form, delivery_areas: [...form.delivery_areas, { city: "", min_order: "", delivery_day: "" }] };
    setForm(updated);
    saveDraft(updated);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const data = {
        ...form,
        delivery_areas: form.delivery_areas
          .filter((da) => da.city)
          .map((da) => ({
            city: da.city,
            min_order: da.min_order ? parseInt(da.min_order) : null,
            delivery_day: da.delivery_day || null,
          })),
      };
      const res = await api.post("/auth/register/producer", data);
      localStorage.setItem("token", res.data.access_token);
      localStorage.removeItem(DRAFT_KEY);
      setStep(4);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בהרשמה");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="bg-white rounded-[12px] p-8">
        <h1 className="text-2xl font-bold mb-2 text-center">הוסף את העסק שלך</h1>
        <p className="text-text-secondary text-center mb-8">הצטרפו למהמקור והגיעו לקונים שמחפשים אוכל אמיתי</p>

        {/* Draft banner */}
        {showDraftBanner && step < 4 && (
          <div className="mb-6 bg-light border border-primary/30 rounded-[12px] p-4 flex items-center justify-between gap-3 text-sm">
            <span>יש לך טיוח שמור — רוצה להמשיך מהמקום שעצרת?</span>
            <div className="flex gap-2 shrink-0">
              <button onClick={restoreDraft} className="bg-primary text-white px-3 py-1 rounded-[8px] hover:bg-primary-dark transition">
                המשך
              </button>
              <button onClick={() => setShowDraftBanner(false)} className="text-text-secondary hover:text-text-primary">
                התחל מחדש
              </button>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-gray-200"}`} />
          ))}
        </div>

        {/* Step 1: Account */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">1. פרטי חשבון</h2>
            <div>
              <input
                placeholder="שם מלא *"
                value={form.name}
                onChange={set("name")}
                className={`w-full border rounded-[12px] px-3 py-2 focus:outline-none ${fieldErrors.name ? "border-red-400 focus:border-red-400" : "focus:border-primary"}`}
              />
              <FieldError msg={fieldErrors.name} />
            </div>
            <div>
              <input
                type="email"
                placeholder="אימייל *"
                value={form.email}
                onChange={set("email")}
                className={`w-full border rounded-[12px] px-3 py-2 focus:outline-none ${fieldErrors.email ? "border-red-400 focus:border-red-400" : "focus:border-primary"}`}
                dir="ltr"
              />
              <FieldError msg={fieldErrors.email} />
            </div>
            <div>
              <input
                type="password"
                placeholder="סיסמה * (לפחות 6 תווים)"
                value={form.password}
                onChange={set("password")}
                className={`w-full border rounded-[12px] px-3 py-2 focus:outline-none ${fieldErrors.password ? "border-red-400 focus:border-red-400" : "focus:border-primary"}`}
                dir="ltr"
              />
              <FieldError msg={fieldErrors.password} />
            </div>
            <button
              onClick={() => {
                const errs = validate1(form);
                if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
                setFieldErrors({});
                setStep(2);
              }}
              className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition"
            >
              הבא →
            </button>
          </div>
        )}

        {/* Step 2: Business Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">2. פרטי העסק</h2>
            <div>
              <input
                placeholder="שם העסק *"
                value={form.producer_name}
                onChange={set("producer_name")}
                className={`w-full border rounded-[12px] px-3 py-2 focus:outline-none ${fieldErrors.producer_name ? "border-red-400" : "focus:border-primary"}`}
              />
              <FieldError msg={fieldErrors.producer_name} />
            </div>
            <textarea
              placeholder="תיאור העסק"
              value={form.description}
              onChange={set("description")}
              className="w-full border rounded-[12px] px-3 py-2 resize-none h-24 focus:outline-none focus:border-primary"
            />
            <div>
              <input
                placeholder="עיר *"
                value={form.city}
                onChange={set("city")}
                className={`w-full border rounded-[12px] px-3 py-2 focus:outline-none ${fieldErrors.city ? "border-red-400" : "focus:border-primary"}`}
              />
              <FieldError msg={fieldErrors.city} />
            </div>
            <div>
              <input
                placeholder="טלפון"
                value={form.phone}
                onChange={set("phone")}
                className={`w-full border rounded-[12px] px-3 py-2 focus:outline-none ${fieldErrors.phone ? "border-red-400" : "focus:border-primary"}`}
                dir="ltr"
              />
              <FieldError msg={fieldErrors.phone} />
            </div>
            <input
              placeholder="אינסטגרם"
              value={form.instagram}
              onChange={set("instagram")}
              className="w-full border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
              dir="ltr"
            />
            <input
              placeholder="אתר"
              value={form.website}
              onChange={set("website")}
              className="w-full border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
              dir="ltr"
            />

            <div>
              <p className="font-medium mb-2">קטגוריות</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-3 py-1 rounded-full text-sm transition ${
                      form.category_ids.includes(cat.id) ? "bg-primary text-white" : "bg-gray-100 text-text-secondary"
                    }`}
                  >
                    {cat.emoji} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Image Upload */}
            <div>
              <p className="font-medium mb-2">תמונות (עד 3 בתוכנית חינם)</p>
              <div className="flex flex-wrap gap-3 mb-2">
                {uploadedImages.map((url, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-[12px] overflow-hidden bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setUploadedImages(uploadedImages.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {uploadedImages.length < 3 && (
                <label className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-[12px] cursor-pointer hover:bg-gray-200 transition text-sm">
                  {uploading ? "מעלה..." : "📷 העלה תמונה"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        const res = await api.post("/upload/image", formData);
                        setUploadedImages([...uploadedImages, res.data.url]);
                      } catch (err) {
                        toast(err.response?.data?.detail || "שגיאה בהעלאת תמונה", "error");
                      }
                      setUploading(false);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            <p className="text-sm text-text-secondary">
              חינם: עד 3 תמונות + הופעה במפה.
            </p>

            <div className="flex gap-3">
              <button onClick={() => { setFieldErrors({}); setStep(1); }} className="text-text-secondary">← חזור</button>
              <button
                onClick={() => {
                  const errs = validate2(form);
                  if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
                  setFieldErrors({});
                  setStep(3);
                }}
                className="flex-1 bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition"
              >
                הבא →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Delivery */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">3. אזורי משלוח</h2>
            {form.delivery_areas.map((da, i) => (
              <div key={i} className="grid grid-cols-3 gap-3">
                <input
                  placeholder="עיר *"
                  value={da.city}
                  onChange={(e) => updateDelivery(i, "city", e.target.value)}
                  className="border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
                />
                <input
                  placeholder="מינימום ₪"
                  type="number"
                  value={da.min_order}
                  onChange={(e) => updateDelivery(i, "min_order", e.target.value)}
                  className="border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
                />
                <input
                  placeholder="יום משלוח"
                  value={da.delivery_day}
                  onChange={(e) => updateDelivery(i, "delivery_day", e.target.value)}
                  className="border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
                />
              </div>
            ))}
            <button type="button" onClick={addDeliveryArea} className="text-primary text-sm hover:underline">
              + הוסף אזור משלוח
            </button>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span>
                קראתי ואישרתי את{" "}
                <a href="/terms" target="_blank" className="text-primary hover:underline">תנאי השימוש</a>
              </span>
            </label>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="text-text-secondary">← חזור</button>
              <button
                onClick={handleSubmit}
                disabled={loading || !agreedToTerms}
                className="flex-1 bg-secondary text-white py-3 rounded-[12px] hover:bg-secondary-light transition font-medium disabled:opacity-50"
              >
                {loading ? "שולח..." : "שלח בקשה"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-4">הבקשה נשלחה!</h2>

            <ul className="text-right space-y-3 mb-8 max-w-xs mx-auto text-sm">
              <li className="flex items-start gap-2">
                <span className="text-primary shrink-0">✓</span>
                <span>קיבלנו את הפנייה שלך</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">⏱</span>
                <span>בדרך כלל אנחנו מאשרים תוך 24–48 שעות</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">📧</span>
                <span>נשלח לך אימייל כשהפרופיל מאושר</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0">📱</span>
                <span>בינתיים — עקבי אחרינו באינסטגרם</span>
              </li>
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://instagram.com/mehamekor"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-primary text-white px-6 py-3 rounded-[12px] hover:bg-primary-dark transition font-medium"
              >
                עקבי @mehamekor
              </a>
              <button
                onClick={() => router.push("/")}
                className="border border-border text-text-primary px-6 py-3 rounded-[12px] hover:bg-gray-50 transition"
              >
                חזרה לדף הבית
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
