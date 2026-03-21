"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", city: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בהרשמה");
    }
    setLoading(false);
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-[12px] p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">הרשמה</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא *</label>
            <input value={form.name} onChange={set("name")} required className="w-full border rounded-[12px] px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אימייל *</label>
            <input type="email" value={form.email} onChange={set("email")} required className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סיסמה *</label>
            <input type="password" value={form.password} onChange={set("password")} required minLength={6} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">עיר</label>
            <input value={form.city} onChange={set("city")} className="w-full border rounded-[12px] px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">טלפון</label>
            <input value={form.phone} onChange={set("phone")} className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
          >
            {loading ? "נרשם..." : "הירשם"}
          </button>
        </form>

        <p className="text-center text-sm text-text-secondary mt-6">
          יש לך חשבון?{" "}
          <Link href="/login" className="text-primary hover:underline">
            התחבר
          </Link>
        </p>
        <p className="text-center text-sm text-text-secondary mt-2">
          רוצה להירשם כיצרן?{" "}
          <Link href="/register/producer" className="text-accent hover:underline">
            הרשמה ליצרנים
          </Link>
        </p>
      </div>
    </div>
  );
}
