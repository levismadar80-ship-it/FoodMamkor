"use client";

import { useTranslations } from "next-intl";

// Import preview panel for the admin producers page.
//
// Pure presentation — receives the dry-run server response and the
// importing flag, plus two callbacks (confirm / cancel). No internal
// state, no API calls. Lifted from frontend/app/admin/producers/page.js
// during the MEH-439 refactor.

function ImportRow({ row }) {
  const hasErrors = row.errors.length > 0;
  const hasWarnings = row.warnings.length > 0;
  const rowClass = hasErrors
    ? "border-t bg-red-50"
    : hasWarnings
      ? "border-t bg-yellow-50"
      : "border-t";
  return (
    <tr className={rowClass}>
      <td className="px-3 py-2">{row.row_number}</td>
      <td className="px-3 py-2">{row.data.name || "—"}</td>
      <td className="px-3 py-2">{row.data.city || "—"}</td>
      <td className="px-3 py-2">{row.data.category_name || "—"}</td>
      <td className="px-3 py-2 font-mono text-xs">{row.data.slug || "—"}</td>
      <td className="px-3 py-2 text-xs">
        {hasErrors && <span className="text-red-700">{row.errors.join(", ")}</span>}
        {!hasErrors && hasWarnings && <span className="text-yellow-700">{row.warnings.join(", ")}</span>}
        {!hasErrors && !hasWarnings && <span className="text-primary">✓</span>}
      </td>
    </tr>
  );
}

function PreviewHeader({ importing, onConfirm, onCancel, importedCount }) {
  const t = useTranslations("admin");
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-semibold text-lg">{t("producers.preview.title")}</h2>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={importing}
          className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
        >
          {importing ? t("producers.preview.importing") : t("producers.preview.confirm", { count: importedCount })}
        </button>
        <button onClick={onCancel} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function PreviewStats({ preview }) {
  const t = useTranslations("admin");
  return (
    <div className="grid grid-cols-3 gap-3 mb-4 text-center">
      <div className="bg-green-50 rounded-[12px] p-3">
        <p className="text-2xl font-bold text-primary">{preview.imported}</p>
        <p className="text-xs text-text-secondary">{t("producers.preview.stats.to_import")}</p>
      </div>
      <div className="bg-yellow-50 rounded-[12px] p-3">
        <p className="text-2xl font-bold text-yellow-700">{preview.skipped}</p>
        <p className="text-xs text-text-secondary">{t("producers.preview.stats.skipped")}</p>
      </div>
      <div className="bg-red-50 rounded-[12px] p-3">
        <p className="text-2xl font-bold text-red-700">{preview.errors}</p>
        <p className="text-xs text-text-secondary">{t("producers.preview.stats.errors")}</p>
      </div>
    </div>
  );
}

function PreviewTable({ rows }) {
  const t = useTranslations("admin");
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto border border-border rounded-[8px]">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="text-end px-3 py-2">{t("producers.preview.table.row")}</th>
            <th className="text-end px-3 py-2">{t("producers.preview.table.name")}</th>
            <th className="text-end px-3 py-2">{t("producers.preview.table.city")}</th>
            <th className="text-end px-3 py-2">{t("producers.preview.table.category")}</th>
            <th className="text-end px-3 py-2">{t("producers.preview.table.slug")}</th>
            <th className="text-end px-3 py-2">{t("producers.preview.table.status")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <ImportRow key={row.row_number} row={row} />)}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminProducersImportPreview({ preview, importing, onConfirm, onCancel }) {
  return (
    <div className="bg-white border border-border rounded-[12px] p-5">
      <PreviewHeader
        importing={importing}
        onConfirm={onConfirm}
        onCancel={onCancel}
        importedCount={preview.imported}
      />
      <PreviewStats preview={preview} />
      <PreviewTable rows={preview.rows} />
    </div>
  );
}
