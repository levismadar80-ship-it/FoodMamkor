"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Leaf, WhatsappLogo } from "@phosphor-icons/react";
import api from "@/lib/api";
import ButtonSpinner from "@/components/ButtonSpinner";
import CitySearch from "@/components/CitySearch";
import PasswordStrength from "@/components/PasswordStrength";
import { passwordValid, validateIsraeliPhone, validateEmail } from "@/lib/validators";

export default function RegisterProducerPage() {
  // Wrap in Suspense so useSearchParams (used for MEH-22 prefill) doesn't
  // break App-Router static prerender.
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-12 text-center text-site-muted">טוען טופס הרשמה...</div>}>
      <RegisterProducerPageBody />
    </Suspense>
  );
}

function RegisterProducerPageBody() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillToken = params.get("prefill");
  const [step, setStep] = useState(1);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    email: "", name: "", password: "",
    producer_name: "", description: "", city: "",
    lat: null, lng: null,
    phone: "", instagram: "", website: "",
    // MEH-17 — primary contact method + business email.
    primary_contact_method: "whatsapp",
    contact_email: "",
    category_ids: [],
    delivery_areas: [{ city: "", min_order: "", delivery_day: "" }],
  });
  const [stepError, setStepError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [declaredLicenses, setDeclaredLicenses] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
  }, []);

  // MEH-22 — if the URL carries ?prefill=TOKEN, fetch the admin-minted
  // prefill payload and populate the producer-details fields. Personal
  // account fields (email / password) stay empty on purpose — those
  // belong to the prospect, not the admin. Runs once per token.
  useEffect(() => {
    if (!prefillToken || prefillApplied) return;
    api
      .get(`/register/producer/prefill/${prefillToken}`)
      .then((r) => {
        const d = r.data || {};
        setForm((prev) => ({
          ...prev,
          producer_name: d.name ?? prev.producer_name,
          phone: d.phone ?? prev.phone,
          instagram: d.instagram ?? prev.instagram,
          website: d.website ?? prev.website,
          city: d.city ?? prev.city,
        }));
        setPrefillApplied(true);
      })
      .catch(() => {
        // 404 / expired token — silently ignore; form renders empty.
        setPrefillApplied(true);
      });
  }, [prefillToken, prefillApplied]);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const toggleCategory = (id) => {
    const ids = form.category_ids.includes(id)
      ? form.category_ids.filter((c) => c !== id)
      : [...form.category_ids, id];
    setForm({ ...form, category_ids: ids });
  };

  const updateDelivery = (index, field, value) => {
    const areas = [...form.delivery_areas];
    areas[index] = { ...areas[index], [field]: value };
    setForm({ ...form, delivery_areas: areas });
  };

  const addDeliveryArea = () => {
    setForm({ ...form, delivery_areas: [...form.delivery_areas, { city: "", min_order: "", delivery_day: "" }] });
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const data = {
        ...form,
        // MEH-17 — Pydantic's EmailStr rejects empty strings; null is fine.
        contact_email: form.contact_email?.trim() || null,
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

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-gray-200"}`} />
          ))}
        </div>

        {/* MEH-22 — prefill banner shown when a token fetched data OK. */}
        {prefillToken && prefillApplied && (
          <div className="bg-light text-primary border border-primary/30 rounded-[12px] p-3 mb-4 text-sm inline-flex items-center gap-2">
            <Leaf size={16} weight="duotone" aria-hidden="true" className="shrink-0" />
            מילאנו עבורך את פרטי העסק — אפשר לעדכן כל שדה לפני המשך.
          </div>
        )}

        {/* Step 1: Account */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">1. פרטי חשבון</h2>
            <input placeholder="שם מלא *" value={form.name} onChange={set("name")} className="w-full border rounded-[12px] px-3 py-2 text-right" dir="rtl" />
            <input type="email" placeholder="אימייל *" value={form.email} onChange={set("email")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
            <div>
              <input type="password" placeholder="סיסמה *" value={form.password} onChange={set("password")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" minLength={8} />
              <PasswordStrength password={form.password} />
            </div>
            {stepError && <p className="text-red-500 text-sm">{stepError}</p>}
            <button
              onClick={() => {
                if (!form.name || !form.email || !form.password) {
                  setStepError("יש למלא את כל שדות החובה");
                  return;
                }
                if (!validateEmail(form.email)) {
                  setStepError("אימייל לא תקין");
                  return;
                }
                if (!passwordValid(form.password)) {
                  setStepError("הסיסמה לא עומדת בדרישות");
                  return;
                }
                setStepError("");
                setStep(2);
              }}
              className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition"
            >
              הבא →
            </button>
          </div>
        )}

        {/* Step 2: Business Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">2. פרטי העסק</h2>
            <input placeholder="שם העסק *" value={form.producer_name} onChange={set("producer_name")} className="w-full border rounded-[12px] px-3 py-2 text-right" dir="rtl" />
            <textarea placeholder="תיאור העסק" value={form.description} onChange={set("description")} className="w-full border rounded-[12px] px-3 py-2 resize-none h-24 text-right" dir="rtl" />
            <CitySearch
              id="producer-register-city"
              label="עיר"
              value={form.city}
              onChange={(val) => setForm({ ...form, city: val })}
              placeholder="עיר *"
            />
            <div>
              <input
                placeholder="טלפון (0501234567)"
                value={form.phone}
                onChange={set("phone")}
                className={`w-full border rounded-[12px] px-3 py-2 ${
                  form.phone && !validateIsraeliPhone(form.phone) ? "border-red-400" : ""
                }`}
                dir="ltr"
                aria-invalid={form.phone && !validateIsraeliPhone(form.phone) ? true : undefined}
              />
              {form.phone && !validateIsraeliPhone(form.phone) && (
                <p className="text-xs text-red-500 mt-1">❌ מספר טלפון לא תקין</p>
              )}
              {form.phone && validateIsraeliPhone(form.phone) && (
                <p className="text-xs text-primary mt-1">✓ מספר תקין</p>
              )}
            </div>
            <input placeholder="אינסטגרם" value={form.instagram} onChange={set("instagram")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
            <input placeholder="אתר" value={form.website} onChange={set("website")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />

            {/* MEH-17 — primary contact method radio group + email input. */}
            <fieldset className="border border-border rounded-[12px] p-3">
              <legend className="px-2 text-sm font-medium">
                איך תרצי שיצרו אתך קשר? *
              </legend>
              <div className="flex flex-col gap-2 mt-1">
                {[
                  { key: "whatsapp", label: "WhatsApp", needs: "phone" },
                  { key: "phone", label: "טלפון", needs: "phone" },
                  { key: "website", label: "דרך האתר", needs: "website" },
                  { key: "email", label: "אימייל", needs: "contact_email" },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="primary_contact_method"
                      value={opt.key}
                      checked={form.primary_contact_method === opt.key}
                      onChange={() =>
                        setForm({ ...form, primary_contact_method: opt.key })
                      }
                      className="accent-primary"
                    />
                    {opt.label}
                    {form.primary_contact_method === opt.key && !form[opt.needs] && (
                      <span className="text-xs text-red-600">
                        (חובה להזין {opt.needs === "phone" ? "טלפון" : opt.needs === "website" ? "אתר" : "אימייל"})
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>

            <input
              type="email"
              placeholder="אימייל ליצירת קשר (לא מופיע בהרשמה — מופיע ללקוחות)"
              value={form.contact_email}
              onChange={set("contact_email")}
              className="w-full border rounded-[12px] px-3 py-2"
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
                        alert(err.response?.data?.detail || "שגיאה בהעלאת תמונה");
                      }
                      setUploading(false);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            <p className="text-sm text-text-secondary">
              חינם: עד 3 תמונות + הופעה במפה. פרמיום: תמונות ללא הגבלה + מוצרים + סטטיסטיקות.
              {" "}<a href="/upgrade" className="text-secondary hover:underline">שדרגו לפרמיום</a>
            </p>

            {stepError && <p className="text-red-500 text-sm">{stepError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setStepError(""); setStep(1); }} className="text-text-secondary">← חזור</button>
              <button
                onClick={() => {
                  if (!form.producer_name || !form.city) {
                    setStepError("יש למלא שם עסק ועיר");
                    return;
                  }
                  if (form.phone && !validateIsraeliPhone(form.phone)) {
                    setStepError("מספר טלפון לא תקין");
                    return;
                  }
                  setStepError("");
                  setStep(3);
                }}
                className="flex-1 bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition"
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
                <CitySearch
                  id={`delivery-city-${i}`}
                  label="עיר משלוח"
                  value={da.city}
                  onChange={(val) => updateDelivery(i, "city", val)}
                  placeholder="עיר משלוח"
                />
                <input
                  placeholder="מינימום ₪"
                  type="number"
                  value={da.min_order}
                  onChange={(e) => updateDelivery(i, "min_order", e.target.value)}
                  className="border rounded-[12px] px-3 py-2"
                />
                <input
                  placeholder="יום משלוח"
                  value={da.delivery_day}
                  onChange={(e) => updateDelivery(i, "delivery_day", e.target.value)}
                  className="border rounded-[12px] px-3 py-2 text-right"
                  dir="rtl"
                />
              </div>
            ))}
            <button type="button" onClick={addDeliveryArea} className="text-primary text-sm hover:underline">
              + הוסף אזור משלוח
            </button>

            {/* Legal compliance — Israeli law requires explicit license
                declaration and explicit ToS/privacy consent before a producer
                can be listed. Both checkboxes required to enable submit. */}
            <div className="space-y-3 pt-2 border-t border-border">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={declaredLicenses}
                  onChange={(e) => setDeclaredLicenses(e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0"
                  required
                />
                <span className="leading-relaxed">
                  אני מצהיר/ה שיש ברשותי את כל הרישיונות הנדרשים לממכר מזון לפי
                  חוק רישוי עסקים, התשכ״ח–1968, וכי אני נושא/ת באחריות הבלעדית
                  לציות לחוק.
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0"
                  required
                />
                <span className="leading-relaxed">
                  קראתי ואני מסכימ/ה{" "}
                  <a href="/terms" target="_blank" className="text-primary hover:underline">
                    לתנאי השימוש
                  </a>{" "}
                  ו
                  <a href="/privacy" target="_blank" className="text-primary hover:underline">
                    למדיניות הפרטיות
                  </a>
                </span>
              </label>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="text-text-secondary">← חזור</button>
              <button
                onClick={handleSubmit}
                disabled={loading || !agreedToTerms || !declaredLicenses}
                className="flex-1 bg-secondary text-white py-3 rounded-[12px] hover:bg-secondary-light transition font-medium disabled:opacity-50"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <ButtonSpinner />
                    שולחת...
                  </span>
                ) : (
                  "שלחי בקשה"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation + MEH-22 referral ask */}
        {step === 4 && (
          <div className="text-center py-8">
            <div className="mb-4 flex justify-center">
              <CheckCircle size={64} weight="fill" className="text-primary" aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-bold mb-2">הבקשה נשלחה!</h2>
            <p className="text-text-secondary mb-6">
              הבקשה שלך ממתינה לאישור. נעדכן אותך ברגע שהעסק יאושר.
            </p>

            {/* MEH-22 — referral ask. Opens WhatsApp with a pre-written
                invite message, nudging the new producer to bring a
                friend. Minimal attribution — we don't track referrer
                codes here; if we add that later this button's href
                becomes the attribution surface. */}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `היי 🌿 הצטרפתי עכשיו למהמקור — אתר ישראלי שמחבר בתי עסק מקומיים עם צרכניות שמחפשות אוכל אמיתי. חשבתי עלייך, נראה לי שזה יכול להתאים גם לך. מוזמנת להירשם בחינם: https://mehamakor.online/register/producer`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-[12px] hover:bg-[#1ea855] transition font-medium mb-3"
            >
              <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
              הזמיני שכנה להצטרף
            </a>
            <div>
              <button
                onClick={() => router.push("/")}
                className="border border-border text-site-text px-6 py-2 rounded-[12px] hover:bg-light transition text-sm"
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
