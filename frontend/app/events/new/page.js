"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const TYPES = [
  { value: "event", label: "אירוע (סיור, יום שוק)" },
  { value: "experience", label: "חוויה (סדנה, סיור אוכל)" },
];

const LOCATION_TYPES = [
  { value: "producer_farm", label: "בחווה / בית עסק" },
  { value: "home", label: "בבית פרטי" },
  { value: "public", label: "מקום ציבורי" },
];

const CATEGORIES = ["בישול", "חקלאות", "טעימות", "סדנה", "תזונה"];

const EMPTY = {
  title: "",
  type: "experience",
  category: "",
  description: "",
  images: [""],
  starts_at: "",
  ends_at: "",
  location_type: "public",
  city: "",
  address: "",
  price_per_person: "",
  max_participants: "",
  requirements: "",
  is_recurring: false,
  recurring_schedule: "",
};

export default function NewEventPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/events/new");
    }
  }, [user, authLoading, router]);

  const set = (field) => (e) => {
    const value =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const setImage = (i) => (e) => {
    const next = [...form.images];
    next[i] = e.target.value;
    setForm((f) => ({ ...f, images: next }));
  };

  const addImageSlot = () => {
    if (form.images.length >= 5) return;
    setForm((f) => ({ ...f, images: [...f.images, ""] }));
  };

  const removeImage = (i) => () => {
    const next = form.images.filter((_, idx) => idx !== i);
    setForm((f) => ({ ...f, images: next.length ? next : [""] }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.title.trim() || form.title.trim().length < 4) {
      setError("כותרת חייבת להיות באורך 4 תווים לפחות");
      return;
    }
    if (!form.description.trim() || form.description.trim().length < 20) {
      setError("תיאור חייב להיות באורך 20 תווים לפחות");
      return;
    }
    if (!form.starts_at) {
      setError("חובה לבחור תאריך ושעה");
      return;
    }

    const images = form.images.map((x) => x.trim()).filter(Boolean);
    if (images.length === 0) {
      setError("יש להוסיף לפחות תמונה אחת");
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      images,
      category: form.category || null,
      type: form.type,
      location_type: form.location_type,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      city: form.city || null,
      address: form.address || null,
      price_per_person: form.price_per_person
        ? Number(form.price_per_person)
        : null,
      max_participants: form.max_participants
        ? Number(form.max_participants)
        : null,
      requirements: form.requirements || null,
      is_recurring: form.is_recurring,
      recurring_schedule: form.is_recurring
        ? form.recurring_schedule || null
        : null,
    };

    setSubmitting(true);
    try {
      const r = await api.post("/events", payload);
      router.push(`/events/${r.data.id}?pending=1`);
    } catch (err) {
      setError(
        err.response?.data?.detail
          ? JSON.stringify(err.response.data.detail)
          : "שגיאה בשליחת האירוע"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-text-secondary">
        טוען...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/events"
          className="text-text-secondary text-sm hover:text-primary"
        >
          ← חזרה לאירועים
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold mt-2">
          הוסיפי אירוע או חוויה
        </h1>
        <p className="text-text-secondary mt-2">
          ההגשה תעבור לאישור צוות מהמקור ותתפרסם תוך 24-48 שעות. 🌿
        </p>
      </div>

      <form
        onSubmit={submit}
        className="bg-white border border-border rounded-[12px] p-6 space-y-5"
      >
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">
            {error}
          </div>
        )}

        <Field label="כותרת האירוע *">
          <input
            type="text"
            value={form.title}
            onChange={set("title")}
            placeholder="לדוגמה: סדנת אפיית לחם מחמצת"
            className="w-full border border-border rounded-[12px] px-3 py-2"
            required
          />
        </Field>

        <Field label="סוג *">
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                className={`px-4 py-2 rounded-[12px] text-sm transition ${
                  form.type === t.value
                    ? "bg-primary text-white"
                    : "bg-accent text-text-primary hover:bg-secondary-light"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="קטגוריה">
          <select
            value={form.category}
            onChange={set("category")}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          >
            <option value="">ללא</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="תיאור מפורט *">
          <textarea
            value={form.description}
            onChange={set("description")}
            rows={6}
            placeholder="ספרי על החוויה — מה תלמדו, מה יהיה בסדנה, למי זה מתאים..."
            className="w-full border border-border rounded-[12px] px-3 py-2"
            required
          />
        </Field>

        <Field label="תמונות (עד 5, קישורי URL) *">
          <div className="space-y-2">
            {form.images.map((img, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="url"
                  value={img}
                  onChange={setImage(i)}
                  placeholder="https://res.cloudinary.com/..."
                  className="flex-1 border border-border rounded-[12px] px-3 py-2"
                />
                {form.images.length > 1 && (
                  <button
                    type="button"
                    onClick={removeImage(i)}
                    className="text-red-500 text-sm px-2"
                  >
                    הסר
                  </button>
                )}
              </div>
            ))}
            {form.images.length < 5 && (
              <button
                type="button"
                onClick={addImageSlot}
                className="text-primary text-sm hover:underline"
              >
                + הוסף תמונה
              </button>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="תאריך ושעה *">
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={set("starts_at")}
              className="w-full border border-border rounded-[12px] px-3 py-2"
              required
            />
          </Field>
          <Field label="סיום (אופציונלי)">
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={set("ends_at")}
              className="w-full border border-border rounded-[12px] px-3 py-2"
            />
          </Field>
        </div>

        <Field label="סוג מיקום *">
          <select
            value={form.location_type}
            onChange={set("location_type")}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          >
            {LOCATION_TYPES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="עיר *">
            <input
              type="text"
              value={form.city}
              onChange={set("city")}
              placeholder="תל אביב"
              className="w-full border border-border rounded-[12px] px-3 py-2"
              required
            />
          </Field>
          <Field label="כתובת">
            <input
              type="text"
              value={form.address}
              onChange={set("address")}
              placeholder="רחוב, מספר"
              className="w-full border border-border rounded-[12px] px-3 py-2"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="מחיר לאדם (₪) — השאירי ריק עבור חינם">
            <input
              type="number"
              min="0"
              step="1"
              value={form.price_per_person}
              onChange={set("price_per_person")}
              placeholder="150"
              className="w-full border border-border rounded-[12px] px-3 py-2"
            />
          </Field>
          <Field label="מספר משתתפים מקסימלי">
            <input
              type="number"
              min="1"
              value={form.max_participants}
              onChange={set("max_participants")}
              placeholder="12"
              className="w-full border border-border rounded-[12px] px-3 py-2"
            />
          </Field>
        </div>

        <Field label="מה להביא / דרישות מוקדמות">
          <textarea
            value={form.requirements}
            onChange={set("requirements")}
            rows={3}
            placeholder="סינר, נעליים סגורות, יכולת עמידה של שעתיים..."
            className="w-full border border-border rounded-[12px] px-3 py-2"
          />
        </Field>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={set("is_recurring")}
              className="w-4 h-4"
            />
            <span className="text-sm">האירוע חוזר (שבועי / חודשי)</span>
          </label>
          {form.is_recurring && (
            <input
              type="text"
              value={form.recurring_schedule}
              onChange={set("recurring_schedule")}
              placeholder="לדוגמה: כל יום שישי 9:00-12:00"
              className="mt-2 w-full border border-border rounded-[12px] px-3 py-2 text-sm"
            />
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-primary text-white py-3 rounded-[12px] font-medium hover:bg-primary-light transition disabled:opacity-50"
        >
          {submitting ? "שולחת..." : "שלחי לאישור 🌿"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
