"use client";

import { useRef } from "react";
import Link from "next/link";
import { Warning } from "@phosphor-icons/react";

// Phosphor icon size used in this toolbar.
const ICON_SIZE_SM = 16;

function SearchInput({ value, onChange, onSearch }) {
  return (
    <input
      placeholder="חיפוש לפי שם או עיר..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSearch()}
      className="flex-1 border border-border rounded-[12px] px-3 py-2"
    />
  );
}

function StatusSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-border rounded-[12px] px-3 py-2 bg-white"
    >
      <option value="all">כל הסטטוסים</option>
      <option value="approved">פעילים</option>
      <option value="pending">ממתינים</option>
      <option value="inactive">מושהים</option>
      <option value="rejected">נדחו</option>
    </select>
  );
}

function IncompleteToggle({ active, count, onToggle }) {
  const cls = active
    ? "bg-yellow-100 border-yellow-400 text-yellow-800"
    : "bg-white border-border text-text-secondary hover:border-yellow-400";
  return (
    <button
      onClick={() => onToggle((v) => !v)}
      className={`px-4 py-2 rounded-[12px] text-sm border whitespace-nowrap transition ${cls}`}
      title="הצג רק עסקים שחסרים להם פרטים נדרשים"
    >
      <Warning size={ICON_SIZE_SM} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {active ? "הצג הכל" : "פרטים חסרים"}
      {count > 0 && (
        <span className="me-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-yellow-500 text-white text-xs font-bold">
          {count}
        </span>
      )}
    </button>
  );
}

function ToolbarActions({ onExport, onTriggerImport, importing }) {
  return (
    <>
      <button onClick={onExport} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
        📤 ייצוא
      </button>
      <button
        onClick={onTriggerImport}
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
    </>
  );
}

function HiddenFileInput({ inputRef, onPickFile }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".xlsx,.xls,.csv"
      onChange={(e) => {
        const file = e.target.files?.[0];
        // Reset so the user can re-pick the same file (onChange would
        // otherwise not fire for an unchanged value).
        e.target.value = "";
        if (file) onPickFile(file);
      }}
      className="hidden"
    />
  );
}

// Toolbar for the admin producers page.
//
// Owns the hidden file input + its ref locally — neither leaves this
// file. Parent passes a single onImportFile(file: File) callback; the
// toolbar's hidden <input>'s onChange grabs the File and forwards it,
// then resets the input value so the user can re-pick the same file.
export default function AdminProducersToolbar({
  producerSearch, setProducerSearch,
  producerStatus, setProducerStatus,
  incompleteOnly, setIncompleteOnly, incompleteCount,
  importing, onSearch, onExport, onImportFile,
}) {
  const fileInputRef = useRef(null);
  const triggerImport = () => fileInputRef.current?.click();
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <SearchInput value={producerSearch} onChange={setProducerSearch} onSearch={onSearch} />
      <StatusSelect value={producerStatus} onChange={setProducerStatus} />
      <button onClick={() => onSearch()} className="bg-secondary text-white px-4 py-2 rounded-[12px] text-sm">
        חפש
      </button>
      <IncompleteToggle active={incompleteOnly} count={incompleteCount} onToggle={setIncompleteOnly} />
      <ToolbarActions onExport={onExport} onTriggerImport={triggerImport} importing={importing} />
      <HiddenFileInput inputRef={fileInputRef} onPickFile={onImportFile} />
    </div>
  );
}
