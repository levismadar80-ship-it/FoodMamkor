"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { useFocusReturn } from "@/lib/use-focus-return";

export default function ReportButton({ producerId }) {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useFocusReturn(showModal);

  if (!user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    try {
      await api.post(`/producers/${producerId}/report`, { reason });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בשליחה");
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-sm text-red-500 hover:text-red-700 transition flex items-center gap-1"
      >
        🚩 דווח על עסק
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="bg-white rounded-[12px] p-6 max-w-md w-full"
          >
            {submitted ? (
              <div className="text-center">
                <p className="text-lg font-semibold mb-2">תודה על הדיווח</p>
                <p className="text-text-secondary mb-4">נבדוק ונטפל תוך 48 שעות.</p>
                <button
                  onClick={() => { setShowModal(false); setSubmitted(false); setReason(""); }}
                  className="bg-primary text-white px-6 py-2 rounded-[12px]"
                >
                  סגור
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3 id="report-dialog-title" className="text-lg font-semibold mb-4">דווח על עסק</h3>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="ספר/י מה הבעיה..."
                  className="w-full border rounded-[12px] p-3 mb-3 resize-none h-24"
                  maxLength={500}
                  required
                />
                {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" className="bg-red-500 text-white px-6 py-2 rounded-[12px] hover:bg-red-600">
                    שלח דיווח
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    ביטול
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
