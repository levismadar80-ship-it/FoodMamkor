"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user, loading: authLoading, deleteAccount } = useAuth();
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  if (authLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch {
      alert("משהו השתבש במחיקת החשבון. נסי שוב בעוד כמה רגעים.");
    }
    setDeleting(false);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-8">הגדרות חשבון</h1>

      <div className="bg-white rounded-[12px] p-6 mb-6">
        <h2 className="font-semibold mb-2">פרטי חשבון</h2>
        <p className="text-text-secondary text-sm">{user.name}</p>
        <p className="text-text-secondary text-sm" dir="ltr">{user.email}</p>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-[12px] p-6 border-2 border-red-200">
        <h2 className="font-semibold text-red-600 mb-2">אזור מסוכן</h2>
        <p className="text-text-secondary text-sm mb-4">
          מחיקת החשבון תסיר לצמיתות את כל הנתונים שלך — מועדפים, מוצרים, דירוגים ועוד. לא ניתן לבטל פעולה זו.
        </p>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="bg-red-600 text-white px-6 py-2 rounded-[12px] hover:bg-red-700 transition text-sm"
        >
          מחק חשבון
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[12px] p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-red-600 mb-3">מחיקת חשבון</h3>
            <p className="text-text-secondary text-sm mb-4">
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
