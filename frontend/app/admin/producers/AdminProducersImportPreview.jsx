"use client";

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

export default function AdminProducersImportPreview({ preview, importing, onConfirm, onCancel }) {
  return (
    <div className="bg-white border border-border rounded-[12px] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">תצוגה מקדימה של הייבוא</h2>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={importing}
            className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
          >
            {importing ? "מייבא..." : `אשר ייבוא (${preview.imported})`}
          </button>
          <button
            onClick={onCancel}
            className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm"
          >
            ביטול
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4 text-center">
        <div className="bg-green-50 rounded-[12px] p-3">
          <p className="text-2xl font-bold text-primary">{preview.imported}</p>
          <p className="text-xs text-text-secondary">לייבוא</p>
        </div>
        <div className="bg-yellow-50 rounded-[12px] p-3">
          <p className="text-2xl font-bold text-yellow-700">{preview.skipped}</p>
          <p className="text-xs text-text-secondary">דולגו</p>
        </div>
        <div className="bg-red-50 rounded-[12px] p-3">
          <p className="text-2xl font-bold text-red-700">{preview.errors}</p>
          <p className="text-xs text-text-secondary">שגיאות</p>
        </div>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto border border-border rounded-[8px]">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-end px-3 py-2">שורה</th>
              <th className="text-end px-3 py-2">שם</th>
              <th className="text-end px-3 py-2">עיר</th>
              <th className="text-end px-3 py-2">קטגוריה</th>
              <th className="text-end px-3 py-2">slug</th>
              <th className="text-end px-3 py-2">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <ImportRow key={row.row_number} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
