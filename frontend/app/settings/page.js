"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

const TABS = [
  { id: "profile", label: "פרופיל" },
  { id: "security", label: "אבטחה" },
  { id: "business", label: "העסק שלי" },
];

export default function SettingsPage() {
  const { user, loading: authLoading, deleteAccount } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("profile");

  // Profile tab
  const [profileForm, setProfileForm] = useState({ name: "", city: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  // Security tab
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({ name: user.name ?? "", city: user.city ?? "", phone: user.phone ?? "" });
    }
  }, [user]);

  if (authLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch("/auth/me", {
        name: profileForm.name,
        city: profileForm.city,
        phone: profileForm.phone,
      });
      showToast("הפרופיל עודכן ✓");
    } catch {
      showToast("שגיאה בשמירת הפרופיל", "error");
    }
    setSavingProfile(false);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) {
      showToast("הסיסמאות אינן תואמות", "error");
      return;
    }
    if (pwForm.new_password.length < 8) {
      showToast("הסיסמה חייבת להכיל לפחות 8 תווים", "error");
      return;
    }
    setSavingPw(true);
    try {
      await api.patch("/auth/me/password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      showToast("הסיסמה עודכנה ✓");
      setPwForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      showToast(err.response?.data?.detail ?? "שגיאה בעדכון הסיסמה", "error");
    }
    setSavingPw(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch {
      showToast("משהו השתבש במחיקת החשבון. נסי שוב.", "error");
    }
    setDeleting(false);
  };

  const inputCls =
    "w-full border border-border rounded-[12px] px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40";

  const visibleTabs = TABS.filter(
    (t) => t.id !== "business" || user.role === "producer" || user.role === "home_producer"
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="font-headline text-2xl font-bold text-site-text mb-6">הגדרות חשבון</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-8">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-site-muted hover:text-site-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === "profile" && (
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-site-text mb-1">שם מלא</label>
            <input
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className={inputCls}
              placeholder="שם מלא"
              dir="rtl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-site-text mb-1">עיר</label>
            <input
              value={profileForm.city}
              onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              className={inputCls}
              placeholder="עיר מגורים"
              dir="rtl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-site-text mb-1">טלפון</label>
            <input
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              className={inputCls}
              placeholder="050-0000000"
              dir="ltr"
              type="tel"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-site-text mb-1">אימייל</label>
            <p className="text-sm text-site-muted py-1" dir="ltr">{user.email}</p>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="w-full bg-primary text-white py-3 rounded-full hover:bg-primary-dark transition font-medium disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {savingProfile ? "שומר..." : "שמור שינויים"}
          </button>
        </form>
      )}

      {/* Security tab */}
      {tab === "security" && (
        <div className="space-y-8">
          {!user.google_id && !user.apple_id && (
            <form onSubmit={savePassword} className="space-y-4">
              <h2 className="font-semibold text-site-text">שינוי סיסמה</h2>
              <input
                type="password"
                value={pwForm.current_password}
                onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
                placeholder="סיסמה נוכחית"
                className={inputCls}
                dir="ltr"
              />
              <input
                type="password"
                value={pwForm.new_password}
                onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                placeholder="סיסמה חדשה (לפחות 8 תווים)"
                className={inputCls}
                dir="ltr"
              />
              <input
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                placeholder="אישור סיסמה חדשה"
                className={inputCls}
                dir="ltr"
              />
              <button
                type="submit"
                disabled={savingPw}
                className="w-full bg-primary text-white py-3 rounded-full hover:bg-primary-dark transition font-medium disabled:opacity-60"
              >
                {savingPw ? "מעדכן..." : "עדכן סיסמה"}
              </button>
            </form>
          )}
          {(user.google_id || user.apple_id) && (
            <p className="text-sm text-site-muted bg-light rounded-[12px] px-4 py-3">
              החשבון שלך מחובר דרך {user.google_id ? "Google" : "Apple"} — שינוי סיסמה לא זמין.
            </p>
          )}

          <div className="border border-red-200 rounded-[16px] p-5">
            <h2 className="font-semibold text-red-600 mb-2">אזור מסוכן</h2>
            <p className="text-sm text-site-muted mb-4">
              מחיקת החשבון תסיר לצמיתות את כל הנתונים שלך — מועדפים, מוצרים, דירוגים ועוד. לא ניתן לבטל.
            </p>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="bg-red-600 text-white px-5 py-2 rounded-full hover:bg-red-700 transition text-sm font-medium"
            >
              מחק חשבון
            </button>
          </div>
        </div>
      )}

      {/* Business tab — producers only */}
      {tab === "business" && (
        <div className="border border-border rounded-[16px] p-5 space-y-3">
          <h2 className="font-semibold text-site-text">פרופיל העסק שלך</h2>
          {user.producer_status === "pending" && (
            <span className="inline-block bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full">
              ממתין לאישור 🌿
            </span>
          )}
          {user.producer_status === "approved" && (
            <span className="inline-block bg-light text-primary text-xs px-3 py-1 rounded-full">
              פעיל ✓
            </span>
          )}
          {user.producer_id && (
            <p>
              <a href={`/producer/${user.producer_id}`} className="text-primary text-sm hover:underline">
                צפה בפרופיל הציבורי ←
              </a>
            </p>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[16px] p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-red-600 mb-3">מחיקת חשבון</h3>
            <p className="text-site-muted text-sm mb-4">
              פעולה זו בלתי הפיכה. כל הנתונים שלך יימחקו לצמיתות.
            </p>
            <p className="text-sm mb-3">
              הקלד <strong>מחק</strong> לאישור:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="הקלד מחק"
              className="w-full border border-border rounded-[12px] px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteDialog(false); setConfirmText(""); }}
                className="flex-1 bg-light py-2 rounded-full hover:bg-border transition text-sm font-medium"
              >
                ביטול
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "מחק" || deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-full hover:bg-red-700 transition text-sm font-medium disabled:opacity-50"
              >
                {deleting ? "מוחק..." : "מחק לצמיתות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
