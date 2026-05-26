"use client";

import { useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";

// Phosphor icon size used in this toolbar.
const ICON_SIZE_SM = 16;

function SearchInput({ value, onChange, onSearch }) {
  const t = useTranslations("admin");
  return (
    <input
      placeholder={t("producers.toolbar.search_placeholder")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSearch()}
      className="flex-1 border border-border rounded-[12px] px-3 py-2"
    />
  );
}

function StatusSelect({ value, onChange }) {
  const t = useTranslations("admin");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-border rounded-[12px] px-3 py-2 bg-white"
    >
      <option value="all">{t("producers.toolbar.all_statuses")}</option>
      <option value="approved">{t("producers.toolbar.active")}</option>
      <option value="pending">{t("producers.toolbar.pending")}</option>
      <option value="inactive">{t("producers.toolbar.suspended")}</option>
      <option value="rejected">{t("producers.toolbar.rejected")}</option>
    </select>
  );
}

function IncompleteToggle({ active, count, onToggle }) {
  const t = useTranslations("admin");
  const cls = active
    ? "bg-yellow-100 border-yellow-400 text-yellow-800"
    : "bg-white border-border text-muted hover:border-yellow-400";
  return (
    <button
      onClick={() => onToggle((v) => !v)}
      className={`px-4 py-2 rounded-[12px] text-sm border whitespace-nowrap transition ${cls}`}
      title={t("producers.toolbar.incomplete_title")}
    >
      <Warning size={ICON_SIZE_SM} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {active ? t("producers.toolbar.show_all") : t("producers.toolbar.incomplete_label")}
      {count > 0 && (
        <span className="me-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-yellow-500 text-white text-xs font-bold">
          {count}
        </span>
      )}
    </button>
  );
}

function ToolbarActions({ onExport, onTriggerImport, importing }) {
  const t = useTranslations("admin");
  return (
    <>
      <button onClick={onExport} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
        {t("producers.toolbar.export")}
      </button>
      <button
        onClick={onTriggerImport}
        disabled={importing}
        className="bg-white border border-primary text-primary px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
      >
        {t("producers.toolbar.import_excel")}
      </button>
      <Link
        href="/admin/producers/new"
        className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm whitespace-nowrap text-center"
      >
        {t("producers.toolbar.new_producer")}
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
  const t = useTranslations("admin");
  const fileInputRef = useRef(null);
  const triggerImport = () => fileInputRef.current?.click();
  return (
    <div className="flex flex-col md:flex-row gap-3">
      <SearchInput value={producerSearch} onChange={setProducerSearch} onSearch={onSearch} />
      <StatusSelect value={producerStatus} onChange={setProducerStatus} />
      <button onClick={() => onSearch()} className="bg-secondary text-white px-4 py-2 rounded-[12px] text-sm">
        {t("common.search")}
      </button>
      <IncompleteToggle active={incompleteOnly} count={incompleteCount} onToggle={setIncompleteOnly} />
      <ToolbarActions onExport={onExport} onTriggerImport={triggerImport} importing={importing} />
      <HiddenFileInput inputRef={fileInputRef} onPickFile={onImportFile} />
    </div>
  );
}
