"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

const ToastContext = createContext(null);

const STYLES = {
  success: "bg-[#EAF3DE] text-[#27500A] border-[#97C459]",
  error:   "bg-[#FCEBEB] text-[#A32D2D] border-[#F09595]",
  info:    "bg-[#E6F1FB] text-[#0C447C] border-[#85B7EB]",
};

function ToastItem({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`flex items-center justify-between gap-3 border rounded-[10px] px-4 py-3 text-[13px] font-body shadow-md min-w-[220px] max-w-sm ${STYLES[type] ?? STYLES.info}`}
    >
      <span>{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 text-base leading-none">
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* RTL: bottom-left for Hebrew */}
      <div className="fixed bottom-20 left-4 md:bottom-6 z-[9000] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} message={t.message} type={t.type} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
