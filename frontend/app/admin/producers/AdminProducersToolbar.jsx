"use client";

import { useRef } from "react";
import Link from "next/link";
import { Warning } from "@phosphor-icons/react";

// Phosphor icon size used in this toolbar.
const ICON_SIZE_SM = 16;

// Toolbar for the admin producers page.
//
// Owns the hidden file input + its ref locally — neither leaves this
// file. Parent passes a single onImportFile(file: File) callback; the
// toolbar's hidden <input>'s onChange grabs the File and forwards it,
// then resets the input value so the user can re-pick the same file.
//
// Lifted from frontend/app/admin/producers/page.js during the MEH-439
// refactor.
export default function AdminProducersToolbar({
  producerSearch,
  setProducerSearch,
  producerStatus,
  setProducerStatus,
  incompleteOnly,
  setIncompleteOnly,
  incompleteCount,
  importing,
  onSearch,
  onExport,
  onImportFile,
}) {
  const fileInputRef = useRef(null);
  const triggerImport = () => fileInputRef.current?.click();

  return (
    <div className="flex flex-col md:flex-row gap-3">
      <input
        placeholder="חיפוש לפי שם או עיר..."
        value={producerSearch}
        onChange={(e) => setProducerSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
        className="flex-1 border border-border rounded-[12px] px-3 py-2"
      />
      <select
        value={producerStatus}
        onChange={(e) => setProducerStatus(e.target.value)}
        className="border border-border rounded-[12px] px-3 py-2 bg-white"
      >
        <option value="all">כל הסטטוסים</option>
        <option value="approved">פעילים</option>
        <option value="pending">ממתינים</option>
        <option value="inactive">מושהים</option>
        <option value="rejected">נדחו</option>
      </select>
      <button onClick={() => onSearch()} className="bg-secondary text-white px-4 py-2 rounded-[12px] text-sm">
        חפש
      </button>
      <button
        onClick={() => setIncompleteOnly((v) => !v)}
        className={`px-4 py-2 rounded-[12px] text-sm border whitespace-nowrap transition ${
          incompleteOnly
            ? "bg-yellow-100 border-yellow-400 text-yellow-800"
            : "bg-white border-border text-text-secondary hover:border-yellow-400"
        }`}
        title="הצג רק עסקים שחסרים להם פרטים נדרשים"
      >
        <Warning size={ICON_SIZE_SM} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {incompleteOnly ? "הצג הכל" : "פרטים חסרים"}
        {incompleteCount > 0 && (
          <span className="me-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-yellow-500 text-white text-xs font-bold">
            {incompleteCount}
          </span>
        )}
      </button>
      <button onClick={onExport} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
        📤 ייצוא
      </button>
      <button
        onClick={triggerImport}
        disabled={importing}
        className="bg-white border border-primary text-primary px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
      >
        📥 ייבא מ-Excel
      </button>
      <Link
        href="/admin/producers/new"
        className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm whitespace-nowrap text-center"
      >
        + בית עסק חדש
      </Link>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so the user can re-pick the same file (onChange would
          // otherwise not fire for an unchanged value).
          e.target.value = "";
          if (file) onImportFile(file);
        }}
        className="hidden"
      />
    </div>
  );
}
