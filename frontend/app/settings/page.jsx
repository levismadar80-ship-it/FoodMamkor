"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { UserCircle, Lock, Storefront, Package, Plus, Trash, X } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import PasswordStrength from "@/components/PasswordStrength";

/**
 * /settings — three-tab account page (MEH-16).
 *
 * Tabs:
 *   פרופיל  — avatar (initial), name, email
 *   אבטחה  — password change (hidden for OAuth), logout, delete account
 *   העסק שלי — producer-only summary + deep link to full dashboard
 *
 * URL state: ?tab=profile|security|business. Default = profile.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-4 py-12 text-site-muted">טוענת...</div>}>
      <SettingsPageBody />
    </Suspense>
  );
}

function SettingsPageBody() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const urlTab = params.get("tab");
  const initialTab =
    urlTab === "security" || urlTab === "business" ? urlTab : "profile";
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) return null;

  const isProducer = user.role === "producer";

  const selectTab = (next) => {
    setTab(next);
    // Keep URL + state in sync so the back button and direct links work.
    const qp = new URLSearchParams(params.toString());
    qp.set("tab", next);
    router.replace(`/settings?${qp.toString()}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 pb-28">
      <h1 className="font-headline text-3xl font-bold text-site-text mb-6">
        הגדרות חשבון
      </h1>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="טאבים"
        className="flex gap-1 bg-white border border-border rounded-full p-1 mb-8 overflow-x-auto"
      >
        <TabButton
          active={tab === "profile"}
          onClick={() => selectTab("profile")}
          icon={<UserCircle size={16} weight={tab === "profile" ? "fill" : "duotone"} />}
        >
          פרופיל
        </TabButton>
        <TabButton
          active={tab === "security"}
          onClick={() => selectTab("security")}
          icon={<Lock size={16} weight={tab === "security" ? "fill" : "duotone"} />}
        >
          אבטחה
        </TabButton>
        {isProducer && (
          <TabButton
            active={tab === "business"}
            onClick={() => selectTab("business")}
            icon={
              <Storefront size={16} weight={tab === "business" ? "fill" : "duotone"} />
            }
          >
            העסק שלי
          </TabButton>
        )}
      </div>

      {tab === "profile" && <ProfileTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "business" && isProducer && <BusinessTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${
        active
          ? "bg-primary text-white"
          : "text-site-muted hover:text-site-text"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// פרופיל
// ---------------------------------------------------------------------------

function ProfileTab() {
  const { user, updateProfile, refreshUser } = useAuth();
  const [name, setName] = useState(user.name || "");
  const [city, setCity] = useState(user.city || "");
  const [phone, setPhone] = useState(user.phone || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const isOAuth = !!user.is_oauth || !!user.google_id || !!user.apple_id;
  const oAuthProvider = user.google_id ? "Google" : user.apple_id ? "Apple" : null;
  const trimmedName = name.trim();
  const dirty =
    trimmedName !== (user.name || "") ||
    city !== (user.city || "") ||
    phone !== (user.phone || "");
  const canSave = dirty && !!trimmedName;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const patch = {};
      if (trimmedName !== user.name) patch.name = trimmedName;
      if (city !== (user.city || "")) patch.city = city.trim();
      if (phone !== (user.phone || "")) patch.phone = phone.trim();
      await updateProfile(patch);
      setMessage("הפרטים נשמרו");
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || "לא הצלחנו לשמור. נסי שוב.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/upload/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshUser();
      setMessage("תמונת הפרופיל עודכנה");
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setError("שגיאה בהעלאת התמונה, נסי שוב");
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-selected after an error
      e.target.value = "";
    }
  };

  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <section
      role="tabpanel"
      aria-label="פרופיל"
      className="bg-white border border-border rounded-[16px] p-6"
    >
      <div className="flex items-center gap-4 mb-6">
        <label
          htmlFor="avatar-upload"
          className="relative w-16 h-16 rounded-full cursor-pointer group shrink-0"
          aria-label="שינוי תמונת פרופיל"
        >
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-semibold bg-primary">
              {initial}
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <span className="text-white text-xs font-medium">שנה</span>
          </div>
          {/* Upload spinner */}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <svg className="animate-spin w-6 h-6 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}
        </label>
        <input
          id="avatar-upload"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleAvatarChange}
          disabled={uploading}
        />
        <div>
          <p className="font-semibold text-site-text">{user.name}</p>
          <p className="text-sm text-site-muted" dir="ltr">
            {user.email}
          </p>
          <p className="text-xs text-site-muted mt-0.5">לחצי על התמונה לשינוי</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium mb-1">
            שם מלא *
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            spellCheck={false}
            className="w-full border border-border rounded-[12px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm font-medium mb-1">
            אימייל
          </label>
          <input
            id="profile-email"
            type="email"
            value={user.email || ""}
            readOnly
            disabled
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-light text-site-muted cursor-not-allowed"
            dir="ltr"
          />
          <p className="text-xs text-site-muted mt-1 text-right">
            {isOAuth
              ? `האימייל מחובר לחשבון ${oAuthProvider ?? "חיצוני"} שלך. לשינוי — עדכני בהגדרות ${oAuthProvider ?? "ספק הזהות"}`
              : "לשינוי אימייל, פני לתמיכה"}
          </p>
        </div>
        <div>
          <label htmlFor="profile-city" className="block text-sm font-medium mb-1">
            עיר <span className="text-site-muted font-normal">(אופציונלי)</span>
          </label>
          <input
            id="profile-city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="תל אביב"
            className="w-full border border-border rounded-[12px] px-3 py-2 text-right"
            dir="rtl"
          />
          <p className="text-xs text-site-muted mt-1 text-right">
            כדי שנציג לך עסקים באזורך
          </p>
        </div>
        <div>
          <label htmlFor="profile-phone" className="block text-sm font-medium mb-1">
            טלפון <span className="text-site-muted font-normal">(אופציונלי)</span>
          </label>
          <input
            id="profile-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            className="w-full border border-border rounded-[12px] px-3 py-2"
            dir="ltr"
          />
          <p className="text-xs text-site-muted mt-1 text-right">
            נוסיף בקרוב notifications
          </p>
        </div>

        {message && (
          <p className="text-sm text-primary" role="status">
            ✓ {message}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave || saving}
          className="bg-primary text-white px-6 py-2.5 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
        >
          {saving ? "שומרת..." : "שמרי"}
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// אבטחה
// ---------------------------------------------------------------------------

function SecurityTab() {
  const { user, changePassword, logout, deleteAccount } = useAuth();
  const router = useRouter();
  const isOAuth = !!user.is_oauth || !!user.google_id || !!user.apple_id;

  return (
    <div className="space-y-6" role="tabpanel" aria-label="אבטחה">
      {isOAuth ? (
        <div className="bg-white border border-border rounded-[16px] p-6 text-sm text-site-muted">
          התחברת דרך Google / Apple — שינוי סיסמה מתבצע שם.
        </div>
      ) : (
        <PasswordChangeCard changePassword={changePassword} />
      )}

      <div className="bg-white border border-border rounded-[16px] p-6">
        <h2 className="font-semibold text-site-text mb-2">התנתקות</h2>
        <p className="text-sm text-site-muted mb-4">
          תנתקי את המכשיר הזה בלבד. שאר המכשירים שלך יישארו מחוברים.
        </p>
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/");
          }}
          className="border border-border text-site-text px-5 py-2 rounded-[12px] hover:bg-light transition text-sm"
        >
          התנתקי
        </button>
      </div>

      <DangerZone deleteAccount={deleteAccount} router={router} />
    </div>
  );
}

function PasswordChangeCard({ changePassword }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const ok = current.length >= 1 && next.length >= 8 && next === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ok) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await changePassword(current, next);
      setMessage("הסיסמה עודכנה");
      setTimeout(() => setMessage(null), 3000);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail === "SET_PASSWORD_UNSUPPORTED") {
        setError("לא ניתן לשנות סיסמה — התחברת דרך Google / Apple.");
      } else {
        setError(detail || "לא הצלחנו לעדכן. נסי שוב.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-[16px] p-6">
      <h2 className="font-semibold text-site-text mb-3">שינוי סיסמה</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="pw-current" className="block text-sm font-medium mb-1">
            סיסמה נוכחית
          </label>
          <input
            id="pw-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="w-full border border-border rounded-[12px] px-3 py-2"
            dir="ltr"
          />
        </div>
        <div>
          <label htmlFor="pw-new" className="block text-sm font-medium mb-1">
            סיסמה חדשה
          </label>
          <input
            id="pw-new"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={8}
            required
            className="w-full border border-border rounded-[12px] px-3 py-2"
            dir="ltr"
          />
          <PasswordStrength password={next} />
        </div>
        <div>
          <label htmlFor="pw-confirm" className="block text-sm font-medium mb-1">
            אישור סיסמה חדשה
          </label>
          <input
            id="pw-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full border border-border rounded-[12px] px-3 py-2"
            dir="ltr"
          />
          {confirm.length > 0 && confirm !== next && (
            <p className="text-xs text-red-600 mt-1 text-right">הסיסמאות לא תואמות</p>
          )}
        </div>

        {message && (
          <p className="text-sm text-primary" role="status">
            ✓ {message}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!ok || saving}
          className="bg-primary text-white px-5 py-2.5 rounded-[12px] hover:bg-primary-light transition text-sm font-medium disabled:opacity-50"
        >
          {saving ? "מעדכנת..." : "עדכני סיסמה"}
        </button>
      </form>
    </div>
  );
}

function DangerZone({ deleteAccount, router }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch {
      alert("משהו השתבש במחיקת החשבון. נסי שוב.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white border-2 border-red-200 rounded-[16px] p-6">
      <h2 className="font-semibold text-red-600 mb-2">אזור מסוכן</h2>
      <p className="text-sm text-site-muted mb-4">
        מחיקת החשבון תסיר לצמיתות את כל הנתונים שלך — מועדפים, דירוגים,
        מוצרים, עסק (אם יש). לא ניתן לבטל.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-red-600 text-white px-5 py-2 rounded-[12px] hover:bg-red-700 transition text-sm"
      >
        מחקי חשבון
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-[16px] p-6 max-w-sm w-full"
          >
            <h3 className="font-headline text-lg font-bold text-red-600 mb-2">
              מחיקת חשבון
            </h3>
            <p className="text-sm text-site-muted mb-3">
              פעולה זו בלתי הפיכה — כל הנתונים (מועדפים, דירוגים, עסק) יימחקו לצמיתות. הקלידי <strong>מחק</strong> כדי לאשר.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="מחק"
              className="w-full border border-border rounded-[12px] px-3 py-2 mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmText("");
                }}
                className="flex-1 bg-gray-100 py-2 rounded-[12px] hover:bg-gray-200 transition text-sm"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={confirmText !== "מחק" || deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-[12px] hover:bg-red-700 transition text-sm disabled:opacity-50"
              >
                {deleting ? "מוחקת..." : "מחקי לצמיתות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// העסק שלי
// ---------------------------------------------------------------------------

const STATUS_LABEL = {
  pending: "ממתין לאישור",
  approved: "מאושר",
  blocked: "חסום",
};
const AVAILABILITY_LABEL = {
  available: "פתוח להזמנות",
  full: "עמוס כרגע",
  vacation: "בהפסקה",
};

function BusinessTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/producers/me/dashboard")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="bg-white border border-border rounded-[16px] p-6 text-sm text-site-muted">
        טוענת נתונים...
      </p>
    );
  }
  if (!data?.producer) {
    return (
      <p className="bg-white border border-border rounded-[16px] p-6 text-sm text-site-muted">
        לא הצלחנו לטעון את נתוני העסק.
      </p>
    );
  }

  const { producer } = data;
  const status = producer.status || "pending";
  const availability = producer.availability_status || "available";

  return (
    <section
      role="tabpanel"
      aria-label="העסק שלי"
      className="space-y-4"
    >
      <div className="bg-white border border-border rounded-[16px] p-6">
        <p className="text-sm text-site-muted mb-1">העסק שלך</p>
        <h2 className="font-headline text-2xl font-bold text-site-text mb-3">
          {producer.name}
        </h2>
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center text-xs px-3 py-1 rounded-full bg-light text-primary border border-primary/20">
            סטטוס: {STATUS_LABEL[status] || status}
          </span>
          <span className="inline-flex items-center text-xs px-3 py-1 rounded-full bg-light text-site-text border border-border">
            זמינות: {AVAILABILITY_LABEL[availability] || availability}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatCard label="מועדפים" value={data.favorites_count ?? 0} />
          <StatCard label="צפיות 30 ימים" value={data.views_30d ?? 0} />
          <StatCard label="WhatsApp שבוע" value={data.whatsapp_clicks_week ?? 0} />
        </div>
      </div>

      <ProductsSection />

      <Link
        href="/producer/dashboard"
        className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-[12px] hover:bg-primary-light transition font-medium"
      >
        ניהול מלא ←
      </Link>
    </section>
  );
}

function ProductsSection() {
  const [products, setProducts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", price_range: "", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/producers/me/products")
      .then((r) => setProducts(r.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, image_url: r.data.url }));
    } catch {
      setError("שגיאה בהעלאת תמונה");
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("שם המוצר הוא שדה חובה"); return; }
    setSaving(true);
    setError("");
    try {
      const r = await api.post("/producers/me/products", form);
      setProducts((p) => [...(p || []), r.data]);
      setForm({ name: "", description: "", price_range: "", image_url: "" });
      setAdding(false);
    } catch {
      setError("שגיאה בשמירת המוצר");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/producers/me/products/${id}`);
      setProducts((p) => p.filter((pr) => pr.id !== id));
    } catch {
      setError("שגיאה במחיקת המוצר");
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-border rounded-[16px] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline text-lg font-bold text-site-text">מוצרים</h3>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setError(""); }}
            className="inline-flex items-center gap-1.5 text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition"
          >
            <Plus size={14} aria-hidden="true" />
            הוסיפי מוצר
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {products?.length === 0 && !adding && (
        <p className="text-sm text-site-muted">טרם הוספת מוצרים לפרופיל.</p>
      )}

      <div className="space-y-3 mb-4">
        {products?.map((product) => (
          <div key={product.id} className="flex items-center gap-3 p-3 rounded-[10px] bg-light">
            {product.image_url ? (
              <div className="relative w-12 h-12 shrink-0 rounded-[6px] overflow-hidden">
                <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="48px" />
              </div>
            ) : (
              <div className="w-12 h-12 shrink-0 rounded-[6px] bg-white border border-border flex items-center justify-center">
                <Package size={20} className="text-site-muted/60" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-site-text truncate">{product.name}</p>
              {product.price_range && <p className="text-xs text-accent">{product.price_range}</p>}
            </div>
            <button
              onClick={() => handleDelete(product.id)}
              aria-label={`מחקי ${product.name}`}
              className="p-1.5 rounded-[6px] text-site-muted hover:text-red-500 hover:bg-red-50 transition"
            >
              <Trash size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="border border-border rounded-[10px] p-4 space-y-3 bg-light">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-site-text">מוצר חדש</p>
            <button type="button" onClick={() => { setAdding(false); setError(""); }} aria-label="ביטול">
              <X size={16} className="text-site-muted" aria-hidden="true" />
            </button>
          </div>
          <input
            required
            placeholder="שם המוצר *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
          />
          <input
            placeholder="תיאור קצר"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
          />
          <input
            placeholder="טווח מחיר (לדוג׳ ₪35–50)"
            value={form.price_range}
            onChange={(e) => setForm((f) => ({ ...f, price_range: e.target.value }))}
            className="w-full border border-border rounded-[8px] px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
          />
          <div>
            <label className="text-xs text-site-muted mb-1 block">תמונת מוצר</label>
            {form.image_url ? (
              <div className="flex items-center gap-2">
                <div className="relative w-12 h-12 rounded-[6px] overflow-hidden shrink-0">
                  <Image src={form.image_url} alt="תמונה" fill className="object-cover" sizes="48px" />
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                  className="text-xs text-red-500 hover:underline"
                >
                  הסר
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-primary border border-primary/30 rounded-[8px] px-3 py-1.5 hover:bg-primary/5 transition">
                <Package size={14} aria-hidden="true" />
                {uploading ? "מעלה..." : "העלי תמונה"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 bg-primary text-white rounded-[8px] py-2 text-sm font-medium hover:bg-primary-light transition disabled:opacity-50"
            >
              {saving ? "שומרת..." : "שמור מוצר"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-light rounded-[12px] p-3 text-center">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-xs text-site-muted mt-0.5">{label}</div>
    </div>
  );
}
