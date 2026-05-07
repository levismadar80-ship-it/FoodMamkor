"use client";

import { Suspense } from "react";
import AdminProducersImportPreview from "./AdminProducersImportPreview";
import AdminProducersToolbar from "./AdminProducersToolbar";
import AdminProducersTable from "./AdminProducersTable";
import { useAdminProducers } from "./use-admin-producers";

export default function ProducersPageWrapper() {
  return (
    <Suspense fallback={<div className="text-text-secondary">טוען...</div>}>
      <ProducersAdminPage />
    </Suspense>
  );
}

function PageHeader({ count }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">בתי עסק</h1>
      <span className="text-sm text-text-secondary">{count} רשומות</span>
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
        onToggleStatus={h.toggleStatus}
        onToggleAmbassador={h.toggleAmbassador}
        onDeleteProducer={h.deleteProducer}
        onUploadStoryCard={h.handleStoryCardUpload}
        page={h.safePage}
        totalPages={h.totalPages}
        perPage={h.perPage}
        onPageChange={h.setPage}
        onPerPageChange={h.handlePerPageChange}
        visibleCount={h.visible.length}
      />
    </div>
  );
}
