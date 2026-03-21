"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function RegisterProducerPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    email: "", name: "", password: "",
    producer_name: "", description: "", city: "",
    lat: null, lng: null,
    phone: "", instagram: "", website: "",
    category_ids: [],
    delivery_areas: [{ city: "", min_order: "", delivery_day: "" }],
  });
  const [stepError, setStepError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
  }, []);

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
        <h1 className="text-2xl font-bold mb-2 text-center">הרשמה כיצרן</h1>
        <p className="text-text-secondary text-center mb-8">הצטרפו למהמקור והגיעו לקונים שמחפשים אוכל אמיתי</p>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-gray-200"}`} />
          ))}
        </div>

        {/* Step 1: Account */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">1. פרטי חשבון</h2>
            <input placeholder="שם מלא *" value={form.name} onChange={set("name")} className="w-full border rounded-[12px] px-3 py-2" />
            <input type="email" placeholder="אימייל *" value={form.email} onChange={set("email")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
            <input type="password" placeholder="סיסמה *" value={form.password} onChange={set("password")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
            {stepError && <p className="text-red-500 text-sm">{stepError}</p>}
            <button
              onClick={() => {
                if (!form.name || !form.email || !form.password) {
                  setStepError("יש למלא את כל שדות החובה");
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
            <input placeholder="שם העסק *" value={form.producer_name} onChange={set("producer_name")} className="w-full border rounded-[12px] px-3 py-2" />
            <textarea placeholder="תיאור העסק" value={form.description} onChange={set("description")} className="w-full border rounded-[12px] px-3 py-2 resize-none h-24" />
            <input placeholder="עיר *" value={form.city} onChange={set("city")} className="w-full border rounded-[12px] px-3 py-2" />
            <input placeholder="טלפון" value={form.phone} onChange={set("phone")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
            <input placeholder="אינסטגרם" value={form.instagram} onChange={set("instagram")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
            <input placeholder="אתר" value={form.website} onChange={set("website")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />

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
              {" "}<a href="/upgrade" className="text-accent hover:underline">שדרגו לפרמיום</a>
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
                <input
                  placeholder="עיר *"
                  value={da.city}
                  onChange={(e) => updateDelivery(i, "city", e.target.value)}
                  className="border rounded-[12px] px-3 py-2"
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
                  className="border rounded-[12px] px-3 py-2"
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
                className="flex-1 bg-accent text-white py-3 rounded-[12px] hover:bg-accent-light transition font-medium disabled:opacity-50"
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
            <h2 className="text-2xl font-bold mb-2">הבקשה נשלחה!</h2>
            <p className="text-text-secondary mb-6">
              הבקשה שלך ממתינה לאישור. נעדכן אותך ברגע שהעסק יאושר.
            </p>
            <button
              onClick={() => router.push("/")}
              className="bg-primary text-white px-8 py-3 rounded-[12px] hover:bg-primary-light transition"
            >
              חזרה לדף הבית
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
