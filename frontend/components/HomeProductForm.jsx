"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

/**
 * Create-form for "מהמטבח של השכן" with AI moderation feedback.
 *
 * Per MODERATION.md:
 *   - Debounced /home-products/validate call as user types (1.5s)
 *   - FLAGGED: shows a yellow warning + suggestion, still lets them submit
 *   - REJECTED: shows a red block + disables the submit button
 *   - On server-side REJECTED (defense-in-depth), surfaces the same error
 */
export default function HomeProductForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    quantity: "",
    price: "",
    neighborhood: "",
    city: "",
    phone: "",
  });
  const [checking, setChecking] = useState(false);
  const [moderation, setModeration] = useState(null); // { status, reason, suggestion }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Debounced validator — fires 1.5s after user stops typing, only if
  // there's enough content to be meaningful.
  const timerRef = useRef(null);
  const seqRef = useRef(0); // request-sequence guard to drop stale responses

  const runValidation = useCallback((title, description, price) => {
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
        price: price ? Number(price) : null,
      })
      .then((r) => {
        if (mySeq !== seqRef.current) return; // stale
        setModeration(r.data);
      })
      .catch(() => {
        if (mySeq !== seqRef.current) return;
        // Fail open — don't block users if moderation endpoint is down
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
      runValidation(form.title, form.description, form.price);
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [form.title, form.description, form.price, runValidation]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    if (moderation?.status === "REJECTED") return;
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        quantity: form.quantity,
        price: form.price || null,
        neighborhood: form.neighborhood,
        city: form.city,
        phone: form.phone,
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
        // Reflect the server verdict in the UI block too
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

  return (
    <div className="bg-white rounded-[16px] p-6 mb-6 border border-border">
      <h3 className="font-headline text-xl font-bold mb-4 text-site-text">פרסום מוצר ביתי</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label htmlFor="hpf-title" className="sr-only">כותרת</label>
          <input
            id="hpf-title"
            name="title"
            required
            value={form.title}
            onChange={update("title")}
            placeholder="כותרת * (למשל: לחם מחמצת טרי)"
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          />
        </div>
        <div>
          <label htmlFor="hpf-price" className="sr-only">מחיר</label>
          <input
            id="hpf-price"
            name="price"
            type="number"
            step="0.01"
            value={form.price}
            onChange={update("price")}
            placeholder="מחיר (₪)"
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          />
        </div>
        <div>
          <label htmlFor="hpf-quantity" className="sr-only">כמות</label>
          <input
            id="hpf-quantity"
            name="quantity"
            value={form.quantity}
            onChange={update("quantity")}
            placeholder="כמות"
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          />
        </div>
        <div>
          <label htmlFor="hpf-neighborhood" className="sr-only">שכונה</label>
          <input
            id="hpf-neighborhood"
            name="neighborhood"
            value={form.neighborhood}
            onChange={update("neighborhood")}
            placeholder="שכונה"
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          />
        </div>
        <div>
          <label htmlFor="hpf-city" className="sr-only">עיר</label>
          <input
            id="hpf-city"
            name="city"
            value={form.city}
            onChange={update("city")}
            placeholder="עיר"
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          />
        </div>
        <div>
          <label htmlFor="hpf-phone" className="sr-only">טלפון</label>
          <input
            id="hpf-phone"
            name="phone"
            value={form.phone}
            onChange={update("phone")}
            placeholder="טלפון (ל-WhatsApp)"
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
            dir="ltr"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="hpf-description" className="sr-only">תיאור</label>
          <textarea
            id="hpf-description"
            name="description"
            value={form.description}
            onChange={update("description")}
            placeholder="תיאור"
            className="w-full border border-border rounded-[12px] px-3 py-2 resize-none h-24 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
          />
        </div>

        {/* Moderation feedback region */}
        <div className="md:col-span-2" role="status" aria-live="polite">
          {checking && (
            <div className="text-sm text-site-muted flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-site-muted animate-pulse" aria-hidden="true" />
              בודקת תוכן...
            </div>
          )}

          {flagged && !checking && (
            <div
              className="rounded-[12px] p-3 text-sm"
              style={{ background: "#FFF9E6", border: "1px solid #F0C040", color: "#946A00" }}
            >
              <p className="font-medium">⚠️ {moderation.reason || "המודעה עשויה לעבור בדיקה לפני פרסום."}</p>
              {moderation.suggestion && (
                <p className="mt-1 opacity-80">💡 {moderation.suggestion}</p>
              )}
              <p className="mt-2 text-xs opacity-70">תוכלי לפרסם, אבל המוצר יעלה עם תגית &quot;בבדיקה&quot; עד שאדמין תאשר.</p>
            </div>
          )}

          {rejected && !checking && (
            <div
              className="rounded-[12px] p-3 text-sm"
              style={{ background: "#FFF0F0", border: "1px solid #F04040", color: "#c00" }}
            >
              <p className="font-medium">❌ {moderation.reason || "התוכן אינו עומד בקריטריונים שלנו"}</p>
              {moderation.suggestion && (
                <p className="mt-1 opacity-80">💡 {moderation.suggestion}</p>
              )}
              <p className="mt-2 text-xs opacity-70">
                יש לך שאלה? <a href="/about#contact" className="underline">צרי קשר</a>
              </p>
            </div>
          )}

          {submitError && !rejected && (
            <p className="text-sm text-red-600 mt-2" role="alert">{submitError}</p>
          )}
        </div>

        <div className="md:col-span-2 flex gap-3 items-center">
          <button
            type="submit"
            disabled={rejected || submitting || checking}
            className="bg-primary text-white px-6 py-2 rounded-[12px] hover:bg-primary-light transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "מפרסמת..." : rejected ? "לא ניתן לפרסם" : "פרסם מוצר"}
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
