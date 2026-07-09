"use client";

import { Suspense, useEffect } from "react";
import { useTranslations } from "next-intl";
import AdminProducersImportPreview from "./AdminProducersImportPreview";
import AdminProducersToolbar from "./AdminProducersToolbar";
import AdminProducersTable from "./AdminProducersTable";
import RequestChangesModal from "./RequestChangesModal";
import { useAdminProducers } from "./use-admin-producers";

function SuspenseFallback() {
  const t = useTranslations("admin");
  return <div className="text-muted">{t("common.loading")}</div>;
}

export default function ProducersPageWrapper() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <ProducersAdminPage />
    </Suspense>
  );
}

function PageHeader({ count }) {
  const t = useTranslations("admin");
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">{t("producers.list.title")}</h1>
      <span className="text-sm text-muted">{t("producers.list.records_count", { count })}</span>
    </div>
  );
}

// MEH-1027 Chunk B: producer-delete confirm dialog — replaces the native
// confirm() that guarded DELETE /admin/producers/:id (use-admin-producers.js).
// REUSES: app/[locale]/admin/content/page.js:118 — MEH-1023 Ch.B dialog
// markup + Escape-unless-deleting contract; `deleting` here comes from the
// hook's isBusy(`delete:${id}`) instead of a local flag.
function DeleteConfirmDialog({ confirmDelete, deleting, onConfirm, onCancel }) {
  const t = useTranslations("admin");

  useEffect(() => {
    if (!confirmDelete) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !deleting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete, deleting, onCancel]);

  if (!confirmDelete) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="producer-delete-title"
        className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-start space-y-4"
      >
        <p id="producer-delete-title" className="font-medium text-base">
          {t("producers.table.confirm_delete", { name: confirmDelete.name })}
        </p>
        <div className="flex gap-3 justify-start">
          <button
            disabled={deleting}
            onClick={onConfirm}
            className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? t("producers.table.deleting") : t("common.delete")}
          </button>
          <button
            disabled={deleting}
            onClick={onCancel}
            className="px-4 py-2 rounded-[10px] text-sm border border-border text-muted hover:bg-gray-50 transition disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProducersAdminPage() {
  const h = useAdminProducers();

  return (
    <div className="space-y-5">
      <PageHeader count={h.visible.length} />

      <AdminProducersToolbar
        producerSearch={h.producerSearch}
        setProducerSearch={h.setProducerSearch}
        producerStatus={h.producerStatus}
        setProducerStatus={h.setProducerStatus}
        incompleteOnly={h.incompleteOnly}
        setIncompleteOnly={h.setIncompleteOnly}
        incompleteCount={h.incompleteCount}
        importing={h.importing}
        onSearch={h.loadAllProducers}
        onExport={h.exportExcel}
        onImportFile={h.handleImportFile}
      />

      {h.importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">{h.importError}</div>
      )}

      {h.importPreview && (
        <AdminProducersImportPreview
          preview={h.importPreview}
          importing={h.importing}
          onConfirm={h.confirmImport}
          onCancel={() => h.setImportPreview(null)}
        />
      )}

      <AdminProducersTable
        rows={h.pagedVisible}
        incompleteOnly={h.incompleteOnly}
        storyCardOpenId={h.storyCardOpenId}
        onSetStoryCardOpenId={h.setStoryCardOpenId}
        onQuickApprove={h.quickApprove}
        onRequestChanges={h.openRequestChanges}
        onToggleStatus={h.toggleStatus}
        onToggleAmbassador={h.toggleAmbassador}
        onDeleteProducer={h.deleteProducer}
        onUploadStoryCard={h.handleStoryCardUpload}
        isBusy={h.isBusy}
        page={h.safePage}
        totalPages={h.totalPages}
        perPage={h.perPage}
        onPageChange={h.setPage}
        onPerPageChange={h.handlePerPageChange}
        visibleCount={h.visible.length}
      />

      {/* MEH-1011 Chunk 2: request-changes composer — opened by the row button
          or auto-opened on approve-422 with the gate-matched chip prefilled. */}
      <RequestChangesModal
        producer={h.modalProducer}
        feedback={h.feedback}
        setFeedback={h.setFeedback}
        onClose={h.closeRequestChanges}
        onSubmit={h.submitRequestChanges}
        submitting={h.modalProducer ? h.isBusy(`request-changes:${h.modalProducer.id}`) : false}
      />

      {/* MEH-1027 Chunk B: context-rich delete confirm (was native confirm()). */}
      <DeleteConfirmDialog
        confirmDelete={h.confirmDelete}
        deleting={h.confirmDelete ? h.isBusy(`delete:${h.confirmDelete.id}`) : false}
        onConfirm={h.confirmDeleteProducer}
        onCancel={h.closeDeleteConfirm}
      />
    </div>
  );
}
