"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import api from "@/lib/api";

const TABS = [
  { id: "profile", label: "פרופיל" },
  { id: "security", label: "אבטחה" },
  { id: "producer", label: "העסק שלי", producerOnly: true },
];

export default function SettingsPage() {
  const { user, loading: authLoading, deleteAccount } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("profile");

  // Profile tab state
  const [profileForm, setProfileForm] = useState({ name: "", city: "", phone: "" });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Security tab state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  if (authLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  // Pre-fill profile form on first render
  if (!profileLoaded && user) {
    setProfileForm({ name: user.name || "", city: user.city || "", phone: user.phone || "" });
    setProfileLoaded(true);
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch("/auth/me", profileForm);
      toast("הפרופיל עודכן בהצלחה", "success");
    } catch {
      toast("שגיאה בשמירת הפרופיל. נסי שוב.", "error");
    }
    setSavingProfile(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast("הסיסמה חייבת להכיל לפחות 6 תווים", "error");
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch("/auth/me", { current_password: currentPassword, new_password: newPassword });
      toast("הסיסמה שונתה בהצלחה", "success");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast(err.response?.data?.detail || "שגיאה בשינוי הסיסמה", "error");
    }
    setSavingPassword(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch {
      toast("שגיאה במחיקת החשבון. נסי שוב.", "error");
    }
    setDeleting(false);
  };

  const visibleTabs = TABS.filter((t) => !t.producerOnly || user.role === "producer");

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">הגדרות חשבון</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-[12px] p-1 mb-8">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-[10px] transition ${
              activeTab === tab.id
                ? "bg-white text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Profile */}
      {activeTab === "profile" && (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-[12px] p-6 space-y-4">
          <h2 className="font-semibold mb-1">פרטים אישיים</h2>
          <div>
            <label className="block text-sm text-text-secondary mb-1">שם מלא</label>
            <input
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">עיר</label>
            <input
              value={profileForm.city}
              onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">טלפון</label>
            <input
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              dir="ltr"
              className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">אימייל</label>
            <input
              value={user.email}
              disabled
              dir="ltr"
              className="w-full border border-border rounded-[12px] px-3 py-2 bg-gray-50 text-text-secondary"
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="w-full bg-primary text-white py-2 rounded-[12px] hover:bg-primary-dark transition disabled:opacity-50"
          >
            {savingProfile ? "שומר..." : "שמור שינויים"}
          </button>
        </form>
      )}

      {/* Tab: Security */}
      {activeTab === "security" && (
        <div className="space-y-6">
          {!user.google_id && !user.apple_id && (
            <form onSubmit={handleChangePassword} className="bg-white rounded-[12px] p-6 space-y-4">
              <h2 className="font-semibold">שינוי סיסמה</h2>
              <div>
                <label className="block text-sm text-text-secondary mb-1">סיסמה נוכחית</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  dir="ltr"
                  className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">סיסמה חדשה</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  dir="ltr"
                  className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword}
                className="w-full bg-primary text-white py-2 rounded-[12px] hover:bg-primary-dark transition disabled:opacity-50"
              >
                {savingPassword ? "משנה..." : "שנה סיסמה"}
              </button>
            </form>
          )}

          {(user.google_id || user.apple_id) && (
            <div className="bg-white rounded-[12px] p-6 text-sm text-text-secondary">
              החשבון שלך מחובר דרך {user.google_id ? "Google" : "Apple"} — לא ניתן לשנות סיסמה.
            </div>
          )}

          <div className="bg-white rounded-[12px] p-6 border-2 border-red-200">
            <h2 className="font-semibold text-red-600 mb-2">אזור מסוכן</h2>
            <p className="text-text-secondary text-sm mb-4">
              מחיקת החשבון תסיר לצמיתות את כל הנתונים שלך. לא ניתן לבטל פעולה זו.
            </p>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="bg-red-600 text-white px-6 py-2 rounded-[12px] hover:bg-red-700 transition text-sm"
            >
              מחק חשבון
            </button>
          </div>
        </div>
      )}

      {/* Tab: Producer */}
      {activeTab === "producer" && user.role === "producer" && (
        <div className="bg-white rounded-[12px] p-6 space-y-4">
          <h2 className="font-semibold">העסק שלי</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">סטטוס:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              user.producer?.status === "approved"
                ? "bg-light text-primary"
                : user.producer?.status === "pending"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-red-100 text-red-600"
            }`}>
              {user.producer?.status === "approved" ? "מאושר ✓"
                : user.producer?.status === "pending" ? "ממתין לאישור 🌿"
                : user.producer?.status === "rejected" ? "נדחה"
                : "לא ידוע"}
            </span>
          </div>
          {user.producer?.status === "pending" && (
            <p className="text-sm text-text-secondary">
              הפרופיל שלך ממתין לאישור הצוות. בדרך כלל עד 48 שעות.
            </p>
          )}
          {user.producer_id && (
            <Link
              href={`/producer/${user.producer_id}`}
              className="inline-block bg-primary text-white px-5 py-2 rounded-[12px] hover:bg-primary-dark transition text-sm"
            >
              צפי בפרופיל העסק ←
            </Link>
          )}
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[12px] p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-red-600 mb-3">מחיקת חשבון</h3>
            <p className="text-text-secondary text-sm mb-4">
              פעולה זו בלתי הפיכה. כל הנתונים יימחקו לצמיתות.
            </p>
            <p className="text-sm mb-3">הקלד <strong>מחק</strong> לאישור:</p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="הקלד מחק"
              className="w-full border rounded-[12px] px-3 py-2 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteDialog(false); setConfirmText(""); }}
                className="flex-1 bg-gray-100 py-2 rounded-[12px] hover:bg-gray-200 transition text-sm"
              >
                ביטול
              </button>
              <button
                onClick={handleDelete}
                disabled={confirmText !== "מחק" || deleting}
                className="flex-1 bg-red-600 text-white py-2 rounded-[12px] hover:bg-red-700 transition text-sm disabled:opacity-50"
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
